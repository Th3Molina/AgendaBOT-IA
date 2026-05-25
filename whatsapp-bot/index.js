import 'dotenv/config';
import { fileURLToPath } from 'url';
import { dirname, join }  from 'path';
import { existsSync, mkdirSync } from 'fs';
import http from 'http';
import QRCode from 'qrcode';

const __dir = dirname(fileURLToPath(import.meta.url));

import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  isJidBroadcast,
} from '@whiskeysockets/baileys';
import pino   from 'pino';

import { askGemini, buildBotPrompt } from './lib/gemini.js';
import { getAppointments, addAppointment, removeAppointment } from './lib/agenda.js';

// ── Config ────────────────────────────────────────────────────────────────────
const AUTH_DIR  = join(__dir, 'auth_info');
const BOT_NAME  = process.env.BOT_NAME || 'Ayla';
const ALLOWED   = (process.env.ALLOWED_NUMBERS || '').split(',').map(s => s.trim()).filter(Boolean);
const PORT      = process.env.PORT || 3000;
const logger    = pino({ level: 'silent' });

if (!existsSync(AUTH_DIR)) mkdirSync(AUTH_DIR, { recursive: true });

// ── QR Code via HTTP ──────────────────────────────────────────────────────────
let currentQR    = null;
let isConnected  = false;
let connectedNum = '';

const server = http.createServer(async (req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');

  if (isConnected) {
    res.end(`<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Ayla Bot</title>
<style>body{font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#f0fdf4;}
.box{text-align:center;background:#fff;padding:40px;border-radius:20px;box-shadow:0 4px 20px rgba(0,0,0,0.1);}
h1{color:#0d3d2e;}p{color:#16a34a;font-size:18px;font-weight:bold;}</style>
</head><body><div class="box">
<h1>✅ Ayla está online!</h1>
<p>📞 Número: ${connectedNum}</p>
<p style="color:#64748b;font-weight:normal">O bot está rodando e pronto para receber mensagens.</p>
</div></body></html>`);
    return;
  }

  if (!currentQR) {
    res.end(`<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Ayla Bot</title>
<meta http-equiv="refresh" content="3">
<style>body{font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#f0fdf4;}
.box{text-align:center;background:#fff;padding:40px;border-radius:20px;box-shadow:0 4px 20px rgba(0,0,0,0.1);}
h1{color:#0d3d2e;}</style>
</head><body><div class="box">
<h1>⏳ Iniciando Ayla...</h1>
<p>Aguarde, o QR Code vai aparecer em instantes.</p>
<p style="color:#94a3b8;font-size:12px">Esta página atualiza automaticamente a cada 3 segundos</p>
</div></body></html>`);
    return;
  }

  try {
    const qrImage = await QRCode.toDataURL(currentQR, { width: 300, margin: 2 });
    res.end(`<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Ayla — Escanear QR</title>
<meta http-equiv="refresh" content="30">
<style>body{font-family:sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#f0fdf4;}
.box{text-align:center;background:#fff;padding:40px;border-radius:20px;box-shadow:0 4px 20px rgba(0,0,0,0.1);max-width:400px;}
h1{color:#0d3d2e;margin-bottom:8px;}
img{border:3px solid #0d3d2e;border-radius:12px;margin:20px 0;}
.steps{text-align:left;background:#f8fafc;border-radius:12px;padding:16px;margin-top:16px;}
.steps p{margin:6px 0;color:#374151;font-size:14px;}
.badge{background:#25D366;color:#fff;border-radius:20px;padding:4px 12px;font-size:13px;font-weight:bold;}</style>
</head><body><div class="box">
<span class="badge">📱 WhatsApp</span>
<h1>Conectar Ayla</h1>
<p style="color:#64748b;font-size:14px">Escaneie o QR Code abaixo</p>
<img src="${qrImage}" alt="QR Code" />
<div class="steps">
  <p><strong>Android:</strong> Menu ⋮ → Aparelhos conectados → Conectar aparelho</p>
  <p><strong>iPhone:</strong> Ajustes → Aparelhos conectados → Conectar aparelho</p>
</div>
<p style="color:#94a3b8;font-size:12px;margin-top:16px">⏱️ QR expira em 60s — página atualiza automaticamente</p>
</div></body></html>`);
  } catch {
    res.end('<p>Erro ao gerar QR. Recarregue a página.</p>');
  }
});

server.listen(PORT, () => {
  console.log(`🌐 Servidor QR rodando na porta ${PORT}`);
});

// ── Anti-spam ─────────────────────────────────────────────────────────────────
const lastMsg  = new Map();
const COOLDOWN = 2000;
function canRespond(jid) {
  const last = lastMsg.get(jid) || 0;
  if (Date.now() - last < COOLDOWN) return false;
  lastMsg.set(jid, Date.now());
  return true;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const pad   = n => String(n).padStart(2, '0');
const toISO = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const getPhone = jid => jid.replace(/[@:].*/, '').replace(/\D/g, '');
const isAllowed = jid => {
  if (!ALLOWED.length) return true;
  const phone = getPhone(jid);
  return ALLOWED.some(n => n === phone || n === jid);
};

// ── Handler principal ─────────────────────────────────────────────────────────
async function handleMessage(sock, msg) {
  try {
    const jid = msg.key.remoteJid;
    if (!jid || isJidBroadcast(jid) || jid === 'status@broadcast') return;
    if (msg.key.fromMe) return;

    const body =
      msg.message?.conversation ||
      msg.message?.extendedTextMessage?.text ||
      msg.message?.imageMessage?.caption || '';

    if (!body.trim())    return;
    if (!canRespond(jid)) return;
    if (!isAllowed(jid))  return;

    const phone  = getPhone(jid);
    const userId = `wa-${phone}`;

    console.log(`[${new Date().toLocaleTimeString('pt-BR')}] 📩 ${phone}: ${body.slice(0, 80)}`);

    await sock.sendPresenceUpdate('composing', jid);

    const now         = new Date();
    const todayISO    = toISO(now);
    const tomorrowISO = toISO(new Date(now.getTime() + 86400000));
    const appointments = await getAppointments(userId);
    const systemPrompt = buildBotPrompt(appointments, todayISO, tomorrowISO, phone);

    let result;
    try {
      result = await askGemini(systemPrompt, body);
    } catch (err) {
      console.error('Groq error:', err.message);
      result = { message: '⚠️ Ops, tive um probleminha! Tente novamente. 😊', action: 'none' };
    }

    if (result.action === 'add' && result.appointment?.title) {
      try {
        const saved = await addAppointment(userId, result.appointment);
        console.log(`  ✅ Agendado: "${saved.title}" em ${saved.date} ${saved.time}`);
      } catch (err) {
        console.error('  ❌ Erro ao salvar:', err.message);
        result.message += '\n\n⚠️ _Não consegui salvar. Tente novamente._';
      }
    } else if (result.action === 'remove' && result.removeId) {
      try {
        await removeAppointment(userId, result.removeId);
        console.log(`  🗑️ Removido ID ${result.removeId}`);
      } catch (err) {
        console.error('  ❌ Erro ao remover:', err.message);
        result.message += '\n\n⚠️ _Não consegui remover. Tente novamente._';
      }
    }

    await sock.sendMessage(jid, { text: result.message || 'Pode repetir? 😊' });
    await sock.sendPresenceUpdate('paused', jid);
    console.log(`  💬 Ayla respondeu (ação: ${result.action || 'none'})`);

  } catch (err) {
    console.error('Erro handleMessage:', err.message);
  }
}

// ── Conexão Baileys ───────────────────────────────────────────────────────────
async function conectar() {
  const { version } = await fetchLatestBaileysVersion();
  console.log(`\n🤖 ${BOT_NAME} iniciando — Baileys v${version.join('.')}`);
  console.log('─'.repeat(45));

  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);

  const sock = makeWASocket({
    version,
    logger,
    auth: {
      creds: state.creds,
      keys:  makeCacheableSignalKeyStore(state.keys, logger),
    },
    printQRInTerminal:              false,
    generateHighQualityLinkPreview: false,
    syncFullHistory:                false,
    browser: [BOT_NAME, 'Chrome', '120.0.0'],
  });

  sock.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
    if (qr) {
      currentQR   = qr;
      isConnected = false;
      console.log(`\n📱 QR disponível! Acesse a URL do Railway para escanear.\n`);
    }

    if (connection === 'open') {
      currentQR    = null;
      isConnected  = true;
      connectedNum = sock.user?.id?.split(':')[0] || '';
      console.log(`\n✅ ${BOT_NAME} conectada! Número: ${connectedNum}`);
      if (ALLOWED.length) console.log(`🔒 Restrito a: ${ALLOWED.join(', ')}`);
      console.log('Aguardando mensagens...\n');
    }

    if (connection === 'close') {
      isConnected = false;
      const reason     = lastDisconnect?.error?.output?.statusCode;
      const reconectar = reason !== DisconnectReason.loggedOut;
      console.log(`⚠️  Desconectado (${reason}). Reconectando: ${reconectar}`);
      if (reconectar) {
        await new Promise(r => setTimeout(r, 3000));
        conectar();
      } else {
        console.log('🔴 Logout detectado. Delete auth_info e reinicie.');
        process.exit(1);
      }
    }
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;
    for (const msg of messages) {
      if (!msg.message) continue;
      await handleMessage(sock, msg);
    }
  });

  return sock;
}

process.on('SIGINT',  () => { console.log('\n👋 Ayla encerrada.'); process.exit(0); });
process.on('SIGTERM', () => { console.log('\n👋 Ayla encerrada.'); process.exit(0); });

conectar().catch(err => {
  console.error('Erro fatal:', err);
  process.exit(1);
});
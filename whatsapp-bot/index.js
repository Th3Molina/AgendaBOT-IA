import 'dotenv/config';
import { fileURLToPath } from 'url';
import { dirname, join }  from 'path';
import { existsSync, mkdirSync } from 'fs';

const __dir = dirname(fileURLToPath(import.meta.url));

import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  isJidBroadcast,
} from '@whiskeysockets/baileys';
import pino    from 'pino';
import qrcode  from 'qrcode-terminal';

import { askGemini, buildBotPrompt } from './lib/gemini.js';
import { getAppointments, addAppointment, removeAppointment } from './lib/agenda.js';

// ── Config ────────────────────────────────────────────────────────────────────
const AUTH_DIR  = join(__dir, 'auth_info');
const BOT_NAME  = process.env.BOT_NAME || 'Ayla';
const ALLOWED   = (process.env.ALLOWED_NUMBERS || '').split(',').map(s => s.trim()).filter(Boolean);
const logger    = pino({ level: 'silent' });

if (!existsSync(AUTH_DIR)) mkdirSync(AUTH_DIR, { recursive: true });

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

function getPhone(jid) {
  return jid.replace(/[@:].*/, '').replace(/\D/g, '');
}

function isAllowed(jid) {
  if (!ALLOWED.length) return true;
  const phone = getPhone(jid);
  return ALLOWED.some(n => n === phone || n === jid);
}

// ── Handler principal — TUDO passa pela Ayla (IA) ────────────────────────────
async function handleMessage(sock, msg) {
  try {
    const jid = msg.key.remoteJid;
    if (!jid || isJidBroadcast(jid) || jid === 'status@broadcast') return;
    if (msg.key.fromMe) return;

    const body =
      msg.message?.conversation ||
      msg.message?.extendedTextMessage?.text ||
      msg.message?.imageMessage?.caption ||
      '';

    if (!body.trim())   return;
    if (!canRespond(jid)) return;
    if (!isAllowed(jid))  return;

    const phone  = getPhone(jid);
    const userId = `wa-${phone}`;

    console.log(`[${new Date().toLocaleTimeString('pt-BR')}] 📩 ${phone}: ${body.slice(0, 80)}`);

    // Mostra "digitando..."
    await sock.sendPresenceUpdate('composing', jid);

    // Busca agenda do usuário
    const now          = new Date();
    const todayISO     = toISO(now);
    const tomorrowISO  = toISO(new Date(now.getTime() + 86400000));
    const appointments = await getAppointments(userId);

    // Monta prompt e chama a Ayla
    const systemPrompt = buildBotPrompt(appointments, todayISO, tomorrowISO, phone);

    let result;
    try {
      result = await askGemini(systemPrompt, body);
    } catch (err) {
      console.error('Groq error:', err.message);
      result = {
        message: '⚠️ Ops, tive um probleminha aqui! Tente novamente em instantes. 😊',
        action:  'none',
      };
    }

    // Aplica ação no banco
    if (result.action === 'add' && result.appointment?.title) {
      try {
        const saved = await addAppointment(userId, result.appointment);
        console.log(`  ✅ Agendado: "${saved.title}" em ${saved.date} ${saved.time}`);
      } catch (err) {
        console.error('  ❌ Erro ao salvar:', err.message);
        result.message += '\n\n⚠️ _Não consegui salvar na agenda. Tente novamente._';
      }

    } else if (result.action === 'remove' && result.removeId) {
      try {
        await removeAppointment(userId, result.removeId);
        console.log(`  🗑️ Removido: ID ${result.removeId}`);
      } catch (err) {
        console.error('  ❌ Erro ao remover:', err.message);
        result.message += '\n\n⚠️ _Não consegui remover. Tente novamente._';
      }
    }

    // Envia resposta
    const texto = result.message || 'Pode repetir? Não entendi bem. 😊';
    await sock.sendMessage(jid, { text: texto });
    await sock.sendPresenceUpdate('paused', jid);

    console.log(`  💬 Ayla respondeu (ação: ${result.action || 'none'})`);

  } catch (err) {
    console.error('Erro no handleMessage:', err.message);
  }
}

// ── Conexão Baileys ───────────────────────────────────────────────────────────
async function conectar() {
  const { version } = await fetchLatestBaileysVersion();
  console.log(`\n🤖 ${BOT_NAME} iniciando...`);
  console.log(`📦 Baileys v${version.join('.')}`);
  console.log('─'.repeat(45));

  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);

  const sock = makeWASocket({
    version,
    logger,
    auth: {
      creds: state.creds,
      keys:  makeCacheableSignalKeyStore(state.keys, logger),
    },
    printQRInTerminal:             false,
    generateHighQualityLinkPreview: false,
    syncFullHistory:               false,
    browser: [BOT_NAME, 'Chrome', '120.0.0'],
  });

  // QR Code
  sock.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
    if (qr) {
      console.log('\n📱 Escaneie o QR Code com seu WhatsApp:\n');
      qrcode.generate(qr, { small: true });
      console.log('\nWhatsApp > Aparelhos Conectados > Conectar aparelho\n');
    }

    if (connection === 'open') {
      console.log(`\n✅ ${BOT_NAME} conectada com sucesso!`);
      console.log(`📞 Número: ${sock.user?.id?.split(':')[0]}`);
      if (ALLOWED.length) console.log(`🔒 Restrito a: ${ALLOWED.join(', ')}`);
      else                console.log('🌐 Aceitando mensagens de qualquer número.');
      console.log('─'.repeat(45));
      console.log('Aguardando mensagens...\n');
    }

    if (connection === 'close') {
      const reason        = lastDisconnect?.error?.output?.statusCode;
      const reconectar    = reason !== DisconnectReason.loggedOut;
      console.log(`⚠️  Desconectado (${reason}). Reconectando: ${reconectar}`);
      if (reconectar) {
        await new Promise(r => setTimeout(r, 3000));
        conectar();
      } else {
        console.log('🔴 Sessão encerrada. Delete a pasta auth_info e reinicie.');
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
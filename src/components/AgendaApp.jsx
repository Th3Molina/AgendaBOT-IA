'use client';
import { useState, useEffect, useRef, useCallback } from 'react';

// ── Constants ─────────────────────────────────────────────────────────────────
const USER_ID = process.env.NEXT_PUBLIC_DEFAULT_USER || 'web-user';

const CATS = {
  medico:   { color: '#ef4444', bg: '#fef2f2', dark: '#991b1b', emoji: '🏥', label: 'Médico'   },
  trabalho: { color: '#3b82f6', bg: '#eff6ff', dark: '#1e40af', emoji: '💼', label: 'Trabalho' },
  pessoal:  { color: '#8b5cf6', bg: '#f5f3ff', dark: '#5b21b6', emoji: '👤', label: 'Pessoal'  },
  social:   { color: '#f59e0b', bg: '#fffbeb', dark: '#92400e', emoji: '🎉', label: 'Social'   },
  outro:    { color: '#64748b', bg: '#f8fafc', dark: '#1e293b', emoji: '📌', label: 'Outro'    },
};
const CAT_KEYS = Object.keys(CATS);

const MONTHS_PT  = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
const WD_LETTERS = ['D','S','T','Q','Q','S','S'];

// ── Helpers ───────────────────────────────────────────────────────────────────
const pad   = n => String(n).padStart(2, '0');
const toISO = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;

function parseISO(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function addOneHour(t) {
  if (!t) return '10:00';
  const [h, m] = t.split(':').map(Number);
  return `${pad(Math.min(h + 1, 23))}:${pad(m)}`;
}

function fmtTs(ts) {
  return new Date(ts).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function dayLabel(iso, todayISO) {
  if (iso === todayISO) return 'Hoje';
  const tmr = new Date(); tmr.setDate(tmr.getDate() + 1);
  if (iso === toISO(tmr)) return 'Amanhã';
  return parseISO(iso).toLocaleDateString('pt-BR', { weekday: 'short', day: 'numeric', month: 'short' });
}

function sortApts(arr) {
  return [...arr].sort((a, b) =>
    a.date === b.date ? a.time.localeCompare(b.time) : a.date.localeCompare(b.date)
  );
}

// ── MsgText: renderiza bold/italic estilo WhatsApp ────────────────────────────
function MsgText({ text }) {
  if (!text) return null;
  return (
    <>
      {String(text).split('\n').map((line, i) => {
        const parts = line.split(/(\*[^*]+\*|_[^_]+_)/g).map((p, j) => {
          if (p.startsWith('*') && p.endsWith('*')) return <strong key={j}>{p.slice(1, -1)}</strong>;
          if (p.startsWith('_') && p.endsWith('_')) return <em key={j}>{p.slice(1, -1)}</em>;
          return p;
        });
        return <div key={i} style={{ minHeight: line ? undefined : '0.5em' }}>{parts}</div>;
      })}
    </>
  );
}

// ── WELCOME MESSAGE ──────────────────────────────────────────────────────────
const WELCOME_MSG = {
  id: 'welcome-1',
  role: 'bot',
  text: '👋 Olá! Sou a *Agenda IA*.\n\nPosso te ajudar a:\n\n• Adicionar: _"consulta médica amanhã às 14h"_\n• Ver agenda: _"o que tenho hoje?"_\n• Verificar: _"estou livre quinta de tarde?"_\n• Cancelar: _"cancelar reunião de segunda"_\n\nComo posso ajudar?',
  ts: new Date().toISOString(),
};

// ════════════════════════════════════════════════════════════════════════════
// COMPONENTE PRINCIPAL
// ════════════════════════════════════════════════════════════════════════════
export default function AgendaApp() {
  const today    = new Date();
  const todayISO = toISO(today);

  // Estado
  const [appointments, setAppointments] = useState([]);
  const [messages,     setMessages]     = useState([WELCOME_MSG]);
  const [input,        setInput]        = useState('');
  const [calBase,      setCalBase]      = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [selDate,      setSelDate]      = useState(today);
  const [loading,      setLoading]      = useState({ apts: false, ai: false });
  const [showAdd,      setShowAdd]      = useState(false);
  const [mobileTab,    setMobileTab]    = useState('agenda');
  const [form,         setForm]         = useState({
    title: '', date: todayISO, time: '09:00', end_time: '10:00', category: 'pessoal', description: '',
  });
  const [formErr, setFormErr] = useState('');

  const endRef = useRef(null);
  const inpRef = useRef(null);

  // ── Fetch appointments ──────────────────────────────────────────────────
  const fetchApts = useCallback(async () => {
    setLoading(l => ({ ...l, apts: true }));
    try {
      const from = todayISO;
      const to   = toISO(new Date(today.getTime() + 60 * 86400000));
      const res  = await fetch(`/api/appointments?user_id=${USER_ID}&from=${from}&to=${to}`);
      const json = await res.json();
      if (json.success) setAppointments(sortApts(json.data));
    } catch (e) { console.error(e); }
    setLoading(l => ({ ...l, apts: false }));
  }, []); // eslint-disable-line

  useEffect(() => { fetchApts(); }, [fetchApts]);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, loading.ai]);

  // ── Calendar helpers ────────────────────────────────────────────────────
  const calY   = calBase.getFullYear();
  const calM   = calBase.getMonth();
  const dIM    = new Date(calY, calM + 1, 0).getDate();
  const f1     = new Date(calY, calM, 1).getDay();
  const cells  = [...Array(f1).fill(null), ...Array.from({ length: dIM }, (_, i) => i + 1)];
  const dISO   = d => `${calY}-${pad(calM + 1)}-${pad(d)}`;
  const aptsOn = iso => appointments.filter(a => a.date === iso).sort((a, b) => a.time.localeCompare(b.time));
  const selISO = toISO(selDate);
  const selApts = aptsOn(selISO);
  const upcoming = appointments.filter(a => a.date >= todayISO).slice(0, 7);

  function goToDate(d) {
    setSelDate(d);
    setCalBase(new Date(d.getFullYear(), d.getMonth(), 1));
  }

  // ── Remove appointment ──────────────────────────────────────────────────
  async function removeApt(id) {
    setAppointments(prev => prev.filter(a => a.id !== id));
    try {
      await fetch(`/api/appointments?id=${id}`, { method: 'DELETE' });
    } catch (e) {
      console.error(e);
      fetchApts(); // re-sync se falhar
    }
  }

  // ── Save manual appointment ─────────────────────────────────────────────
  async function saveManual() {
    if (!form.title.trim() || !form.date || !form.time) {
      setFormErr('Preencha título, data e horário.');
      return;
    }
    setFormErr('');
    try {
      const res  = await fetch('/api/appointments', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, user_id: USER_ID, end_time: form.end_time || addOneHour(form.time) }),
      });
      const json = await res.json();
      if (json.success) {
        setAppointments(prev => sortApts([...prev, json.data]));
        goToDate(parseISO(form.date));
        setShowAdd(false);
        setForm({ title: '', date: todayISO, time: '09:00', end_time: '10:00', category: 'pessoal', description: '' });
      } else {
        setFormErr(json.error || 'Erro ao salvar.');
      }
    } catch (e) {
      setFormErr('Erro de conexão.');
    }
  }

  // ── AI chat ─────────────────────────────────────────────────────────────
  async function sendMessage() {
    if (!input.trim() || loading.ai) return;
    const text = input.trim();
    setInput('');

    const userMsg = { id: Date.now() + 'u', role: 'user', text, ts: new Date().toISOString() };
    setMessages(prev => [...prev, userMsg]);
    setLoading(l => ({ ...l, ai: true }));

    try {
      const res  = await fetch('/api/ai', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, user_id: USER_ID }),
      });
      const json = await res.json();

      // Atualiza lista se houve ação
      if (json.action === 'add' || json.action === 'remove') {
        await fetchApts();
        if (json.action === 'add' && json.appointment?.date) {
          goToDate(parseISO(json.appointment.date));
        }
      }

      const botMsg = {
        id:     Date.now() + 'b',
        role:   'bot',
        text:   json.message || 'OK!',
        action: json.action,
        apt:    json.appointment,
        ts:     new Date().toISOString(),
      };
      setMessages(prev => [...prev, botMsg]);

    } catch {
      setMessages(prev => [...prev, {
        id: Date.now() + 'e', role: 'bot',
        text: '❌ Erro de conexão. Tente novamente!',
        ts:   new Date().toISOString(),
      }]);
    }

    setLoading(l => ({ ...l, ai: false }));
  }

  // ════════════════════════════════════════════════════════════════════════
  // RENDER
  // ════════════════════════════════════════════════════════════════════════
  return (
    <div style={{ position: 'relative', height: '100dvh', display: 'flex', flexDirection: 'column', overflow: 'hidden', fontFamily: "'DM Sans', system-ui, sans-serif" }}>

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 16px', background: '#0d3d2e', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: '#25D366', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>📅</div>
          <div>
            <div style={{ fontFamily: "'Fraunces', Georgia, serif", color: '#fff', fontSize: 17, fontWeight: 600, lineHeight: 1.2 }}>Agenda IA</div>
            <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11 }}>Sua agenda inteligente</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: 11, textAlign: 'right', lineHeight: 1.5 }}>
            <div style={{ color: 'rgba(255,255,255,0.88)', fontWeight: 600, textTransform: 'capitalize' }}>
              {today.toLocaleDateString('pt-BR', { weekday: 'long' })}
            </div>
            <div>{today.toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' })}</div>
          </div>
          <button
            onClick={() => { setForm(f => ({ ...f, date: selISO })); setShowAdd(true); setFormErr(''); }}
            style={{ background: '#25D366', color: '#fff', border: 'none', borderRadius: 9, padding: '7px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>
            + Novo
          </button>
        </div>
      </header>

      {/* ── Mobile tabs ─────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', borderBottom: '1px solid #e2e8f0', background: '#fff', flexShrink: 0 }}
        className="md:hidden">
        {[['agenda', '📋 Agenda'], ['chat', '💬 Chat IA']].map(([t, l]) => (
          <button key={t} onClick={() => setMobileTab(t)} style={{
            flex: 1, padding: '10px', fontSize: 13, fontWeight: 600, border: 'none',
            borderBottom: mobileTab === t ? '2.5px solid #25D366' : '2.5px solid transparent',
            background: 'none', cursor: 'pointer', color: mobileTab === t ? '#0d3d2e' : '#94a3b8',
            fontFamily: 'inherit', transition: 'color .15s',
          }}>{l}</button>
        ))}
      </div>

      {/* ── Body ────────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

        {/* ═══════════════ LEFT PANEL ═══════════════ */}
        <div
          style={{ width: 360, minWidth: 300, display: 'flex', flexDirection: 'column', overflowY: 'auto', padding: '10px 10px 16px', gap: 10, borderRight: '1px solid #e2e8f0', background: '#f8fafc', flexShrink: 0 }}
          className={mobileTab === 'chat' ? 'hidden md:flex' : 'flex'}>

          {/* Calendar */}
          <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px 4px' }}>
              <button onClick={() => setCalBase(new Date(calY, calM - 1, 1))} style={navBtnStyle}>‹</button>
              <span style={{ fontFamily: "'Fraunces', serif", fontSize: 14, fontWeight: 600, color: '#0d3d2e' }}>
                {MONTHS_PT[calM]} {calY}
              </span>
              <button onClick={() => setCalBase(new Date(calY, calM + 1, 1))} style={navBtnStyle}>›</button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', padding: '0 8px 10px', gap: '1px 0' }}>
              {WD_LETTERS.map((d, i) => (
                <div key={i} style={{ textAlign: 'center', fontSize: 11, fontWeight: 700, color: '#94a3b8', padding: '3px 0' }}>{d}</div>
              ))}
              {cells.map((d, i) => {
                if (!d) return <div key={`e${i}`} />;
                const iso = dISO(d);
                const dots = aptsOn(iso);
                const isT = iso === todayISO;
                const isS = iso === selISO;
                return (
                  <div key={iso} onClick={() => setSelDate(new Date(calY, calM, d))}
                    style={{
                      display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '3px 0',
                      borderRadius: 9, cursor: 'pointer', transition: 'background .1s',
                      background: isS ? '#0d3d2e' : isT ? '#dcfce7' : 'transparent',
                      color: isS ? '#fff' : isT ? '#15803d' : '#374151',
                    }}>
                    <span style={{ fontSize: 12, fontWeight: 500, lineHeight: '18px' }}>{d}</span>
                    <div style={{ display: 'flex', gap: 2, height: 5 }}>
                      {dots.slice(0, 3).map(a => (
                        <div key={a.id} style={{ width: 4, height: 4, borderRadius: '50%', background: isS ? 'rgba(255,255,255,0.65)' : (CATS[a.category]?.color || '#64748b') }} />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Selected day header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 2px' }}>
            <h2 style={{ fontSize: 13, fontWeight: 700, color: '#0d3d2e', textTransform: 'capitalize', margin: 0 }}>
              {selDate.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}
            </h2>
            <button onClick={() => { setForm(f => ({ ...f, date: selISO })); setShowAdd(true); setFormErr(''); }}
              style={{ fontSize: 11, fontWeight: 700, color: '#16a34a', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: '3px 9px', cursor: 'pointer' }}>
              + Add
            </button>
          </div>

          {/* Day appointments */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {loading.apts ? (
              <div style={{ textAlign: 'center', padding: '20px', color: '#94a3b8', fontSize: 13 }}>Carregando...</div>
            ) : selApts.length === 0 ? (
              <div style={{ background: 'transparent', border: '1.5px dashed #e2e8f0', borderRadius: 14, padding: '22px 14px', textAlign: 'center' }}>
                <div style={{ fontSize: 28, marginBottom: 6 }}>🗓️</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#64748b' }}>Nenhum compromisso</div>
                <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 3 }}>Dia livre! Use o chat para agendar.</div>
              </div>
            ) : selApts.map(a => {
              const c = CATS[a.category] || CATS.outro;
              return (
                <div key={a.id}
                  style={{ display: 'flex', gap: 10, padding: '10px 12px', background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', borderLeft: `3px solid ${c.color}`, transition: 'transform .15s' }}
                  onMouseEnter={e => { e.currentTarget.style.transform = 'translateX(2px)'; e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.07)'; }}
                  onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = 'none'; }}>
                  <div style={{ fontSize: 20, lineHeight: 1, marginTop: 2 }}>{c.emoji}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.title}</div>
                    <div style={{ fontSize: 11.5, color: '#64748b', marginTop: 2 }}>⏰ {a.time}{a.end_time ? ` – ${a.end_time}` : ''}</div>
                    {a.description && <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.description}</div>}
                    <span style={{ display: 'inline-block', borderRadius: 20, padding: '2px 8px', fontSize: 10.5, fontWeight: 700, marginTop: 4, background: c.bg, color: c.dark }}>{c.label}</span>
                  </div>
                  <button onClick={() => removeApt(a.id)}
                    style={{ width: 22, height: 22, borderRadius: 7, border: '1px solid #e2e8f0', background: '#f8fafc', color: '#94a3b8', fontSize: 11, cursor: 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all .1s', padding: 0 }}
                    onMouseEnter={e => { e.currentTarget.style.background = '#fee2e2'; e.currentTarget.style.color = '#dc2626'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = '#f8fafc'; e.currentTarget.style.color = '#94a3b8'; }}>
                    ✕
                  </button>
                </div>
              );
            })}
          </div>

          {/* Upcoming */}
          {upcoming.length > 0 && (
            <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0', padding: '12px 14px' }}>
              <div style={{ fontSize: 10, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>📋 Próximos compromissos</div>
              {upcoming.map(a => {
                const c = CATS[a.category] || CATS.outro;
                return (
                  <button key={a.id} onClick={() => goToDate(parseISO(a.date))}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 6px', borderRadius: 9, border: 'none', background: 'transparent', cursor: 'pointer', textAlign: 'left', width: '100%', fontFamily: 'inherit', transition: 'background .1s' }}
                    onMouseEnter={e => { e.currentTarget.style.background = '#f8fafc'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}>
                    <div style={{ width: 7, height: 7, borderRadius: '50%', background: c.color, flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.title}</div>
                      <div style={{ fontSize: 10.5, color: '#94a3b8' }}>{dayLabel(a.date, todayISO)} • {a.time}</div>
                    </div>
                    <span style={{ fontSize: 14 }}>{c.emoji}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* ═══════════════ RIGHT PANEL — CHAT ═══════════════ */}
        <div
          style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}
          className={mobileTab === 'agenda' ? 'hidden md:flex' : 'flex'}>

          {/* Chat header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', background: '#075E54', flexShrink: 0 }}>
            <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#25D366', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>🤖</div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>Agenda IA</div>
              <div style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.6)' }}>
                {loading.ai ? '✍️ digitando...' : `● ${appointments.length} compromisso${appointments.length !== 1 ? 's' : ''}`}
              </div>
            </div>
          </div>

          {/* Messages */}
          <div className="chat-bg" style={{ flex: 1, overflowY: 'auto', padding: '12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {messages.map(m => (
              <div key={m.id} style={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
                <div style={{ maxWidth: 290 }}>
                  <div style={{
                    padding: '8px 12px', fontSize: 13.5, lineHeight: 1.55, wordBreak: 'break-word',
                    boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
                    background: m.role === 'user' ? '#d9fdd3' : '#fff',
                    color: '#111827',
                    borderRadius: m.role === 'user' ? '14px 3px 14px 14px' : '3px 14px 14px 14px',
                  }}>
                    <MsgText text={m.text} />
                    {m.action === 'add' && m.apt && (
                      <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 9, padding: '6px 9px', marginTop: 7 }}>
                        <div style={{ fontWeight: 700, color: '#15803d', fontSize: 12 }}>✅ {m.apt.title}</div>
                        <div style={{ color: '#16a34a', fontSize: 11, marginTop: 2 }}>
                          📅 {m.apt.date} • {m.apt.time}{m.apt.end_time ? `–${m.apt.end_time}` : ''}
                        </div>
                      </div>
                    )}
                    <div style={{ fontSize: 10, color: '#94a3b8', textAlign: 'right', marginTop: 3 }}>{fmtTs(m.ts)}</div>
                  </div>
                </div>
              </div>
            ))}
            {loading.ai && (
              <div style={{ display: 'flex' }}>
                <div style={{ background: '#fff', borderRadius: '3px 14px 14px 14px', padding: '10px 14px', boxShadow: '0 1px 2px rgba(0,0,0,0.1)', display: 'flex', gap: 3, alignItems: 'center' }}>
                  <span className="typing-dot">●</span>
                  <span className="typing-dot">●</span>
                  <span className="typing-dot">●</span>
                </div>
              </div>
            )}
            <div ref={endRef} />
          </div>

          {/* Quick replies */}
          <div style={{ background: '#f0f2f5', padding: '8px 12px 4px', display: 'flex', gap: 6, flexWrap: 'wrap', flexShrink: 0 }}>
            {['O que tenho hoje?', 'Próximos compromissos', 'Estou livre amanhã?', 'Resumo da semana'].map(q => (
              <button key={q} onClick={() => { setInput(q); setTimeout(() => inpRef.current?.focus(), 50); }}
                style={{ fontSize: 12, padding: '4px 11px', borderRadius: 20, border: '1px solid #d1d5db', background: '#fff', color: '#374151', cursor: 'pointer', fontFamily: 'inherit', transition: 'all .1s' }}
                onMouseEnter={e => { e.currentTarget.style.background = '#dcfce7'; e.currentTarget.style.borderColor = '#16a34a'; e.currentTarget.style.color = '#15803d'; }}
                onMouseLeave={e => { e.currentTarget.style.background = '#fff'; e.currentTarget.style.borderColor = '#d1d5db'; e.currentTarget.style.color = '#374151'; }}>
                {q}
              </button>
            ))}
          </div>

          {/* Input */}
          <div style={{ background: '#f0f2f5', padding: '6px 12px 10px', display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
            <div style={{ flex: 1, background: '#fff', borderRadius: 24, padding: '8px 16px', display: 'flex', alignItems: 'center', border: '1px solid #e2e8f0' }}>
              <input
                ref={inpRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), sendMessage())}
                placeholder="Digite uma mensagem..."
                disabled={loading.ai}
                style={{ flex: 1, border: 'none', outline: 'none', fontSize: 14, background: 'transparent', color: '#111827', fontFamily: 'inherit' }}
              />
            </div>
            <button onClick={sendMessage} disabled={loading.ai || !input.trim()}
              style={{
                width: 40, height: 40, borderRadius: '50%', border: 'none',
                background: loading.ai || !input.trim() ? '#9ed9b7' : '#25D366',
                color: '#fff', fontSize: 16, cursor: loading.ai || !input.trim() ? 'not-allowed' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'background .15s',
              }}>
              ➤
            </button>
          </div>
        </div>
      </div>

      {/* ═══════════════ MODAL: Novo Compromisso ═══════════════ */}
      {showAdd && (
        <div className="anim-fade-in"
          style={{ position: 'absolute', inset: 0, zIndex: 50, background: 'rgba(0,0,0,0.52)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
          onClick={e => e.target === e.currentTarget && setShowAdd(false)}>
          <div className="anim-slide-up"
            style={{ background: '#fff', borderRadius: 18, width: '100%', maxWidth: 440, boxShadow: '0 24px 60px rgba(0,0,0,0.22)', overflow: 'hidden' }}>

            {/* Modal header */}
            <div style={{ background: '#0d3d2e', padding: '13px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontFamily: "'Fraunces', serif", color: '#fff', fontSize: 16, fontWeight: 600 }}>Novo Compromisso</span>
              <button onClick={() => setShowAdd(false)}
                style={{ background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff', width: 26, height: 26, borderRadius: '50%', cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
            </div>

            {/* Form */}
            <div style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 13, maxHeight: 380, overflowY: 'auto' }}>
              {formErr && (
                <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 9, padding: '8px 12px', fontSize: 12, color: '#dc2626' }}>⚠️ {formErr}</div>
              )}

              <div>
                <label style={labelStyle}>Título *</label>
                <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                  placeholder="Ex: Consulta médica" style={inputStyle} />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                {[{ l: 'Data *', t: 'date', k: 'date' }, { l: 'Início', t: 'time', k: 'time' }, { l: 'Término', t: 'time', k: 'end_time' }].map(({ l, t, k }) => (
                  <div key={k}>
                    <label style={labelStyle}>{l}</label>
                    <input type={t} value={form[k]} onChange={e => setForm(f => ({ ...f, [k]: e.target.value }))}
                      style={{ ...inputStyle, fontSize: 12 }} />
                  </div>
                ))}
              </div>

              <div>
                <label style={labelStyle}>Categoria</label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 6 }}>
                  {CAT_KEYS.map(k => {
                    const c = CATS[k];
                    const sel = form.category === k;
                    return (
                      <div key={k} onClick={() => setForm(f => ({ ...f, category: k }))}
                        style={{ borderRadius: 10, padding: '7px 2px', fontSize: 10.5, fontWeight: 700, cursor: 'pointer', border: `1.5px solid ${sel ? c.color : 'transparent'}`, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, background: sel ? c.color : c.bg, color: sel ? '#fff' : c.dark, transition: 'all .1s' }}>
                        <span style={{ fontSize: 18 }}>{c.emoji}</span>
                        <span>{c.label}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div>
                <label style={labelStyle}>Descrição</label>
                <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="Detalhes opcionais..." rows={2}
                  style={{ ...inputStyle, height: 56, resize: 'none' }} />
              </div>
            </div>

            {/* Footer */}
            <div style={{ padding: '11px 18px', borderTop: '1px solid #f1f5f9', display: 'flex', gap: 10 }}>
              <button onClick={() => setShowAdd(false)}
                style={{ flex: 1, padding: '10px', borderRadius: 12, background: '#f8fafc', border: '1px solid #e2e8f0', color: '#64748b', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                Cancelar
              </button>
              <button onClick={saveManual} disabled={!form.title.trim() || !form.date}
                style={{ flex: 1, padding: '10px', borderRadius: 12, border: 'none', color: '#fff', fontSize: 13, fontWeight: 700, cursor: form.title.trim() && form.date ? 'pointer' : 'not-allowed', fontFamily: 'inherit', background: form.title.trim() && form.date ? '#0d3d2e' : '#cbd5e1', transition: 'background .15s' }}>
                ✓ Salvar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Shared styles ─────────────────────────────────────────────────────────────
const navBtnStyle = { width: 28, height: 28, borderRadius: 8, border: 'none', background: '#f1f5f9', color: '#475569', fontWeight: 700, fontSize: 16, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' };
const labelStyle  = { display: 'block', fontSize: 10.5, fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 5 };
const inputStyle  = { width: '100%', borderRadius: 10, padding: '8px 12px', fontSize: 13, border: '1.5px solid #e2e8f0', color: '#111827', background: '#fafafa', fontFamily: 'inherit' };

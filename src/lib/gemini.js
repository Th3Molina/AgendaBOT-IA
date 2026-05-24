// IA via Groq (gratuito, sem cartão) — substitui o Gemini
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const MODEL    = 'llama-3.3-70b-versatile';

export async function askGemini(systemPrompt, userMessage) {
  const apiKey = process.env.GEMINI_API_KEY; // mantém o mesmo nome no .env
  if (!apiKey) throw new Error('GEMINI_API_KEY não configurada (cole a chave do Groq aqui)');

  const res = await fetch(GROQ_URL, {
    method:  'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model:    MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user',   content: userMessage  },
      ],
      temperature:      0.4,
      max_tokens:       1024,
      response_format:  { type: 'json_object' },
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Groq API ${res.status}: ${err.slice(0, 300)}`);
  }

  const data = await res.json();
  const raw  = data?.choices?.[0]?.message?.content || '';

  try {
    const clean = raw.replace(/```json\n?|```/g, '').trim();
    return JSON.parse(clean);
  } catch {
    return { message: raw || 'Não entendi, pode repetir?', action: 'none', appointment: null, removeId: null };
  }
}

export function buildSystemPrompt(appointments, todayISO, tomorrowISO) {
  const aptsList = appointments.length
    ? appointments.map(a =>
        `  • [ID:${a.id}] "${a.title}" — ${a.date} ${a.time}${a.end_time ? '–'+a.end_time : ''} [${a.category}]${a.description ? ' — '+a.description : ''}`
      ).join('\n')
    : '  (nenhum compromisso cadastrado)';

  return `Você é "Agenda IA", assistente de agenda inteligente. Responda em português brasileiro.
Hoje: ${todayISO} | Amanhã: ${tomorrowISO}

COMPROMISSOS:
${aptsList}

Responda SOMENTE com JSON válido, sem markdown, sem texto fora do JSON:
{
  "message": "resposta amigável com emojis",
  "action": "add" | "remove" | "list" | "check" | "none",
  "appointment": {
    "id": "apt-TIMESTAMP",
    "title": "título",
    "date": "YYYY-MM-DD",
    "time": "HH:MM",
    "end_time": "HH:MM",
    "category": "medico|trabalho|pessoal|social|outro",
    "description": "opcional"
  } | null,
  "removeId": "uuid ou null"
}

Regras: converta datas relativas, verifique conflitos, use IDs reais para remover.`;
}
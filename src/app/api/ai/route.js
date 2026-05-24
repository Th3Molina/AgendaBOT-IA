import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { askGemini, buildSystemPrompt } from '@/lib/gemini';

// ── POST /api/ai ────────────────────────────────────────────────────────────
// Body: { message, user_id }
// Returns: { success, message, action, appointment, removeId }
export async function POST(request) {
  try {
    const body = await request.json();
    const { message, user_id = 'web-user' } = body;

    if (!message?.trim()) {
      return NextResponse.json({ success: false, error: 'Mensagem vazia' }, { status: 400 });
    }

    // Busca todos os compromissos do usuário (futuros + hoje)
    const today = new Date();
    const todayISO    = toISO(today);
    const tomorrowISO = toISO(new Date(today.getTime() + 86400000));
    const in30days    = toISO(new Date(today.getTime() + 30 * 86400000));

    const { data: appointments = [] } = await supabaseAdmin
      .from('appointments')
      .select('*')
      .eq('user_id', user_id)
      .gte('date', todayISO)
      .lte('date', in30days)
      .order('date')
      .order('time');

    const systemPrompt = buildSystemPrompt(appointments, todayISO, tomorrowISO);

    // Chama Gemini
    const aiResult = await askGemini(systemPrompt, message);

    // Executa a ação no banco
    let savedAppointment = null;

    if (aiResult.action === 'add' && aiResult.appointment?.title) {
      const apt = aiResult.appointment;
      const validCats = ['medico', 'trabalho', 'pessoal', 'social', 'outro'];

      // Normaliza categoria (Gemini às vezes retorna "médico" com acento)
      const catMap = { médico: 'medico', médica: 'medico', medico: 'medico', medica: 'medico' };
      const cat = catMap[apt.category?.toLowerCase()] || (validCats.includes(apt.category) ? apt.category : 'outro');

      const { data: newApt, error } = await supabaseAdmin
        .from('appointments')
        .insert([{
          user_id,
          title:       apt.title,
          date:        apt.date,
          time:        apt.time,
          end_time:    apt.end_time || addOneHour(apt.time),
          category:    cat,
          description: apt.description || null,
        }])
        .select()
        .single();

      if (error) throw error;
      savedAppointment = newApt;

    } else if (aiResult.action === 'remove' && aiResult.removeId) {
      const { error } = await supabaseAdmin
        .from('appointments')
        .delete()
        .eq('id', aiResult.removeId)
        .eq('user_id', user_id);

      if (error) throw error;
    }

    return NextResponse.json({
      success: true,
      message:     aiResult.message,
      action:      aiResult.action || 'none',
      appointment: savedAppointment || aiResult.appointment,
      removeId:    aiResult.removeId || null,
    });

  } catch (err) {
    console.error('[POST /api/ai]', err);
    return NextResponse.json({
      success: false,
      message: '❌ Erro ao processar. Tente novamente!',
      error:   err.message,
    }, { status: 500 });
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function toISO(d) {
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function addOneHour(time) {
  if (!time) return '10:00';
  const [h, m] = time.split(':').map(Number);
  return `${String(Math.min(h + 1, 23)).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

import { db } from './supabase.js';

const pad   = n => String(n).padStart(2, '0');
const toISO = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;

// Formata "16:00:00" → "16:00"
function fmtTime(t) {
  if (!t) return '';
  return t.slice(0, 5);
}

// Formata "2024-05-24" → "24/05/2024"
function fmtDate(d) {
  if (!d) return '';
  const [y, m, dd] = d.split('-');
  return `${dd}/${m}/${y}`;
}

export async function getAppointments(userId) {
  const todayISO  = toISO(new Date());
  const futureISO = toISO(new Date(Date.now() + 60 * 86400000));

  const { data, error } = await db
    .from('appointments')
    .select('*')
    .eq('user_id', userId)
    .gte('date', todayISO)
    .lte('date', futureISO)
    .order('date')
    .order('time');

  if (error) throw error;

  // Normaliza os horários para HH:MM antes de enviar para a IA
  return (data || []).map(a => ({
    ...a,
    time:     fmtTime(a.time),
    end_time: fmtTime(a.end_time),
  }));
}

export async function addAppointment(userId, apt) {
  const validCats = ['medico', 'trabalho', 'pessoal', 'social', 'outro'];
  const catMap    = { médico:'medico', médica:'medico', medico:'medico' };
  const cat       = catMap[apt.category?.toLowerCase()] ||
                    (validCats.includes(apt.category) ? apt.category : 'outro');

  const row = {
    user_id:     userId,
    title:       apt.title?.trim(),
    date:        apt.date,
    time:        fmtTime(apt.time),
    end_time:    fmtTime(apt.end_time) || addOneHour(apt.time),
    category:    cat,
    description: apt.description?.trim() || null,
  };

  if (!row.title || !row.date || !row.time) {
    throw new Error('Dados incompletos: title, date e time são obrigatórios.');
  }

  const { data, error } = await db
    .from('appointments')
    .insert([row])
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function removeAppointment(userId, aptId) {
  const { error } = await db
    .from('appointments')
    .delete()
    .eq('id', aptId)
    .eq('user_id', userId);

  if (error) throw error;
  return true;
}

function addOneHour(time) {
  if (!time) return '10:00';
  const t = fmtTime(time);
  const [h, m] = t.split(':').map(Number);
  return `${pad(Math.min(h + 1, 23))}:${pad(m)}`;
}
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

// ── GET /api/appointments ───────────────────────────────────────────────────
// Query params: user_id, date (YYYY-MM-DD), from, to
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('user_id') || 'web-user';
    const date   = searchParams.get('date');
    const from   = searchParams.get('from');
    const to     = searchParams.get('to');

    let query = supabaseAdmin
      .from('appointments')
      .select('*')
      .eq('user_id', userId)
      .order('date', { ascending: true })
      .order('time', { ascending: true });

    if (date) {
      query = query.eq('date', date);
    } else if (from && to) {
      query = query.gte('date', from).lte('date', to);
    } else if (from) {
      query = query.gte('date', from);
    }

    const { data, error } = await query;

    if (error) throw error;

    return NextResponse.json({ success: true, data: data || [] });
  } catch (err) {
    console.error('[GET /api/appointments]', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

// ── POST /api/appointments ──────────────────────────────────────────────────
// Body: { user_id, title, date, time, end_time, category, description }
export async function POST(request) {
  try {
    const body = await request.json();

    const { user_id = 'web-user', title, date, time, end_time, category = 'outro', description } = body;

    if (!title || !date || !time) {
      return NextResponse.json(
        { success: false, error: 'Campos obrigatórios: title, date, time' },
        { status: 400 }
      );
    }

    // Normaliza categoria
    const validCats = ['medico', 'trabalho', 'pessoal', 'social', 'outro'];
    const cat = validCats.includes(category) ? category : 'outro';

    const { data, error } = await supabaseAdmin
      .from('appointments')
      .insert([{ user_id, title, date, time, end_time: end_time || null, category: cat, description: description || null }])
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (err) {
    console.error('[POST /api/appointments]', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

// ── DELETE /api/appointments ────────────────────────────────────────────────
// Query params: id (UUID)
export async function DELETE(request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ success: false, error: 'Parâmetro id obrigatório' }, { status: 400 });
    }

    const { error } = await supabaseAdmin
      .from('appointments')
      .delete()
      .eq('id', id);

    if (error) throw error;

    return NextResponse.json({ success: true, message: 'Compromisso removido com sucesso.' });
  } catch (err) {
    console.error('[DELETE /api/appointments]', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

// ── PATCH /api/appointments ─────────────────────────────────────────────────
// Body: { id, ...fields }
export async function PATCH(request) {
  try {
    const body = await request.json();
    const { id, ...fields } = body;

    if (!id) {
      return NextResponse.json({ success: false, error: 'Campo id obrigatório' }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from('appointments')
      .update(fields)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error('[PATCH /api/appointments]', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

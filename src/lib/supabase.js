import { createClient } from '@supabase/supabase-js';

const supabaseUrl     = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnon    = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabaseService = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Cliente browser (anon key)
export const supabase = createClient(supabaseUrl, supabaseAnon);

// Cliente server-side com privilégios totais
export const supabaseAdmin = createClient(
  supabaseUrl,
  supabaseService || supabaseAnon
);

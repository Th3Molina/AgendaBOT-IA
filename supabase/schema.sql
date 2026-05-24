-- ============================================================
--  AGENDA IA  –  Schema Supabase
--  Execute no SQL Editor do painel do Supabase
-- ============================================================
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS appointments (
  id           UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id      TEXT        NOT NULL DEFAULT 'web-user',
  title        TEXT        NOT NULL,
  date         DATE        NOT NULL,
  time         TIME        NOT NULL,
  end_time     TIME,
  category     TEXT        NOT NULL DEFAULT 'outro'
                           CHECK (category IN ('medico','trabalho','pessoal','social','outro')),
  description  TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_apt_user_date ON appointments (user_id, date);
CREATE INDEX IF NOT EXISTS idx_apt_date ON appointments (date);

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_apt_updated
  BEFORE UPDATE ON appointments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public_access" ON appointments FOR ALL USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS whatsapp_sessions (
  id TEXT PRIMARY KEY,
  data JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE whatsapp_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_access" ON whatsapp_sessions FOR ALL USING (true);

INSERT INTO appointments (user_id, title, date, time, end_time, category, description)
VALUES
  ('web-user','Reuniao de planejamento', CURRENT_DATE,'09:00','10:00','trabalho','Sala 3'),
  ('web-user','Consulta medica', CURRENT_DATE+1,'14:30','15:30','medico','Dr. Silva'),
  ('web-user','Aniversario da Maria', CURRENT_DATE+3,'19:00','23:00','social','Restaurante Central')
ON CONFLICT DO NOTHING;

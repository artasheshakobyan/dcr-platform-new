-- ============================================================
-- DCR PLATFORM v2.0 — COMPLETE SCHEMA
-- Run this in Supabase SQL Editor
-- ============================================================

-- ── Core tables (ensure all exist) ────────────────────────────────────────

-- Projects: add missing columns
ALTER TABLE projects ADD COLUMN IF NOT EXISTS desired_systems_per_week numeric DEFAULT 1;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS city_state text;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS crm_percent numeric DEFAULT 0;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS share_token text;

-- Operators: add phone
ALTER TABLE operators ADD COLUMN IF NOT EXISTS phone text;

-- ── New tables ─────────────────────────────────────────────────────────────

-- Operator Leave (for /me page leave submissions)
CREATE TABLE IF NOT EXISTS operator_leave (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  operator_id uuid NOT NULL REFERENCES operators(id) ON DELETE CASCADE,
  leave_type text NOT NULL CHECK (leave_type IN ('pto','sick','training','transit','other')),
  start_date date NOT NULL,
  end_date date NOT NULL,
  notes text,
  submitted_at timestamptz DEFAULT now(),
  approved_by text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE operator_leave ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_all" ON operator_leave FOR ALL USING (true) WITH CHECK (true);
CREATE INDEX IF NOT EXISTS idx_operator_leave_op ON operator_leave(operator_id);
CREATE INDEX IF NOT EXISTS idx_operator_leave_dates ON operator_leave(start_date, end_date);

-- Weekly Decisions (for Command Center)
CREATE TABLE IF NOT EXISTS weekly_decisions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  week_number integer NOT NULL,
  year integer NOT NULL DEFAULT 2026,
  decision text NOT NULL,
  decided_by text,
  created_at timestamptz DEFAULT now(),
  UNIQUE(week_number, year)
);
ALTER TABLE weekly_decisions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_all" ON weekly_decisions FOR ALL USING (true) WITH CHECK (true);

-- Fleet maintenance log
CREATE TABLE IF NOT EXISTS fleet_maintenance (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  system_code text NOT NULL,
  maintenance_type text NOT NULL,
  performed_by text,
  performed_at timestamptz DEFAULT now(),
  next_due_date timestamptz,
  cost_eur numeric DEFAULT 0,
  notes text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE fleet_maintenance ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_all" ON fleet_maintenance FOR ALL USING (true) WITH CHECK (true);
CREATE INDEX IF NOT EXISTS idx_maintenance_system ON fleet_maintenance(system_code);
CREATE INDEX IF NOT EXISTS idx_maintenance_date ON fleet_maintenance(performed_at);

-- PMs table
CREATE TABLE IF NOT EXISTS pms (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  region text NOT NULL,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE pms ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_all" ON pms FOR ALL USING (true) WITH CHECK (true);

-- Project share tokens (for /share/[token])
CREATE TABLE IF NOT EXISTS project_share_tokens (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  token text UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(16), 'hex'),
  label text,
  created_at timestamptz DEFAULT now(),
  expires_at timestamptz,
  view_count integer DEFAULT 0
);
ALTER TABLE project_share_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_all" ON project_share_tokens FOR ALL USING (true) WITH CHECK (true);

-- Alert snoozes (for Alerts page)
CREATE TABLE IF NOT EXISTS alert_snoozes (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  alert_key text NOT NULL UNIQUE,
  snoozed_until date NOT NULL,
  snoozed_by text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE alert_snoozes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_all" ON alert_snoozes FOR ALL USING (true) WITH CHECK (true);

-- Project comments (replace WhatsApp updates)
CREATE TABLE IF NOT EXISTS project_comments (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  comment text NOT NULL,
  author text NOT NULL,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE project_comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_all" ON project_comments FOR ALL USING (true) WITH CHECK (true);
CREATE INDEX IF NOT EXISTS idx_comments_project ON project_comments(project_id);

-- ── Seed data ──────────────────────────────────────────────────────────────
INSERT INTO pms (name, region) VALUES
  ('Ernest van der Berg', 'NL'),
  ('Thomas Müller', 'DE'),
  ('Sophie Dupont', 'BE'),
  ('James Wilson', 'US')
ON CONFLICT DO NOTHING;

-- ── Useful views ────────────────────────────────────────────────────────────

-- Weekly project digest (for progress page)
CREATE OR REPLACE VIEW weekly_project_digest AS
SELECT
  p.project_id,
  p.week_number,
  p.year,
  p.cumulative_images,
  ROUND(p.cumulative_images::numeric / 200, 1) AS km_driven,
  ROUND(p.cumulative_images::numeric / NULLIF(pr.total_km, 0) * 100) AS pct_complete,
  p.cumulative_images AS images_synced,
  pr.total_km,
  p.notes
FROM project_progress p
JOIN projects pr ON pr.id = p.project_id;


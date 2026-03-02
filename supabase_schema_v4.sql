-- ============================================================
-- DCR PLATFORM v4 — ADDITIONAL SCHEMA
-- Run AFTER existing schema + supabase_additions.sql
-- ============================================================

-- Operator leave / absence tracking (replaces manual Gantt entries for non-work days)
CREATE TABLE IF NOT EXISTS operator_leaves (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  operator_id uuid REFERENCES operators(id) ON DELETE CASCADE,
  leave_type text NOT NULL,  -- pto, sick, training, transit, other
  start_date date NOT NULL,
  end_date date NOT NULL,
  notes text,
  submitted_at timestamptz DEFAULT now(),
  approved_by text,
  CONSTRAINT valid_dates CHECK (end_date >= start_date)
);
ALTER TABLE operator_leaves ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_all" ON operator_leaves FOR ALL USING (true) WITH CHECK (true);
CREATE INDEX IF NOT EXISTS idx_leaves_operator ON operator_leaves(operator_id);
CREATE INDEX IF NOT EXISTS idx_leaves_dates ON operator_leaves(start_date, end_date);

-- Client-facing share tokens for projects
CREATE TABLE IF NOT EXISTS project_share_tokens (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id uuid REFERENCES projects(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(16), 'hex'),
  label text,
  created_at timestamptz DEFAULT now(),
  expires_at timestamptz,
  view_count integer DEFAULT 0
);
ALTER TABLE project_share_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_all" ON project_share_tokens FOR ALL USING (true) WITH CHECK (true);

-- Weekly decision log (for Command Center / Plan page)
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

-- Project comments / activity feed
CREATE TABLE IF NOT EXISTS project_comments (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id uuid REFERENCES projects(id) ON DELETE CASCADE,
  comment text NOT NULL,
  author text NOT NULL,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE project_comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_all" ON project_comments FOR ALL USING (true) WITH CHECK (true);
CREATE INDEX IF NOT EXISTS idx_comments_project ON project_comments(project_id);

-- Alert snoozes (so dismissed alerts don't reappear for N days)
CREATE TABLE IF NOT EXISTS alert_snoozes (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  alert_key text NOT NULL UNIQUE,  -- e.g. "cap-over-22" or "progress-stale-{project_id}"
  snoozed_until timestamptz NOT NULL,
  snoozed_by text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE alert_snoozes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_all" ON alert_snoozes FOR ALL USING (true) WITH CHECK (true);

-- Fleet maintenance log
CREATE TABLE IF NOT EXISTS fleet_maintenance (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  system_code text NOT NULL,
  maintenance_type text NOT NULL,
  performed_by text,
  performed_at date NOT NULL,
  next_due_date date,
  cost_eur numeric DEFAULT 0,
  notes text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE fleet_maintenance ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_all" ON fleet_maintenance FOR ALL USING (true) WITH CHECK (true);
CREATE INDEX IF NOT EXISTS idx_maintenance_system ON fleet_maintenance(system_code);

-- Ensure projects has all needed columns
ALTER TABLE projects ADD COLUMN IF NOT EXISTS desired_systems_per_week numeric DEFAULT 1;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS city_state text;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS crm_percent numeric DEFAULT 0;

-- PMs table
CREATE TABLE IF NOT EXISTS pms (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  region text NOT NULL,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE pms ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_all" ON pms FOR ALL USING (true) WITH CHECK (true);


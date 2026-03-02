export type Region = "NL" | "BE" | "DE" | "EU" | "US" | "CZ" | "LU" | "GR" | "CH" | "AT" | "FR" | "UK";
export type Category = "EU" | "US";
export type ProjectStatus = "Committed" | "Pipeline" | "Finished" | "Other";
export type AssignmentStatus = "Assigned" | "PTO" | "Training" | "Sick" | "Transit";
export type SystemStatus = "Active" | "Transit" | "Repair" | "Idle";

export interface Project {
  id: string;
  name: string;
  region: Region;
  city_state?: string;
  category: Category;
  status: ProjectStatus;
  finance_id?: string;
  crm_percent?: number;
  total_km: number;
  km_per_week: number;
  pm?: string;
  delivery?: string;
  inf_prod?: string;
  start_date?: string;
  end_date?: string;
  desired_systems_per_week: number;
  notes?: string;
  lat?: number;
  lng?: number;
  created_at: string;
  updated_at: string;
}

export interface Operator {
  id: string;
  name: string;
  role?: string;
  region: Region;
  fte: number;
  email?: string;
  active: boolean;
  created_at: string;
}

export interface OperatorAssignment {
  id: string;
  operator_id: string;
  project_id: string;
  week_number: number;
  year: number;
  status: AssignmentStatus;
  notes?: string;
  created_at: string;
  // joined
  operator?: Operator;
  project?: Project;
}

export interface WeeklyConfig {
  id: string;
  week_number: number;
  year: number;
  total_capacity: number;
  repair_eu: number;
  repair_us: number;
  rd_systems: number;
  spare_eu: number;
  spare_us: number;
  notes?: string;
}

export interface Benchmark {
  id: string;
  country: string;
  month: number;
  km_per_week_per_system: number;
  km_per_month_per_system?: number;
  working_days?: number;
  notes?: string;
}

export interface MapLocation {
  id: string;
  system_name: string;
  project_id?: string;
  operator_id?: string;
  lat: number;
  lng: number;
  status: SystemStatus;
  last_updated: string;
  notes?: string;
  project?: Project;
  operator?: Operator;
}

// Computed / derived types
export interface WeeklySummary {
  week_number: number;
  year: number;
  date: string;
  total_capacity: number;
  committed_eu: number;
  committed_us: number;
  repair_eu: number;
  repair_us: number;
  rd_systems: number;
  spare_eu: number;
  spare_us: number;
  pipeline_eu: number;
  pipeline_us: number;
  pipeline_total: number;
  global_balance: number;
  balance_eu: number;
  balance_us: number;
  in_use: number;
  utilization_pct: number;
  operator_count: number;
}

export interface ForecastResult {
  project_id: string;
  total_km: number;
  km_per_week: number;
  forecast_weeks: number;
  // systems_per_week: number; // removed, use desired_systems_per_week
  start_date: string;
  end_date: string;
  weekly_schedule: { week: number; year: number; systems: number; date: string }[];
}

export interface Alert {
  type: "critical" | "warning" | "info";
  week: number;
  year: number;
  message: string;
  region: "Global" | "EU" | "US";
}

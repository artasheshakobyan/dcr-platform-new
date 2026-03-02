import { Project, Region, Category, ProjectStatus } from '@/types'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
export const supabase = createClient(supabaseUrl, supabaseKey)

export interface Operator {
  id: string; name: string; role?: string; region: Region; fte: number
  email?: string; phone?: string; active: boolean; created_at: string
}

export interface OperatorAssignment {
  id: string; operator_id: string; project_id: string
  week_number: number; year: number
  status: 'assigned'|'pto'|'sick'|'training'|'repair'|'transit'
  notes?: string; operator?: Operator; project?: Project
}

export interface OperatorLeave {
  id: string; operator_id: string; leave_type: 'pto'|'sick'|'training'|'transit'|'other'
  start_date: string; end_date: string; notes?: string
  submitted_at: string; approved_by?: string; operator?: Operator
}

export interface WeeklyCapacity {
  id: string; week_number: number; year: number; total_capacity: number
  repair_eu: number; repair_us: number; rd_systems: number
  spare_eu: number; spare_us: number; notes?: string
}

export interface WeeklyDecision {
  id: string; week_number: number; year: number
  decision: string; decided_by?: string; created_at: string
}

export interface SystemLocation {
  id: string; system_code: string; project_id?: string; operator_id?: string
  region?: string; lat: number; lng: number
  status: 'active'|'repair'|'transit'|'storage'
  last_updated: string; notes?: string; project?: Project; operator?: Operator
}

export interface FleetMaintenance {
  id: string; system_code: string; maintenance_type: string
  performed_by?: string; performed_at: string; next_due_date?: string
  cost_eur?: number; notes?: string; created_at: string
}

export interface KmBenchmark {
  id: string; region: string; month_number: number; month_name: string
  km_per_week: number; km_per_month: number; working_days?: number; effective_hours?: number
}

export interface ProjectProgress {
  id: string; project_id: string; week_number: number; year: number
  cumulative_images: number; notes?: string; logged_by?: string; logged_at: string
}

export interface ProjectCompletion {
  id: string; project_id: string; completed_at: string; signed_off_by: string
  sign_off_note?: string; final_images?: number; final_km?: number; previous_status?: string
}

export interface ProjectComment {
  id: string; project_id: string; comment: string; author: string; created_at: string
}

export interface ProjectShareToken {
  id: string; project_id: string; token: string; label?: string
  created_at: string; expires_at?: string; view_count: number
}

export interface AlertSnooze {
  id: string; alert_key: string; snoozed_until: string; snoozed_by?: string; created_at: string
}

export const IMAGES_PER_KM = 200
export const imagesToKm = (images: number) => Math.round((images / IMAGES_PER_KM) * 10) / 10

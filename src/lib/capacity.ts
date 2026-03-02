import { OperatorAssignment, WeeklyCapacity } from './supabase'
import { Project } from '@/types'

export interface WeeklySummary {
  week_number: number; year: number
  total_capacity: number
  committed_eu: number; committed_us: number
  repair_eu: number; repair_us: number; rd: number
  spare_eu: number; spare_us: number
  pipeline_eu: number; pipeline_us: number; pipeline_total: number
  global_balance: number; balance_eu: number; balance_us: number
  in_use: number; utilization_pct: number; operator_count: number
  is_over_capacity: boolean; is_tight: boolean
}

export function computeWeeklySummary(
  weekNumber: number, year: number,
  capacity: WeeklyCapacity,
  projects: Project[],
  assignments: OperatorAssignment[]
): WeeklySummary {
  // ONLY count Committed and Pipeline projects — Finished and Other are excluded
  const activeProjects = projects.filter(p => p.status === 'Committed' || p.status === 'Pipeline')

  const weekAssignments = assignments.filter(
    a => a.week_number === weekNumber && a.year === year && a.status === 'assigned'
  )

  const projectSystemsMap: Record<string, number> = {}
  weekAssignments.forEach(a => {
    projectSystemsMap[a.project_id] = (projectSystemsMap[a.project_id] || 0) + 1
  })

  let committed_eu = 0, committed_us = 0, pipeline_eu = 0, pipeline_us = 0

  activeProjects.forEach(p => {
    const systems = projectSystemsMap[p.id] || 0
    if (systems === 0) return
    if (p.status === 'Committed') {
      if (p.category === 'EU') committed_eu += systems
      else committed_us += systems
    } else if (p.status === 'Pipeline') {
      if (p.category === 'EU') pipeline_eu += systems
      else pipeline_us += systems
    }
  })

  const repair_eu = capacity.repair_eu
  const repair_us = capacity.repair_us
  const rd = capacity.rd_systems
  const spare_eu = capacity.spare_eu
  const spare_us = capacity.spare_us
  const pipeline_total = pipeline_eu + pipeline_us

  // In-use = committed + repair + r&d + spare (pipeline shown separately)
  const in_use = committed_eu + committed_us + repair_eu + repair_us + rd + spare_eu + spare_us
  const total_capacity = capacity.total_capacity

  // Balance = capacity minus everything in use including pipeline (both committed + pipeline count)
  const global_balance = total_capacity - in_use - pipeline_total
  const balance_eu = total_capacity - committed_eu - repair_eu - spare_eu - pipeline_eu
  const balance_us = total_capacity - committed_us - repair_us - spare_us - pipeline_us
  const utilization_pct = Math.round(((in_use + pipeline_total) / total_capacity) * 100)
  const operator_count = weekAssignments.length

  return {
    week_number: weekNumber, year,
    total_capacity, committed_eu, committed_us,
    repair_eu, repair_us, rd, spare_eu, spare_us,
    pipeline_eu, pipeline_us, pipeline_total,
    global_balance, balance_eu, balance_us,
    in_use, utilization_pct, operator_count,
    is_over_capacity: global_balance < 0,
    is_tight: global_balance >= 0 && global_balance < 5,
  }
}

// Compute required systems to complete a project by a desired end date
export function computeRequiredSystems(
  totalKm: number,
  startDate: Date,
  endDate: Date,
  kmPerWeekPerSystem: number
): { systems: number; weeksAvailable: number; kmPerWeekNeeded: number } {
  const msPerWeek = 7 * 24 * 3600 * 1000
  const weeksAvailable = Math.max(1, Math.round((endDate.getTime() - startDate.getTime()) / msPerWeek))
  const kmPerWeekNeeded = totalKm / weeksAvailable
  const systems = Math.ceil(kmPerWeekNeeded / kmPerWeekPerSystem)
  return { systems, weeksAvailable, kmPerWeekNeeded }
}

// Compute projected end date given systems per week
export function computeProjectedEnd(
  totalKm: number,
  startDate: Date,
  systemsPerWeek: number,
  kmPerWeekPerSystem: number
): Date {
  const kmPerWeek = systemsPerWeek * kmPerWeekPerSystem
  if (kmPerWeek <= 0) return new Date(startDate.getTime() + 365 * 24 * 3600 * 1000)
  const weeksNeeded = Math.ceil(totalKm / kmPerWeek)
  return new Date(startDate.getTime() + weeksNeeded * 7 * 24 * 3600 * 1000)
}

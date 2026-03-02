import { KmBenchmark } from './supabase'
import { getISOWeek, getMonth, addWeeks, startOfISOWeek } from 'date-fns'

// Given total_km, start_date, region, and benchmarks → return week-by-week plan
export interface ForecastWeek {
  week_number: number
  year: number
  date: string
  km_this_week: number
  systems_needed: number
  cumulative_km: number
  pct_complete: number
}

export function forecastProject(
  totalKm: number,
  startDate: Date,
  region: string,
  systemsPerWeek: number,
  benchmarks: KmBenchmark[]
): ForecastWeek[] {
  if (!totalKm || !startDate) return []

  const regionBenchmarks = benchmarks.filter(b => b.region === region)
  if (!regionBenchmarks.length) return []

  const bmByMonth: Record<number, number> = {}
  regionBenchmarks.forEach(b => { bmByMonth[b.month_number] = b.km_per_week })

  const fallbackKmPerWeek = 175
  const weeks: ForecastWeek[] = []
  let cumulative = 0
  let currentDate = startOfISOWeek(startDate)
  let safetyBreak = 0

  while (cumulative < totalKm && safetyBreak < 500) {
    safetyBreak++
    const month = getMonth(currentDate) + 1 // 1-indexed
    const kmThisWeek = (bmByMonth[month] || fallbackKmPerWeek) * systemsPerWeek
    const remaining = totalKm - cumulative
    const actualKm = Math.min(kmThisWeek, remaining)
    cumulative += actualKm

    weeks.push({
      week_number: getISOWeek(currentDate),
      year: currentDate.getFullYear(),
      date: currentDate.toISOString().slice(0, 10),
      km_this_week: Math.round(actualKm),
      systems_needed: systemsPerWeek,
      cumulative_km: Math.round(cumulative),
      pct_complete: Math.round((cumulative / totalKm) * 100),
    })

    currentDate = addWeeks(currentDate, 1)
  }

  return weeks
}

// Compute week number from date
export function dateToWeek(date: Date): { week: number; year: number } {
  return { week: getISOWeek(date), year: date.getFullYear() }
}

// Get ISO week date range label
export function weekLabel(week: number, year: number): string {
  return `W${week} ${year}`
}

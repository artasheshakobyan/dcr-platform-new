'use client'
import { useEffect, useState, useMemo } from 'react'
import Shell from '@/components/ui/Shell'
import { Card, Pill, Btn, SectionHead } from '@/components/ui'
import { supabase } from '@/lib/supabase'
import { computeWeeklySummary } from '@/lib/capacity'
import { getISOWeek } from 'date-fns'
import { imagesToKm } from '@/lib/supabase'

const CURRENT_WEEK = getISOWeek(new Date())
const CURRENT_YEAR = new Date().getFullYear()

interface Alert {
  key: string
  type: 'critical' | 'warning' | 'info'
  category: string
  title: string
  detail: string
  link: string
  actionLabel: string
  week?: number
  projectId?: string
}

export default function AlertsPage() {
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [snoozes, setSnoozes] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'critical' | 'warning' | 'info'>('all')
  const [snoozing, setSnoozing] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    const [projects, capacities, assignments, progress, snoozeData, operators, leaves] = await Promise.all([
      supabase.from('projects').select('*').neq('status', 'Other').neq('status', 'Finished'),
      supabase.from('weekly_capacity').select('*').eq('year', CURRENT_YEAR).order('week_number'),
      supabase.from('operator_assignments').select('*, project:projects(name,region,status,category)').eq('year', CURRENT_YEAR),
      supabase.from('project_progress').select('*').eq('year', CURRENT_YEAR).order('week_number').limit(2000),
      supabase.from('alert_snoozes').select('*'),
      supabase.from('operators').select('*').eq('active', true),
      supabase.from('operator_leaves').select('*').order('start_date', { ascending: false }),
    ])

    const now = new Date()
    const snoozeMap: Record<string, string> = {}
    ;(snoozeData.data || []).forEach((s: any) => {
      if (new Date(s.snoozed_until) > now) snoozeMap[s.alert_key] = s.snoozed_until
    })
    setSnoozes(snoozeMap)

    const generatedAlerts: Alert[] = []

    // Build O(n) lookup Map — avoids O(n²) inner .filter() in every forEach loop
    const progressByProject = new Map<string, any[]>()
    ;(progress.data || []).forEach((pr: any) => {
      if (!progressByProject.has(pr.project_id)) progressByProject.set(pr.project_id, [])
      progressByProject.get(pr.project_id)!.push(pr)
    })

    const activeProjects = (projects.data || []).filter((p: any) => p.status === 'Committed' || p.status === 'Pipeline')
    const committedProjects = activeProjects.filter((p: any) => p.status === 'Committed')

    // ── Capacity alerts (next 8 weeks) ────────────────────────────────────
    for (let i = 0; i < 8; i++) {
      const wk = CURRENT_WEEK + i
      if (wk > 52) break
      const cap = (capacities.data || []).find((c: any) => c.week_number === wk)
      if (!cap) continue
      const summary = computeWeeklySummary(wk, CURRENT_YEAR, cap, projects.data || [], assignments.data || [])
      if (summary.is_over_capacity) {
        const key = `cap-over-${wk}`
        if (!snoozeMap[key]) generatedAlerts.push({
          key, type: 'critical', category: 'Capacity',
          title: `Over capacity — Week ${wk}`,
          detail: `Balance is ${summary.global_balance} (${Math.abs(summary.global_balance)} systems short). Committed: ${summary.committed_eu + summary.committed_us}, Pipeline: ${summary.pipeline_total}, Total: ${summary.in_use + summary.pipeline_total} vs ${summary.total_capacity} capacity.`,
          link: `/plan?week=${wk}`, actionLabel: 'Review in Plan', week: wk
        })
      } else if (summary.is_tight) {
        const key = `cap-tight-${wk}`
        if (!snoozeMap[key]) generatedAlerts.push({
          key, type: 'warning', category: 'Capacity',
          title: `Tight capacity — Week ${wk}`,
          detail: `Only ${summary.global_balance} system${summary.global_balance !== 1 ? 's' : ''} available. Utilization: ${summary.utilization_pct}%.`,
          link: `/plan?week=${wk}`, actionLabel: 'Review in Plan', week: wk
        })
      }
    }

    // ── Stale progress (no images logged 2+ weeks) ────────────────────────
    committedProjects.forEach((p: any) => {
      const projectProgress = (progressByProject.get(p.id) || []).sort((a: any, b: any) => b.week_number - a.week_number)
      const latest = projectProgress[0]
      const weeksSince = latest ? CURRENT_WEEK - latest.week_number : CURRENT_WEEK
      const key = `progress-stale-${p.id}`
      if (weeksSince >= 2 && !snoozeMap[key]) {
        generatedAlerts.push({
          key, type: weeksSince >= 4 ? 'critical' : 'warning', category: 'Progress',
          title: `No progress logged — ${p.name}`,
          detail: latest ? `Last entry was Week ${latest.week_number} (${weeksSince} weeks ago, ${imagesToKm(latest.cumulative_images)} km).` : 'No progress has ever been logged for this project.',
          link: `/progress?project=${p.id}`, actionLabel: 'Log Progress', projectId: p.id
        })
      }
    })

    // ── Projects behind pace ──────────────────────────────────────────────
    committedProjects.forEach((p: any) => {
      if (!p.end_date || !p.total_km || !p.start_date) return
      const projectProgress = (progressByProject.get(p.id) || []).sort((a: any, b: any) => a.week_number - b.week_number)
      if (projectProgress.length < 2) return
      const newest = projectProgress[projectProgress.length - 1]
      const oldest = projectProgress[Math.max(0, projectProgress.length - 4)]
      const kmDiff = imagesToKm(newest.cumulative_images) - imagesToKm(oldest.cumulative_images)
      const weeksDiff = Math.max(1, newest.week_number - oldest.week_number)
      const actualKmPerWeek = kmDiff / weeksDiff
      if (actualKmPerWeek <= 0) return
      const kmDone = imagesToKm(newest.cumulative_images)
      const kmRemaining = p.total_km - kmDone
      const weeksToFinish = kmRemaining / actualKmPerWeek
      const projectedEnd = new Date()
      projectedEnd.setDate(projectedEnd.getDate() + weeksToFinish * 7)
      const endDate = new Date(p.end_date)
      const weeksLate = Math.ceil((projectedEnd.getTime() - endDate.getTime()) / (7 * 24 * 3600 * 1000))
      const key = `pace-late-${p.id}`
      if (weeksLate >= 2 && !snoozeMap[key]) {
        generatedAlerts.push({
          key, type: weeksLate >= 4 ? 'critical' : 'warning', category: 'Progress',
          title: `Behind schedule — ${p.name}`,
          detail: `At current pace (${actualKmPerWeek.toFixed(0)} km/wk), project finishes ${weeksLate} weeks late. Projected: ${projectedEnd.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}.`,
          link: `/progress?project=${p.id}`, actionLabel: 'View Progress', projectId: p.id
        })
      }
    })

    // ── Missing PM on committed projects ─────────────────────────────────
    committedProjects.filter((p: any) => !p.pm).forEach((p: any) => {
      const key = `no-pm-${p.id}`
      if (!snoozeMap[key]) generatedAlerts.push({
        key, type: 'warning', category: 'Data Quality',
        title: `No PM assigned — ${p.name}`,
        detail: 'Committed project without a project manager.',
        link: `/projects?id=${p.id}`, actionLabel: 'Edit Project', projectId: p.id
      })
    })

    // ── Missing KM target ─────────────────────────────────────────────────
    activeProjects.filter((p: any) => !p.total_km || p.total_km <= 0).forEach((p: any) => {
      const key = `no-km-${p.id}`
      if (!snoozeMap[key]) generatedAlerts.push({
        key, type: 'info', category: 'Data Quality',
        title: `No KM target — ${p.name}`,
        detail: 'Project has no total KM set. Forecasting and progress tracking won\'t work.',
        link: `/projects?id=${p.id}`, actionLabel: 'Edit Project', projectId: p.id
      })
    })

    // ── Missing start date ────────────────────────────────────────────────
    activeProjects.filter((p: any) => !p.start_date).forEach((p: any) => {
      const key = `no-start-${p.id}`
      if (!snoozeMap[key]) generatedAlerts.push({
        key, type: 'info', category: 'Data Quality',
        title: `No start date — ${p.name}`,
        detail: 'Project has no start date. Add one to enable forecast calculations.',
        link: `/projects?id=${p.id}`, actionLabel: 'Edit Project', projectId: p.id
      })
    })

    // ── Upcoming leave affecting assignments ──────────────────────────────
    const upcomingLeaves = (leaves.data || []).filter((l: any) => new Date(l.end_date) >= now)
    upcomingLeaves.slice(0, 5).forEach((l: any) => {
      const op = (operators.data || []).find((o: any) => o.id === l.operator_id)
      const key = `leave-${l.id}`
      if (!snoozeMap[key]) generatedAlerts.push({
        key, type: 'info', category: 'Operators',
        title: `Upcoming absence — ${op?.name || 'Operator'}`,
        detail: `${l.leave_type.charAt(0).toUpperCase() + l.leave_type.slice(1)} from ${l.start_date} to ${l.end_date}.${l.notes ? ' Note: ' + l.notes : ''} Check Gantt for impact.`,
        link: `/settings?tab=operators`, actionLabel: 'View Gantt'
      })
    })

    setAlerts(generatedAlerts)
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const snoozeAlert = async (key: string) => {
    setSnoozing(key)
    const until = new Date()
    until.setDate(until.getDate() + 7)
    await supabase.from('alert_snoozes').upsert({ alert_key: key, snoozed_until: until.toISOString(), snoozed_by: 'User' }, { onConflict: 'alert_key' })
    await load()
    setSnoozing(null)
  }

  const dismissAlert = async (key: string) => {
    const until = new Date()
    until.setFullYear(until.getFullYear() + 1)
    await supabase.from('alert_snoozes').upsert({ alert_key: key, snoozed_until: until.toISOString() }, { onConflict: 'alert_key' })
    setAlerts(prev => prev.filter(a => a.key !== key))
  }

  const filtered = alerts.filter(a => filter === 'all' || a.type === filter)
  const counts = { critical: alerts.filter(a => a.type === 'critical').length, warning: alerts.filter(a => a.type === 'warning').length, info: alerts.filter(a => a.type === 'info').length }
  const TYPE_COLOR = { critical: 'var(--red)', warning: 'var(--amber)', info: 'var(--blue)' }
  const TYPE_ICON = { critical: '⚡', warning: '⚠', info: 'ℹ' }
  const CATEGORIES = [...new Set(filtered.map(a => a.category))]

  return (
    <Shell>
      <div style={{ borderBottom: '1px solid var(--border)', padding: '18px 28px', background: 'var(--card)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: 18, fontWeight: 800 }}>Alerts</h1>
          <p style={{ color: 'var(--dim)', fontSize: 12, marginTop: 2 }}>Smart alerts · snooze or dismiss · check before your Monday meeting</p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <Btn variant="secondary" onClick={load} style={{ fontSize: 11 }}>↻ Refresh</Btn>
          {(['all', 'critical', 'warning', 'info'] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)} style={{ background: filter === f ? `${f === 'all' ? 'rgba(0,212,184,0.12)' : `${TYPE_COLOR[f as keyof typeof TYPE_COLOR]}18`}` : 'var(--card)', border: `1px solid ${filter === f ? (f === 'all' ? 'rgba(0,212,184,0.3)' : `${TYPE_COLOR[f as keyof typeof TYPE_COLOR]}44`) : 'var(--border)'}`, color: filter === f ? (f === 'all' ? 'var(--teal)' : TYPE_COLOR[f as keyof typeof TYPE_COLOR]) : 'var(--dim)', borderRadius: 6, padding: '5px 12px', fontSize: 11, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}>
              {f !== 'all' && <span>{TYPE_ICON[f as keyof typeof TYPE_ICON]}</span>}
              <span style={{ textTransform: 'capitalize' }}>{f}</span>
              {f !== 'all' && counts[f as keyof typeof counts] > 0 && <span style={{ background: TYPE_COLOR[f as keyof typeof TYPE_COLOR], color: '#000', borderRadius: 10, fontSize: 9, fontWeight: 800, padding: '1px 5px', minWidth: 16, textAlign: 'center' }}>{counts[f as keyof typeof counts]}</span>}
            </button>
          ))}
        </div>
      </div>

      <div style={{ padding: '22px 28px', display: 'flex', flexDirection: 'column', gap: 6 }}>
        {loading ? (
          [1, 2, 3].map(i => <div key={i} style={{ height: 72, background: 'var(--card)', borderRadius: 12, animation: 'pulse 1.5s infinite' }} />)
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 0' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>✅</div>
            <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 6 }}>All clear</div>
            <div style={{ color: 'var(--dim)', fontSize: 13 }}>No {filter !== 'all' ? filter : ''} alerts at this time</div>
          </div>
        ) : (
          CATEGORIES.map(cat => (
            <div key={cat}>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--muted)', marginBottom: 6, marginTop: 10 }}>{cat}</div>
              {filtered.filter(a => a.category === cat).map(alert => (
                <div key={alert.key} style={{ background: 'var(--card)', border: `1px solid ${TYPE_COLOR[alert.type]}22`, borderLeft: `3px solid ${TYPE_COLOR[alert.type]}`, borderRadius: 10, padding: '13px 16px', marginBottom: 6, display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                  <span style={{ fontSize: 18, flexShrink: 0, marginTop: 1 }}>{TYPE_ICON[alert.type]}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 13, color: TYPE_COLOR[alert.type], marginBottom: 4 }}>{alert.title}</div>
                    <div style={{ color: 'var(--dim)', fontSize: 12, lineHeight: 1.6 }}>{alert.detail}</div>
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    <a href={alert.link} style={{ textDecoration: 'none', background: `${TYPE_COLOR[alert.type]}15`, border: `1px solid ${TYPE_COLOR[alert.type]}44`, borderRadius: 6, padding: '5px 12px', color: TYPE_COLOR[alert.type], fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap' }}>{alert.actionLabel} →</a>
                    <button onClick={() => snoozeAlert(alert.key)} disabled={snoozing === alert.key} title="Snooze for 1 week" style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--muted)', cursor: 'pointer', fontSize: 11, padding: '5px 10px' }}>{snoozing === alert.key ? '…' : '💤 1wk'}</button>
                    <button onClick={() => dismissAlert(alert.key)} title="Dismiss permanently" style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--muted)', cursor: 'pointer', fontSize: 13, padding: '5px 9px' }}>✕</button>
                  </div>
                </div>
              ))}
            </div>
          ))
        )}
      </div>
    </Shell>
  )
}

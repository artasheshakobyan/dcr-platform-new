'use client'
import { useEffect, useState, useMemo } from 'react'
import Shell from '@/components/ui/Shell'
import { KpiTile, Card, SectionHead, ChartTooltip, REGION_C, STATUS_C, Pill, PageHeader } from '@/components/ui'
import { supabase, WeeklyCapacity, OperatorAssignment, imagesToKm } from '@/lib/supabase'
import { Project } from '@/types'
import { computeWeeklySummary } from '@/lib/capacity'
import { getISOWeek } from 'date-fns'
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Line } from 'recharts'
import Link from 'next/link'

const CURRENT_WEEK = getISOWeek(new Date())
const CURRENT_YEAR = new Date().getFullYear()
const hour = new Date().getHours()
const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'

export default function Home() {
  const [projects, setProjects] = useState<Project[]>([])
  const [capacities, setCapacities] = useState<WeeklyCapacity[]>([])
  const [assignments, setAssignments] = useState<OperatorAssignment[]>([])
  const [progress, setProgress] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [onboardingDone, setOnboardingDone] = useState(true)

  useEffect(() => {
    async function load() {
      const [p, c, a, pr] = await Promise.all([
        supabase.from('projects').select('*').neq('status', 'Finished').neq('status', 'Other'),
        supabase.from('weekly_capacity').select('*').eq('year', CURRENT_YEAR).order('week_number'),
        supabase.from('operator_assignments').select('*').eq('year', CURRENT_YEAR),
        supabase.from('project_progress').select('*').eq('year', CURRENT_YEAR),
      ])
      setProjects(p.data || [])
      setCapacities(c.data || [])
      setAssignments(a.data || [])
      setProgress(pr.data || [])
      setLoading(false)
      if (!p.data?.length) setOnboardingDone(false)
    }
    load()
  }, [])

  const weeklyData = useMemo(() =>
    capacities.map(cap => {
      const s = computeWeeklySummary(cap.week_number, CURRENT_YEAR, cap, projects, assignments)
      return { ...s, label: `W${cap.week_number}` }
    }), [capacities, projects, assignments])

  const curr = weeklyData.find(w => w.week_number === CURRENT_WEEK) || weeklyData[0]
  const nextCritical = weeklyData.find(w => w.week_number > CURRENT_WEEK && w.is_over_capacity)
  const staleProjects = projects.filter(p => {
    if (p.status !== 'Committed') return false
    const entries = progress.filter(pr => pr.project_id === p.id)
    if (!entries.length) return true
    const latest = entries.sort((a: any, b: any) => b.week_number - a.week_number)[0]
    return CURRENT_WEEK - latest.week_number > 2
  })

  // 3 items to act on
  const actionItems = useMemo(() => {
    const items: { icon: string; color: string; title: string; detail: string; href: string; action: string }[] = []
    if (curr && curr.is_over_capacity) items.push({ icon: '⚡', color: 'var(--red)', title: `Week ${CURRENT_WEEK} is over capacity`, detail: `${Math.abs(curr.global_balance)} systems over limit — decisions needed now`, href: '/plan', action: 'Open Plan' })
    if (nextCritical) items.push({ icon: '⚠', color: 'var(--amber)', title: `Week ${nextCritical.week_number} at risk`, detail: `Balance: ${nextCritical.global_balance} systems — plan ahead`, href: '/command-center', action: 'View in Command Center' })
    if (staleProjects.length > 0) items.push({ icon: '📊', color: 'var(--amber)', title: `${staleProjects.length} project${staleProjects.length > 1 ? 's' : ''} not logged in 2+ weeks`, detail: staleProjects.slice(0, 2).map((p: any) => p.name).join(', ') + (staleProjects.length > 2 ? ` + ${staleProjects.length - 2} more` : ''), href: '/progress', action: 'Log Progress' })
    const nopm = projects.filter(p => p.status === 'Committed' && !p.pm)
    if (nopm.length > 0) items.push({ icon: '👷', color: 'var(--violet)', title: `${nopm.length} committed project${nopm.length > 1 ? 's' : ''} missing a PM`, detail: nopm[0].name + (nopm.length > 1 ? ` + ${nopm.length - 1} more` : ''), href: '/projects', action: 'Fix in Projects' })
    if (!items.length) items.push({ icon: '✅', color: 'var(--green)', title: 'All clear this week', detail: `Utilization ${curr?.utilization_pct ?? 0}% · ${projects.filter(p => p.status === 'Committed').length} committed projects running`, href: '/plan', action: 'View Plan' })
    return items.slice(0, 3)
  }, [curr, nextCritical, staleProjects, projects])

  if (loading) return <Shell><div style={{ padding: 40, color: 'var(--dim)' }}>Loading…</div></Shell>

  return (
    <Shell>
      <PageHeader title="Home" sub={`Week ${CURRENT_WEEK} · ${CURRENT_YEAR} · Real-time overview`}
        actions={<>
          {curr && curr.is_over_capacity && <Pill color="var(--red)">⚡ Over Capacity</Pill>}
          <Pill color="var(--teal)">● Live</Pill>
        </>} />

      <div style={{ padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: 24 }}>

        {/* Onboarding — only show if no projects */}
        {!onboardingDone && (
          <Card style={{ padding: '24px 28px' }} accent="var(--teal)">
            <SectionHead>🚀 Welcome to DCR Platform</SectionHead>
            <p style={{ color: 'var(--dim)', fontSize: 13, marginBottom: 20 }}>Get started in 4 steps to make the platform work for your team.</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12 }}>
              {[
                { n: 1, title: 'Add a project', icon: '📁', href: '/projects' },
                { n: 2, title: 'Set your capacity', icon: '📅', href: '/plan' },
                { n: 3, title: 'Assign an operator', icon: '👷', href: '/operators' },
                { n: 4, title: 'Log progress', icon: '📊', href: '/progress' },
              ].map(s => (
                <Link key={s.n} href={s.href} style={{ textDecoration: 'none' }}>
                  <div style={{ background: 'var(--card2)', borderRadius: 10, padding: '14px 16px', border: '1px solid var(--border)', cursor: 'pointer' }}>
                    <div style={{ fontSize: 22, marginBottom: 8 }}>{s.icon}</div>
                    <div style={{ color: 'var(--muted)', fontSize: 10, fontWeight: 700, marginBottom: 3 }}>Step {s.n}</div>
                    <div style={{ fontWeight: 700, fontSize: 13 }}>{s.title}</div>
                  </div>
                </Link>
              ))}
            </div>
          </Card>
        )}

        {/* Greeting + 3 Action Items */}
        <div>
          <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 4 }}>{greeting} 👋</div>
          <div style={{ color: 'var(--dim)', fontSize: 13, marginBottom: 16 }}>Here's what needs your attention today.</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {actionItems.map((item, i) => (
              <div key={i} style={{ background: 'var(--card)', border: `1px solid ${item.color}33`, borderLeft: `3px solid ${item.color}`, borderRadius: 10, padding: '14px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ fontSize: 18 }}>{item.icon}</span>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 13, color: item.color }}>{item.title}</div>
                    <div style={{ color: 'var(--dim)', fontSize: 12, marginTop: 2 }}>{item.detail}</div>
                  </div>
                </div>
                <Link href={item.href} style={{ textDecoration: 'none' }}>
                  <button style={{ background: `${item.color}18`, border: `1px solid ${item.color}44`, borderRadius: 7, padding: '7px 14px', color: item.color, fontWeight: 700, fontSize: 12, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                    {item.action} →
                  </button>
                </Link>
              </div>
            ))}
          </div>
        </div>

        {/* KPI Strip — most important 5 numbers */}
        {curr && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12 }}>
            <KpiTile label="Total Capacity" value={curr.total_capacity} color="var(--teal)" />
            <KpiTile label="Committed (EU+US)" value={curr.committed_eu + curr.committed_us} color="var(--blue)" />
            <KpiTile label="Pipeline" value={curr.pipeline_total} color="var(--amber)" sub="included in balance" />
            <KpiTile label="Global Balance" value={curr.global_balance < 0 ? `(${Math.abs(curr.global_balance)})` : curr.global_balance} color={curr.global_balance < 0 ? 'var(--red)' : 'var(--green)'} alert={curr.global_balance < 0} />
            <KpiTile label="Utilization" value={`${curr.utilization_pct}%`} color={curr.utilization_pct > 90 ? 'var(--red)' : curr.utilization_pct > 75 ? 'var(--amber)' : 'var(--teal)'} />
          </div>
        )}

        {/* 8-week outlook strip */}
        <Card style={{ padding: '18px 20px' }}>
          <SectionHead>8-Week Risk Outlook</SectionHead>
          <div style={{ display: 'flex', gap: 6 }}>
            {weeklyData.filter(w => w.week_number >= CURRENT_WEEK).slice(0, 8).map(w => (
              <Link key={w.week_number} href={`/plan?week=${w.week_number}`} style={{ textDecoration: 'none', flex: 1 }}>
                <div style={{
                  borderRadius: 8, padding: '10px 4px', textAlign: 'center', cursor: 'pointer',
                  background: w.is_over_capacity ? 'rgba(239,68,68,0.18)' : w.is_tight ? 'rgba(245,158,11,0.15)' : 'rgba(16,185,129,0.1)',
                  border: `1px solid ${w.is_over_capacity ? 'var(--red)' : w.is_tight ? 'var(--amber)' : 'rgba(16,185,129,0.3)'}`,
                  borderTop: `3px solid ${w.is_over_capacity ? 'var(--red)' : w.is_tight ? 'var(--amber)' : 'var(--green)'}`,
                }}>
                  <div style={{ fontWeight: 700, fontSize: 11, color: w.is_over_capacity ? 'var(--red)' : w.is_tight ? 'var(--amber)' : 'var(--green)' }}>W{w.week_number}</div>
                  <div style={{ fontSize: 13, fontWeight: 800, fontFamily: 'monospace', color: 'var(--text)', marginTop: 4 }}>{w.global_balance}</div>
                  <div style={{ fontSize: 9, color: 'var(--muted)', marginTop: 2 }}>balance</div>
                  {w.week_number === CURRENT_WEEK && <div style={{ fontSize: 8, fontWeight: 800, color: 'var(--teal)', marginTop: 2 }}>NOW</div>}
                </div>
              </Link>
            ))}
          </div>
        </Card>

        {/* Charts row */}
        <div style={{ display: 'grid', gridTemplateColumns: '3fr 2fr', gap: 20 }}>
          <Card style={{ padding: '20px 20px 12px' }}>
            <SectionHead>Global Balance · Full Year</SectionHead>
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={weeklyData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id="balGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--teal)" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="var(--teal)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="label" tick={{ fill: 'var(--muted)', fontSize: 9 }} tickLine={false} interval={5} />
                <YAxis tick={{ fill: 'var(--muted)', fontSize: 9 }} tickLine={false} axisLine={false} />
                <Tooltip content={<ChartTooltip />} />
                <ReferenceLine y={0} stroke="var(--red)" strokeDasharray="3 3" />
                <ReferenceLine x={`W${CURRENT_WEEK}`} stroke="var(--teal)" strokeDasharray="4 3" />
                <Area type="monotone" dataKey="global_balance" name="Balance" stroke="var(--teal)" strokeWidth={2} fill="url(#balGrad)" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </Card>
          <Card style={{ padding: '20px 20px 12px' }}>
            <SectionHead accent="var(--amber)">Committed vs Pipeline</SectionHead>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={weeklyData.filter(w => w.week_number >= CURRENT_WEEK - 2).slice(0, 10)} margin={{ top: 4, right: 8, bottom: 0, left: 0 }} barSize={12}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="label" tick={{ fill: 'var(--muted)', fontSize: 9 }} tickLine={false} />
                <YAxis tick={{ fill: 'var(--muted)', fontSize: 9 }} tickLine={false} axisLine={false} />
                <Tooltip content={<ChartTooltip />} />
                <Bar dataKey="committed_eu" name="EU Commit" fill="var(--blue)" stackId="a" />
                <Bar dataKey="committed_us" name="US Commit" fill="var(--violet)" stackId="a" />
                <Bar dataKey="pipeline_total" name="Pipeline" fill="rgba(245,158,11,0.5)" stackId="a" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Card>
        </div>

        {/* Active projects quick-view */}
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <SectionHead>Active Projects — Week {CURRENT_WEEK}</SectionHead>
            <div style={{ display: 'flex', gap: 8 }}>
              <Pill small color="var(--teal)">{projects.filter(p => p.status === 'Committed').length} committed</Pill>
              <Pill small color="var(--amber)">{projects.filter(p => p.status === 'Pipeline').length} pipeline</Pill>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '2.5fr 65px 95px 75px 75px 75px 90px', background: 'var(--card2)', padding: '8px 20px', borderBottom: '1px solid var(--border)' }}>
            {['Project', 'Region', 'Status', 'Sys/Wk', 'KM Target', 'Category', 'PM'].map(h => (
              <div key={h} style={{ color: 'var(--muted)', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{h}</div>
            ))}
          </div>
          <div style={{ maxHeight: 300, overflowY: 'auto' }}>
            {projects.slice(0, 25).map((p, i) => {
              const latestPr = progress.filter(pr => pr.project_id === p.id).sort((a: any, b: any) => b.week_number - a.week_number)[0]
              const km = latestPr ? imagesToKm(latestPr.cumulative_images) : 0
              const pct = p.total_km > 0 ? Math.round(km / p.total_km * 100) : 0
              return (
                <Link key={i} href={`/progress?project=${p.id}`} style={{ textDecoration: 'none', display: 'grid', gridTemplateColumns: '2.5fr 65px 95px 75px 75px 75px 90px', padding: '9px 20px', borderBottom: '1px solid rgba(30,45,66,0.5)', cursor: 'pointer' }}
                  onMouseEnter={e => ((e.currentTarget as HTMLElement).style.background = 'var(--card2)')}
                  onMouseLeave={e => ((e.currentTarget as HTMLElement).style.background = 'transparent')}>
                  <div style={{ fontSize: 12, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingRight: 8, color: 'var(--text)' }}>{p.name}</div>
                  <Pill small color={REGION_C[p.region] || 'var(--muted)'}>{p.region}</Pill>
                  <Pill small color={STATUS_C[p.status] || 'var(--muted)'}>{p.status}</Pill>
                  <div style={{ color: 'var(--teal)', fontFamily: 'monospace', fontWeight: 700, fontSize: 13 }}>{p.desired_systems_per_week || '—'}</div>
                  <div style={{ fontSize: 11 }}>
                    <span style={{ color: 'var(--text)', fontFamily: 'monospace' }}>{p.total_km?.toLocaleString() || '—'}</span>
                    {pct > 0 && <span style={{ color: 'var(--muted)', fontSize: 10 }}> ({pct}%)</span>}
                  </div>
                  <Pill small color={p.category === 'US' ? 'var(--violet)' : 'var(--blue)'}>{p.category}</Pill>
                  <div style={{ color: 'var(--dim)', fontSize: 12 }}>{p.pm || '—'}</div>
                </Link>
              )
            })}
          </div>
        </Card>

      </div>
    </Shell>
  )
}

'use client'
import { useEffect, useState, useMemo, useRef } from 'react'
import Shell from '@/components/ui/Shell'
import { Card, SectionHead, Pill, REGION_C } from '@/components/ui'
import { supabase, WeeklyCapacity, OperatorAssignment, WeeklyDecision } from '@/lib/supabase'
import { Project } from '@/types'
import { computeWeeklySummary, WeeklySummary } from '@/lib/capacity'
import { getISOWeek } from 'date-fns'
import { useSearchParams, useRouter } from 'next/navigation'

const CURRENT_WEEK = getISOWeek(new Date())
const CURRENT_YEAR = new Date().getFullYear()

// Claude AI assistant integration
async function askClaude(question: string, context: any): Promise<string> {
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1000,
        messages: [{
          role: 'user',
          content: `You are the DCR Platform AI assistant for Cyclomedia. You help with capacity planning for a fleet of road-scanning systems (DCR systems) deployed across EU and US regions.

Context data:
${JSON.stringify(context, null, 2)}

Question: ${question}

Answer concisely and practically. Focus on specific numbers, dates, and actionable recommendations. Use the data provided.`
        }]
      })
    })
    const data = await response.json()
    return data.content?.[0]?.text || 'Unable to get response.'
  } catch {
    return 'AI assistant is currently unavailable. Please check your connection.'
  }
}

export default function CommandCenterDashboard() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const urlWeek = searchParams.get('week')

  const [projects, setProjects] = useState<Project[]>([])
  const [capacities, setCapacities] = useState<WeeklyCapacity[]>([])
  const [assignments, setAssignments] = useState<OperatorAssignment[]>([])
  const [decisions, setDecisions] = useState<WeeklyDecision[]>([])
  const [operators, setOperators] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedWeek, setSelectedWeek] = useState(urlWeek ? parseInt(urlWeek) : CURRENT_WEEK)
  const [windowStart, setWindowStart] = useState(Math.max(1, (urlWeek ? parseInt(urlWeek) : CURRENT_WEEK) - 1))
  const [fullscreen, setFullscreen] = useState(false)
  const [decision, setDecision] = useState('')
  const [savingDecision, setSavingDecision] = useState(false)
  const [aiQuestion, setAiQuestion] = useState('')
  const [aiAnswer, setAiAnswer] = useState('')
  const [aiLoading, setAiLoading] = useState(false)

  useEffect(() => {
    async function load() {
      const [p, c, a, d, ops] = await Promise.all([
        supabase.from('projects').select('*').neq('status', 'Finished').neq('status', 'Other'),
        supabase.from('weekly_capacity').select('*').eq('year', CURRENT_YEAR).order('week_number'),
        supabase.from('operator_assignments').select('*, operator:operators(name,region)')
          .eq('year', CURRENT_YEAR)
          .gte('week_number', Math.max(1, CURRENT_WEEK - 4))
          .lte('week_number', Math.min(52, CURRENT_WEEK + 16)),
        supabase.from('weekly_decisions').select('*').eq('year', CURRENT_YEAR).order('week_number'),
        supabase.from('operators').select('*').eq('active', true).order('name'),
      ])
      setProjects(p.data || [])
      setCapacities(c.data || [])
      setAssignments(a.data || [])
      setDecisions(d.data || [])
      setOperators(ops.data || [])
      setLoading(false)
    }
    load()
  }, [])

  const weeklyData: WeeklySummary[] = useMemo(() =>
    capacities
      .filter(cap => cap.week_number >= Math.max(1, CURRENT_WEEK - 4) && cap.week_number <= Math.min(52, CURRENT_WEEK + 16))
      .map(cap => computeWeeklySummary(cap.week_number, CURRENT_YEAR, cap, projects, assignments)),
    [capacities, projects, assignments])

  const curr = weeklyData.find(w => w.week_number === selectedWeek)
  const currDecision = decisions.find(d => d.week_number === selectedWeek)

  useEffect(() => { setDecision(currDecision?.decision || '') }, [currDecision])

  const weekAssignments = assignments.filter(a => a.week_number === selectedWeek && a.year === CURRENT_YEAR && a.status === 'assigned')
  const projectSystemsMap: Record<string, number> = {}
  weekAssignments.forEach(a => { projectSystemsMap[a.project_id] = (projectSystemsMap[a.project_id] || 0) + 1 })
  const activeProjects = projects.filter(p => projectSystemsMap[p.id] > 0)

  // Operator assignments for the week
  const operatorWeekAssignments = weekAssignments.map(a => ({
    operator: (a as any).operator,
    project: projects.find(p => p.id === a.project_id),
  })).filter(x => x.operator && x.project)

  const saveDecision = async () => {
    if (!decision.trim()) return
    setSavingDecision(true)
    await supabase.from('weekly_decisions').upsert({
      week_number: selectedWeek, year: CURRENT_YEAR,
      decision, decided_by: 'Planning Team', created_at: new Date().toISOString()
    }, { onConflict: 'week_number,year' })
    setSavingDecision(false)
  }

  const handleAsk = async () => {
    if (!aiQuestion.trim()) return
    setAiLoading(true)
    const context = {
      currentWeek: selectedWeek, year: CURRENT_YEAR,
      metrics: curr,
      projects: projects.map(p => ({ name: p.name, region: p.region, status: p.status, systems: p.desired_systems_per_week, totalKm: p.total_km, startDate: p.start_date, endDate: p.end_date })),
      next8Weeks: weeklyData.filter(w => w.week_number >= CURRENT_WEEK).slice(0, 8).map(w => ({ week: w.week_number, balance: w.global_balance, utilization: w.utilization_pct, isOverCapacity: w.is_over_capacity })),
    }
    const answer = await askClaude(aiQuestion, context)
    setAiAnswer(answer)
    setAiLoading(false)
  }

  const shareUrl = typeof window !== 'undefined' ? `${window.location.origin}/command-center?week=${selectedWeek}` : ''

  const content = (
    <div style={{ padding: fullscreen ? '24px 40px' : '24px 28px', display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* Week selector + controls */}
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flex: 1, overflow: 'hidden' }}>
          {/* Left arrow */}
          <button onClick={() => { const nw = Math.max(1, windowStart - 1); setWindowStart(nw); if (selectedWeek < nw) { setSelectedWeek(nw); router.push(`/command-center?week=${nw}`) } }}
            style={{ background: 'var(--card2)', border: '1px solid var(--border)', borderRadius: 7, padding: '8px 10px', color: 'var(--muted)', cursor: 'pointer', fontSize: 16, fontWeight: 700, flexShrink: 0 }}>‹</button>
          {/* Week chips — windowed */}
          {Array.from({length: 8}, (_, i) => windowStart + i).filter(w => w <= 52).map(w => {
            const wd = weeklyData.find(x => x.week_number === w)
            return (
              <button key={w} onClick={() => { setSelectedWeek(w); router.push(`/command-center?week=${w}`) }} style={{
                flex: 1, padding: '7px 4px', borderRadius: 8, fontWeight: 700, fontSize: 11, cursor: 'pointer', textAlign: 'center',
                border: selectedWeek === w ? '2px solid var(--teal)' : '1px solid var(--border)',
                background: wd?.is_over_capacity ? 'rgba(239,68,68,0.15)' : wd?.is_tight ? 'rgba(245,158,11,0.12)' : 'var(--card)',
                color: wd?.is_over_capacity ? 'var(--red)' : wd?.is_tight ? 'var(--amber)' : w === selectedWeek ? 'var(--teal)' : 'var(--dim)',
              }}>
                <div>{w === CURRENT_WEEK ? '●' : ''} W{w}</div>
                {wd && <div style={{ fontFamily: 'monospace', fontSize: 13, marginTop: 2 }}>{wd.global_balance >= 0 ? '+' : ''}{wd.global_balance}</div>}
              </button>
            )
          })}
          {/* Right arrow */}
          <button onClick={() => { const nw = Math.min(52, windowStart + 1); setWindowStart(nw); if (selectedWeek < nw || selectedWeek > nw + 7) { const sw = Math.min(52, nw + 7); setSelectedWeek(sw); router.push(`/command-center?week=${sw}`) } }}
            style={{ background: 'var(--card2)', border: '1px solid var(--border)', borderRadius: 7, padding: '8px 10px', color: 'var(--muted)', cursor: 'pointer', fontSize: 16, fontWeight: 700, flexShrink: 0 }}>›</button>
          {selectedWeek !== CURRENT_WEEK && (
            <button onClick={() => { setSelectedWeek(CURRENT_WEEK); setWindowStart(Math.max(1, CURRENT_WEEK - 1)); router.push(`/command-center?week=${CURRENT_WEEK}`) }}
              style={{ background: 'rgba(0,212,184,0.1)', border: '1px solid rgba(0,212,184,0.3)', borderRadius: 7, padding: '8px 12px', color: 'var(--teal)', cursor: 'pointer', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>Now</button>
          )}
        </div>
        <button onClick={() => { navigator.clipboard.writeText(shareUrl); alert('Link copied!') }} style={{ background: 'var(--card2)', border: '1px solid var(--border)', borderRadius: 7, padding: '7px 14px', color: 'var(--dim)', fontWeight: 600, fontSize: 12, cursor: 'pointer' }}>🔗 Share Link</button>
        <button onClick={() => setFullscreen(f => !f)} style={{ background: fullscreen ? 'rgba(0,212,184,0.13)' : 'var(--card2)', border: `1px solid ${fullscreen ? 'var(--teal)' : 'var(--border)'}`, borderRadius: 7, padding: '7px 14px', color: fullscreen ? 'var(--teal)' : 'var(--dim)', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>
          {fullscreen ? '⊠ Exit Full Screen' : '⊡ Full Screen'}
        </button>
      </div>

      {/* Big KPI numbers — the 5 key metrics */}
      {curr && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 14 }}>
          {[
            { label: 'Total Capacity', value: curr.total_capacity, color: 'var(--teal)' },
            { label: 'Committed', value: curr.committed_eu + curr.committed_us, color: 'var(--blue)' },
            { label: 'Pipeline', value: curr.pipeline_total, color: 'var(--amber)', sub: 'incl. in balance' },
            { label: 'Global Balance', value: curr.global_balance, color: curr.global_balance < 0 ? 'var(--red)' : 'var(--green)', alert: curr.global_balance < 0 },
            { label: 'Utilization', value: `${curr.utilization_pct}%`, color: curr.utilization_pct > 90 ? 'var(--red)' : curr.utilization_pct > 75 ? 'var(--amber)' : 'var(--teal)' },
          ].map(({ label, value, color, sub, alert }: any) => (
            <div key={label} style={{ background: 'var(--card)', border: `1px solid ${color}33`, borderTop: `3px solid ${color}`, borderRadius: 12, padding: fullscreen ? '20px 24px' : '16px 18px', position: 'relative', overflow: 'hidden' }}>
              {alert && <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: 'var(--red)' }} />}
              <div style={{ color: 'var(--muted)', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>{label}</div>
              <div style={{ color, fontSize: fullscreen ? 56 : 40, fontWeight: 800, fontFamily: 'monospace', lineHeight: 1 }}>{value}</div>
              {sub && <div style={{ color: 'var(--muted)', fontSize: 10, marginTop: 4 }}>{sub}</div>}
            </div>
          ))}
        </div>
      )}

      {/* 8-week heatmap strip */}
      <Card style={{ padding: '16px 20px' }}>
        <SectionHead>8-Week Risk Horizon</SectionHead>
        <div style={{ display: 'flex', gap: 8 }}>
          {weeklyData.filter(w => w.week_number >= CURRENT_WEEK).slice(0, 8).map(w => (
            <div key={w.week_number} onClick={() => { setSelectedWeek(w.week_number); router.push(`/command-center?week=${w.week_number}`) }} style={{
              flex: 1, borderRadius: 8, padding: '12px 6px', textAlign: 'center', cursor: 'pointer',
              background: w.is_over_capacity ? 'rgba(239,68,68,0.2)' : w.is_tight ? 'rgba(245,158,11,0.15)' : 'rgba(16,185,129,0.1)',
              border: `2px solid ${w.week_number === selectedWeek ? 'var(--teal)' : w.is_over_capacity ? 'var(--red)' : w.is_tight ? 'var(--amber)' : 'rgba(16,185,129,0.3)'}`,
            }}>
              <div style={{ fontWeight: 800, fontSize: 12, color: w.is_over_capacity ? 'var(--red)' : w.is_tight ? 'var(--amber)' : 'var(--green)' }}>W{w.week_number}</div>
              <div style={{ fontSize: 18, fontWeight: 800, fontFamily: 'monospace', color: 'var(--text)', marginTop: 4 }}>{w.global_balance >= 0 ? '+' : ''}{w.global_balance}</div>
              <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 2 }}>{w.utilization_pct}%</div>
              {w.is_over_capacity && <div style={{ fontSize: 9, color: 'var(--red)', fontWeight: 700, marginTop: 2 }}>OVER</div>}
              {w.is_tight && !w.is_over_capacity && <div style={{ fontSize: 9, color: 'var(--amber)', fontWeight: 700, marginTop: 2 }}>TIGHT</div>}
            </div>
          ))}
        </div>
      </Card>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        {/* Who's where this week */}
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)' }}>
            <SectionHead>Who's Where — Week {selectedWeek}</SectionHead>
          </div>
          <div style={{ maxHeight: 320, overflowY: 'auto' }}>
            {operatorWeekAssignments.length === 0 ? (
              <div style={{ padding: '24px', textAlign: 'center', color: 'var(--dim)', fontSize: 13 }}>No operator assignments this week</div>
            ) : (
              operatorWeekAssignments.map((item, i) => (
                <div key={i} style={{ padding: '10px 18px', borderBottom: '1px solid rgba(30,45,66,0.5)', display: 'grid', gridTemplateColumns: '1fr 1fr auto', alignItems: 'center', gap: 10 }}>
                  <div style={{ fontWeight: 600, fontSize: 12 }}>{item.operator?.name || '—'}</div>
                  <div style={{ fontSize: 11, color: 'var(--dim)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.project?.name || '—'}</div>
                  <Pill small color={REGION_C[item.project?.region || 'EU'] || 'var(--muted)'}>{item.project?.region}</Pill>
                </div>
              ))
            )}
          </div>
        </Card>

        {/* Decision log */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Card style={{ padding: '16px 18px', flex: 1 }}>
            <SectionHead accent="var(--amber)">📝 Week {selectedWeek} Decision Log</SectionHead>
            <textarea value={decision} onChange={e => setDecision(e.target.value)} placeholder="What did we decide this week? (e.g. Delay NCDOT start by 2 weeks, ship 2 systems from EU to US for week 28...)" style={{ width: '100%', background: 'var(--card2)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px', color: 'var(--text)', fontSize: 13, resize: 'vertical', minHeight: 80, fontFamily: 'inherit', outline: 'none' }}
              onFocus={e => { e.target.style.borderColor = 'var(--teal)' }} onBlur={e => { e.target.style.borderColor = 'var(--border)' }} />
            <button onClick={saveDecision} disabled={savingDecision || !decision.trim()} style={{ marginTop: 10, background: 'linear-gradient(135deg,var(--teal),var(--blue))', color: '#000', border: 'none', borderRadius: 7, padding: '8px 18px', fontWeight: 700, fontSize: 13, cursor: 'pointer', opacity: savingDecision ? 0.7 : 1 }}>
              {savingDecision ? 'Saving…' : '💾 Save Decision'}
            </button>
          </Card>
        </div>
      </div>

      {/* AI Capacity Assistant */}
      <Card style={{ padding: '18px 20px' }} accent="var(--violet)">
        <SectionHead accent="var(--violet)">🤖 AI Capacity Assistant</SectionHead>
        <p style={{ color: 'var(--dim)', fontSize: 12, marginBottom: 14 }}>Ask plain-language questions about your capacity. The AI has access to all your project and capacity data.</p>
        <div style={{ display: 'flex', gap: 10 }}>
          <input value={aiQuestion} onChange={e => setAiQuestion(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') handleAsk() }}
            placeholder='e.g. "We just won Amsterdam — 800km, 6 systems from Week 28. What do we need to move or delay?"'
            style={{ flex: 1, background: 'var(--card2)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 14px', color: 'var(--text)', fontSize: 13, outline: 'none' }}
            onFocus={e => { e.target.style.borderColor = 'var(--violet)' }} onBlur={e => { e.target.style.borderColor = 'var(--border)' }} />
          <button onClick={handleAsk} disabled={aiLoading || !aiQuestion.trim()} style={{ background: 'rgba(139,92,246,0.2)', border: '1px solid rgba(139,92,246,0.4)', borderRadius: 8, padding: '10px 20px', color: 'var(--violet)', fontWeight: 700, fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap' }}>
            {aiLoading ? '…' : 'Ask AI'}
          </button>
        </div>
        {aiAnswer && (
          <div style={{ marginTop: 16, background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.2)', borderRadius: 10, padding: '14px 16px', fontSize: 13, color: 'var(--text)', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
            {aiAnswer}
          </div>
        )}
        <div style={{ marginTop: 8, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {['What are the riskiest weeks in the next 8 weeks?', 'Which projects are behind schedule?', 'How many systems are available for a new project next month?'].map(q => (
            <button key={q} onClick={() => setAiQuestion(q)} style={{ background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.2)', borderRadius: 20, padding: '4px 12px', color: 'var(--violet)', fontSize: 11, cursor: 'pointer', fontWeight: 500 }}>{q}</button>
          ))}
        </div>
      </Card>

    </div>
  )

  if (fullscreen) {
    return (
      <div style={{ position: 'fixed', inset: 0, background: 'var(--bg)', zIndex: 200, overflowY: 'auto' }}>
        <div style={{ padding: '16px 40px', background: 'var(--card)', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 28, height: 28, borderRadius: 6, background: 'linear-gradient(135deg,#00D4B8,#3B82F6)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, color: '#000', fontWeight: 900 }}>◈</div>
            <span style={{ fontWeight: 800, fontSize: 16 }}>Command Center · Week {selectedWeek} · {CURRENT_YEAR}</span>
            <Pill color="var(--teal)" small>● Live</Pill>
          </div>
          <button onClick={() => setFullscreen(false)} style={{ background: 'var(--card2)', border: '1px solid var(--border)', borderRadius: 7, padding: '8px 16px', color: 'var(--text)', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>⊠ Exit Full Screen</button>
        </div>
        {content}
      </div>
    )
  }

  return (
    <Shell>
      <div style={{ borderBottom: '1px solid var(--border)', padding: '20px 28px', background: 'var(--card)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 800 }}>Command Center</h1>
          <p style={{ color: 'var(--dim)', fontSize: 12, marginTop: 2 }}>Weekly planning meeting view · Week {selectedWeek} · {CURRENT_YEAR}</p>
        </div>
        <Pill color="var(--teal)">● Live</Pill>
      </div>
      {loading ? <div style={{ padding: 40, color: 'var(--dim)' }}>Loading…</div> : content}
    </Shell>
  )
}

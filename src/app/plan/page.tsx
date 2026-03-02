'use client'
import { useEffect, useState, useMemo } from 'react'
import Shell from '@/components/ui/Shell'
import { Card, Pill, Btn, PageHeader, SectionHead, REGION_C, STATUS_C, ChartTooltip } from '@/components/ui'
import { supabase, WeeklyCapacity, OperatorAssignment, WeeklyDecision } from '@/lib/supabase'
import { Project } from '@/types'
import { computeWeeklySummary, WeeklySummary } from '@/lib/capacity'
import { getISOWeek } from 'date-fns'
import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'

const CURRENT_WEEK = getISOWeek(new Date())
const CURRENT_YEAR = new Date().getFullYear()

function PlanContent() {
  const searchParams = useSearchParams()
  const urlWeek = searchParams.get('week')
  
  const [projects, setProjects] = useState<Project[]>([])
  const [capacities, setCapacities] = useState<WeeklyCapacity[]>([])
  const [assignments, setAssignments] = useState<OperatorAssignment[]>([])
  const [decisions, setDecisions] = useState<WeeklyDecision[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedWeek, setSelectedWeek] = useState(urlWeek ? parseInt(urlWeek) : CURRENT_WEEK)
  const [decision, setDecision] = useState('')
  const [savingDecision, setSavingDecision] = useState(false)
  const [editingCapacity, setEditingCapacity] = useState<Partial<WeeklyCapacity>>({})
  const [savingCap, setSavingCap] = useState(false)

  useEffect(() => {
    async function load() {
      const [p, c, a, d] = await Promise.all([
        supabase.from('projects').select('*').neq('status','Other'),
        supabase.from('weekly_capacity').select('*').eq('year',CURRENT_YEAR).order('week_number'),
        supabase.from('operator_assignments').select('*, project:projects(name,region,status,category)').eq('year',CURRENT_YEAR),
        supabase.from('weekly_decisions').select('*').eq('year',CURRENT_YEAR),
      ])
      setProjects(p.data||[]); setCapacities(c.data||[])
      setAssignments(a.data||[]); setDecisions(d.data||[])
      setLoading(false)
    }
    load()
  }, [])

  const weeklyData: WeeklySummary[] = useMemo(() =>
    capacities.map(cap => computeWeeklySummary(cap.week_number, CURRENT_YEAR, cap, projects, assignments)),
    [capacities, projects, assignments])

  const curr = weeklyData.find(w => w.week_number === selectedWeek)
  const cap = capacities.find(c => c.week_number === selectedWeek)
  const currDecision = decisions.find(d => d.week_number === selectedWeek)

  // Heatmap color
  const heatColor = (w: WeeklySummary) => {
    if (w.is_over_capacity) return '#EF4444'
    if (w.is_tight) return '#F59E0B'
    if (w.global_balance > 20) return '#10B981'
    return '#00D4B8'
  }

  const weekAssignments = assignments.filter(a => a.week_number === selectedWeek && a.year === CURRENT_YEAR && a.status === 'assigned')
  const projectSystemsMap: Record<string,number> = {}
  weekAssignments.forEach(a => { projectSystemsMap[a.project_id] = (projectSystemsMap[a.project_id]||0)+1 })
  const activeProjects = projects.filter(p => projectSystemsMap[p.id] > 0)

  const saveDecision = async () => {
    if (!decision.trim()) return
    setSavingDecision(true)
    await supabase.from('weekly_decisions').upsert({ week_number: selectedWeek, year: CURRENT_YEAR, decision, decided_by: 'Team' }, { onConflict: 'week_number,year' })
    const { data } = await supabase.from('weekly_decisions').select('*').eq('year',CURRENT_YEAR)
    setDecisions(data||[])
    setSavingDecision(false)
  }

  const saveCapacity = async () => {
    if (!cap || Object.keys(editingCapacity).length === 0) return
    setSavingCap(true)
    await supabase.from('weekly_capacity').update(editingCapacity).eq('id', cap.id)
    const { data } = await supabase.from('weekly_capacity').select('*').eq('year',CURRENT_YEAR).order('week_number')
    setCapacities(data||[])
    setEditingCapacity({})
    setSavingCap(false)
  }

  const capVal = (field: keyof WeeklyCapacity) => {
    const v = editingCapacity[field]
    return v !== undefined ? v : cap?.[field]
  }

  const SUMMARY_ROWS = curr ? [
    { label:'Total Capacity', value:curr.total_capacity, color:'var(--teal)', bold:true },
    { label:'Committed EU', value:curr.committed_eu, color:'var(--blue)' },
    { label:'Committed US', value:curr.committed_us, color:'var(--violet)' },
    { label:'Repair EU (incl. Cal.)', value:curr.repair_eu, color:'var(--amber)' },
    { label:'Repair US', value:curr.repair_us, color:'var(--amber)' },
    { label:'R&D', value:curr.rd, color:'var(--violet)' },
    { label:'Spare EU', value:curr.spare_eu, color:'var(--blue)' },
    { label:'Spare US', value:curr.spare_us, color:'var(--blue)' },
    { label:'Pipeline EU', value:curr.pipeline_eu, color:'var(--blue)', indent:true },
    { label:'Pipeline US', value:curr.pipeline_us, color:'var(--violet)', indent:true },
    { label:'Pipeline Total', value:curr.pipeline_total, color:'var(--amber)' },
    { label:'Global Balance', value:curr.global_balance, color:curr.global_balance<0?'var(--red)':'var(--green)', bold:true },
    { label:'Balance EU', value:curr.balance_eu, color:curr.balance_eu<0?'var(--red)':'var(--blue)', indent:true },
    { label:'Balance US', value:curr.balance_us, color:curr.balance_us<0?'var(--red)':'var(--violet)', indent:true },
  ] : []

  if (loading) return <Shell><div style={{ padding:40, color:'var(--dim)' }}>Loading plan…</div></Shell>

  return (
    <Shell>
      <div style={{ padding:'0 0 40px' }}>
        <div style={{ borderBottom:'1px solid var(--border)', padding:'18px 28px', background:'var(--card)', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <div>
            <h1 style={{ fontSize:20, fontWeight:800, letterSpacing:'-0.02em' }}>Plan</h1>
            <p style={{ color:'var(--dim)', fontSize:12, marginTop:2 }}>Capacity planning workspace · Week {selectedWeek} selected</p>
          </div>
          <div style={{ display:'flex', gap:8 }}>
            {curr?.is_over_capacity && <Pill color="var(--red)">⚡ Over Capacity</Pill>}
            {curr?.is_tight && !curr.is_over_capacity && <Pill color="var(--amber)">⚠ Tight</Pill>}
          </div>
        </div>

        <div style={{ padding:'22px 28px', display:'flex', flexDirection:'column', gap:20 }}>

          {/* Heatmap — full year */}
          <Card style={{ padding:'16px 18px' }}>
            <SectionHead>Full Year Heatmap — click a week to select</SectionHead>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(13,1fr)', gap:4, marginBottom:8 }}>
              {weeklyData.map(w => {
                const col = heatColor(w)
                const isSelected = w.week_number === selectedWeek
                const isNow = w.week_number === CURRENT_WEEK
                return (
                  <div key={w.week_number} onClick={() => setSelectedWeek(w.week_number)}
                    title={`Wk${w.week_number}: balance ${w.global_balance}, util ${w.utilization_pct}%`}
                    style={{ background:`${col}${isSelected?'55':'22'}`, border:`1px solid ${col}${isSelected?'99':'44'}`, borderRadius:5, padding:'6px 3px', textAlign:'center', cursor:'pointer', outline: isNow ? `2px solid var(--teal)` : 'none', outlineOffset:1, transition:'all 0.1s' }}>
                    <div style={{ fontSize:8, color:isSelected ? col : 'var(--muted)', fontWeight:700, marginBottom:2 }}>{w.week_number}</div>
                    <div style={{ color:col, fontFamily:'monospace', fontWeight:800, fontSize:10, lineHeight:1 }}>{w.global_balance > 0 ? `+${w.global_balance}` : w.global_balance}</div>
                  </div>
                )
              })}
            </div>
            <div style={{ display:'flex', gap:16, fontSize:10, color:'var(--muted)' }}>
              {[['#10B981','Healthy (>20)'],['#00D4B8','OK (5-20)'],['#F59E0B','Tight (0-4)'],['#EF4444','Over capacity']].map(([c,l]) => (
                <div key={l} style={{ display:'flex', alignItems:'center', gap:4 }}><div style={{ width:10, height:10, borderRadius:2, background:c }}></div>{l}</div>
              ))}
              <div style={{ display:'flex', alignItems:'center', gap:4 }}><div style={{ width:10, height:10, borderRadius:2, border:'2px solid var(--teal)' }}></div>Current week</div>
            </div>
          </Card>

          {/* Week detail */}
          {curr && (
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:18 }}>
              {/* Summary */}
              <Card style={{ padding:0, overflow:'hidden' }}>
                <div style={{ padding:'13px 16px', borderBottom:'1px solid var(--border)', background:'var(--card2)' }}>
                  <SectionHead>Week {selectedWeek} Summary</SectionHead>
                </div>
                <div style={{ padding:'4px 0' }}>
                  {SUMMARY_ROWS.map(({ label, value, color, bold, indent }) => (
                    <div key={label} style={{ display:'flex', justifyContent:'space-between', padding:`7px ${indent?'24px':'16px'}`, borderBottom:'1px solid rgba(30,45,66,0.4)' }}>
                      <span style={{ color:'var(--dim)', fontSize:12, fontWeight:bold?700:400 }}>{label}</span>
                      <span style={{ color, fontFamily:'monospace', fontWeight:bold?800:600, fontSize:13 }}>{typeof value === 'number' && value > 0 && bold && label.includes('Balance') ? `+${value}` : value}</span>
                    </div>
                  ))}
                </div>
              </Card>

              {/* Capacity editor */}
              <Card style={{ padding:'16px' }}>
                <SectionHead accent="var(--blue)">Edit Capacity — Wk{selectedWeek}</SectionHead>
                <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                  {[
                    { field:'total_capacity' as keyof WeeklyCapacity, label:'Total Systems' },
                    { field:'repair_eu' as keyof WeeklyCapacity, label:'Repair EU' },
                    { field:'repair_us' as keyof WeeklyCapacity, label:'Repair US' },
                    { field:'rd_systems' as keyof WeeklyCapacity, label:'R&D' },
                    { field:'spare_eu' as keyof WeeklyCapacity, label:'Spare EU' },
                    { field:'spare_us' as keyof WeeklyCapacity, label:'Spare US' },
                  ].map(({ field, label }) => (
                    <div key={field} style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                      <span style={{ color:'var(--dim)', fontSize:12 }}>{label}</span>
                      <input type="number" value={capVal(field) as number || 0}
                        onChange={e => setEditingCapacity(ec => ({ ...ec, [field]: parseInt(e.target.value)||0 }))}
                        style={{ width:70, background:'var(--card2)', border:'1px solid var(--border)', borderRadius:5, padding:'4px 8px', color:'var(--text)', fontSize:13, fontFamily:'monospace', fontWeight:700, textAlign:'right', outline:'none' }} />
                    </div>
                  ))}
                  {Object.keys(editingCapacity).length > 0 && (
                    <Btn onClick={saveCapacity} disabled={savingCap} style={{ marginTop:4 }}>
                      {savingCap ? 'Saving…' : '💾 Save Changes'}
                    </Btn>
                  )}
                </div>
              </Card>

              {/* Decision log + active projects */}
              <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
                <Card style={{ padding:16 }}>
                  <SectionHead accent="var(--violet)">Decision Log — Wk{selectedWeek}</SectionHead>
                  {currDecision ? (
                    <div>
                      <div style={{ background:'rgba(139,92,246,0.08)', border:'1px solid rgba(139,92,246,0.2)', borderRadius:8, padding:'10px 12px', fontSize:13, lineHeight:1.6, marginBottom:10 }}>{currDecision.decision}</div>
                      <div style={{ color:'var(--muted)', fontSize:11 }}>Recorded by {currDecision.decided_by || 'Team'}</div>
                      <button onClick={() => { setDecision(currDecision.decision) }} style={{ marginTop:6, background:'none', border:'none', color:'var(--teal)', fontSize:11, cursor:'pointer', padding:0 }}>Edit →</button>
                    </div>
                  ) : (
                    <>
                      <textarea value={decision} onChange={e => setDecision(e.target.value)} placeholder="What did we decide this week? e.g. Delay NCDOT start 2 weeks, move 4 systems from EU to US Wk28..." rows={4} style={{ width:'100%', background:'var(--card2)', border:'1px solid var(--border)', borderRadius:7, padding:'8px 10px', color:'var(--text)', fontSize:12, outline:'none', resize:'vertical', fontFamily:'inherit', lineHeight:1.6 }} />
                      <Btn onClick={saveDecision} disabled={savingDecision || !decision.trim()} style={{ marginTop:8, width:'100%' }}>
                        {savingDecision ? 'Saving…' : '📝 Save Decision'}
                      </Btn>
                    </>
                  )}
                </Card>
                <Card style={{ padding:'12px 16px' }}>
                  <SectionHead accent="var(--teal)">Active Projects Wk{selectedWeek}</SectionHead>
                  {activeProjects.length === 0 ? (
                    <div style={{ color:'var(--muted)', fontSize:12 }}>No assigned projects this week</div>
                  ) : (
                    activeProjects.map(p => (
                      <div key={p.id} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'6px 0', borderBottom:'1px solid rgba(30,45,66,0.4)' }}>
                        <div style={{ fontSize:12, fontWeight:600, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', flex:1, paddingRight:8 }}>{p.name}</div>
                        <div style={{ display:'flex', gap:6, flexShrink:0 }}>
                          <Pill small color={REGION_C[p.region]||'var(--muted)'}>{p.region}</Pill>
                          <span style={{ color:'var(--teal)', fontFamily:'monospace', fontWeight:800, fontSize:12 }}>{projectSystemsMap[p.id]||0}</span>
                        </div>
                      </div>
                    ))
                  )}
                </Card>
              </div>
            </div>
          )}
        </div>
      </div>
    </Shell>
  )
}

export default function PlanPage() {
  return <Suspense fallback={<Shell><div style={{padding:40,color:'var(--dim)'}}>Loading…</div></Shell>}><PlanContent /></Suspense>
}

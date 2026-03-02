'use client'
import { useEffect, useState, useMemo } from 'react'
import Shell from '@/components/ui/Shell'
import { Card, Pill, Btn, SectionHead, REGION_C, ChartTooltip } from '@/components/ui'
import { supabase, KmBenchmark, WeeklyCapacity } from '@/lib/supabase'
import { Project } from '@/types'
import { forecastProject } from '@/lib/forecast'
import { computeWeeklySummary } from '@/lib/capacity'
import { getISOWeek, parseISO } from 'date-fns'
import { AreaChart, Area, LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Legend, ComposedChart } from 'recharts'

const CURRENT_WEEK = getISOWeek(new Date())
const CURRENT_YEAR = new Date().getFullYear()

export default function ForecastPage() {
  const [projects, setProjects] = useState<Project[]>([])
  const [benchmarks, setBenchmarks] = useState<KmBenchmark[]>([])
  const [capacities, setCapacities] = useState<WeeklyCapacity[]>([])
  const [assignments, setAssignments] = useState<any[]>([])
  const [selected, setSelected] = useState<string|null>(null)
  const [view, setView] = useState<'portfolio'|'project'>('portfolio')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const [p, b, c, a] = await Promise.all([
        supabase.from('projects').select('*').neq('status','Other').neq('status','Finished').order('name'),
        supabase.from('km_benchmarks').select('*').order('region').order('month_number'),
        supabase.from('weekly_capacity').select('*').eq('year',CURRENT_YEAR).order('week_number'),
        supabase.from('operator_assignments').select('*').eq('year',CURRENT_YEAR),
      ])
      setProjects(p.data||[]); setBenchmarks(b.data||[]); setCapacities(c.data||[]); setAssignments(a.data||[])
      setLoading(false)
    }
    load()
  }, [])

  const activeProjects = projects.filter(p => p.status === 'Committed' || p.status === 'Pipeline')

  // Portfolio view: all projects combined demand vs capacity
  const portfolioData = useMemo(() => {
    const weekMap: Record<number, { committed:number; pipeline:number; total:number }> = {}

    activeProjects.forEach(p => {
      if (!p.start_date || !p.total_km || !p.desired_systems_per_week) return
      const forecast = forecastProject(p.total_km, parseISO(p.start_date), p.region, p.desired_systems_per_week, benchmarks)
      const weight = p.status === 'Pipeline' ? (p.crm_percent || 50) / 100 : 1
      forecast.forEach(fw => {
        if (!weekMap[fw.week_number]) weekMap[fw.week_number] = { committed:0, pipeline:0, total:0 }
        if (p.status === 'Committed') {
          weekMap[fw.week_number].committed += fw.systems_needed
          weekMap[fw.week_number].total += fw.systems_needed
        } else {
          weekMap[fw.week_number].pipeline += fw.systems_needed * weight
          weekMap[fw.week_number].total += fw.systems_needed * weight
        }
      })
    })

    return Array.from({ length: 52 }, (_, i) => {
      const wk = i + 1
      const cap = capacities.find(c => c.week_number === wk)
      const demand = weekMap[wk] || { committed:0, pipeline:0, total:0 }
      return {
        label: `Wk${wk}`,
        week: wk,
        committed: Math.round(demand.committed * 10) / 10,
        pipeline: Math.round(demand.pipeline * 10) / 10,
        capacity: cap?.total_capacity ?? null,
        balance: cap ? Math.round((cap.total_capacity - demand.total) * 10) / 10 : null,
        isRisk: cap ? demand.total > cap.total_capacity : false,
      }
    }).filter(d => d.committed > 0 || d.pipeline > 0 || d.capacity !== null)
  }, [activeProjects, benchmarks, capacities])

  // Project detail: confidence bands
  const selectedProject = projects.find(p => p.id === selected)
  const forecastBands = useMemo(() => {
    if (!selectedProject?.start_date || !selectedProject.total_km) return { best:[], expected:[], worst:[] }
    const regionBm = benchmarks.filter(b => b.region === selectedProject.region)
    if (!regionBm.length) return { best:[], expected:[], worst:[] }
    const min = Math.min(...regionBm.map(b=>b.km_per_week))
    const max = Math.max(...regionBm.map(b=>b.km_per_week))
    const avg = regionBm.reduce((s,b)=>s+b.km_per_week,0)/regionBm.length
    const build = (kmPerWeek: number) => {
      if (!selectedProject) return []
      const systems = selectedProject.desired_systems_per_week||1
      const weeks = Math.ceil(selectedProject.total_km/(kmPerWeek*systems))
      let cum = 0
      return Array.from({length:weeks},(_,i)=>{
        const wkKm = Math.min(selectedProject.total_km-cum, kmPerWeek*systems)
        cum += wkKm
        return { week_number:i+1, label:`Wk${i+1}`, cum_km:Math.round(cum), pct:Math.round(cum/selectedProject.total_km*100) }
      })
    }
    return { best:build(max), expected:build(avg), worst:build(min) }
  }, [selectedProject, benchmarks])

  // Merge bands for chart
  const bandChartData = useMemo(() => {
    const maxLen = Math.max(forecastBands.best.length, forecastBands.worst.length)
    return Array.from({length:maxLen},(_,i) => ({
      label: `Wk${i+1}`,
      best: forecastBands.best[i]?.pct,
      expected: forecastBands.expected[i]?.pct,
      worst: forecastBands.worst[i]?.pct,
    }))
  }, [forecastBands])

  // Risk weeks
  const riskWeeks = portfolioData.filter(d => d.isRisk)

  if (loading) return <Shell><div style={{padding:40,color:'var(--dim)'}}>Loading forecast…</div></Shell>

  return (
    <Shell>
      <div style={{ borderBottom:'1px solid var(--border)', padding:'18px 28px', background:'var(--card)', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
        <div>
          <h1 style={{ fontSize:18, fontWeight:800 }}>Forecast</h1>
          <p style={{ color:'var(--dim)', fontSize:12, marginTop:2 }}>Portfolio demand vs capacity · project drill-down · confidence bands</p>
        </div>
        <div style={{ display:'flex', gap:8 }}>
          <button onClick={()=>setView('portfolio')} style={{ background:view==='portfolio'?'rgba(0,212,184,0.12)':'var(--card)', border:`1px solid ${view==='portfolio'?'rgba(0,212,184,0.3)':'var(--border)'}`, color:view==='portfolio'?'var(--teal)':'var(--dim)', borderRadius:6, padding:'6px 16px', fontSize:12, fontWeight:600, cursor:'pointer' }}>Portfolio View</button>
          <button onClick={()=>setView('project')} style={{ background:view==='project'?'rgba(0,212,184,0.12)':'var(--card)', border:`1px solid ${view==='project'?'rgba(0,212,184,0.3)':'var(--border)'}`, color:view==='project'?'var(--teal)':'var(--dim)', borderRadius:6, padding:'6px 16px', fontSize:12, fontWeight:600, cursor:'pointer' }}>Per Project</button>
        </div>
      </div>

      <div style={{ padding:'22px 28px', display:'flex', flexDirection:'column', gap:20 }}>
        {view === 'portfolio' && (
          <>
            {/* Risk summary */}
            {riskWeeks.length > 0 && (
              <div style={{ background:'rgba(239,68,68,0.08)', border:'1px solid rgba(239,68,68,0.2)', borderRadius:12, padding:'14px 18px' }}>
                <div style={{ fontWeight:700, fontSize:14, color:'var(--red)', marginBottom:6 }}>⚡ {riskWeeks.length} at-risk week{riskWeeks.length!==1?'s':''} forecast — demand exceeds capacity</div>
                <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
                  {riskWeeks.map(w => <Pill key={w.week} small color="var(--red)">Wk{w.week} ({w.committed+w.pipeline} systems vs {w.capacity} cap)</Pill>)}
                </div>
              </div>
            )}
            {riskWeeks.length === 0 && portfolioData.length > 0 && (
              <div style={{ background:'rgba(16,185,129,0.08)', border:'1px solid rgba(16,185,129,0.2)', borderRadius:12, padding:'14px 18px', color:'var(--green)', fontWeight:600, fontSize:13 }}>✅ No capacity bottlenecks forecast — demand stays within capacity across all planned weeks</div>
            )}

            {/* Portfolio demand chart */}
            <Card style={{ padding:'18px 18px 10px' }}>
              <SectionHead>All Projects — Committed + Pipeline Demand vs Total Capacity</SectionHead>
              <div style={{ color:'var(--muted)', fontSize:11, marginBottom:12 }}>Pipeline weighted by CRM % win probability · Committed = 100%</div>
              <ResponsiveContainer width="100%" height={280}>
                <ComposedChart data={portfolioData} margin={{top:4,right:8,bottom:0,left:0}}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="label" tick={{fill:'var(--muted)',fontSize:9}} tickLine={false} interval={3} />
                  <YAxis tick={{fill:'var(--muted)',fontSize:9}} tickLine={false} axisLine={false} />
                  <Tooltip content={<ChartTooltip />} />
                  <Legend iconType="circle" iconSize={8} wrapperStyle={{fontSize:11}} />
                  <ReferenceLine x={`Wk${CURRENT_WEEK}`} stroke="var(--teal)" strokeDasharray="4 3" label={{value:'Now',fill:'var(--teal)',fontSize:9}} />
                  <Bar dataKey="committed" name="Committed systems" fill="var(--blue)" stackId="d" />
                  <Bar dataKey="pipeline" name="Pipeline (weighted)" fill="rgba(245,158,11,0.6)" stackId="d" radius={[2,2,0,0]} />
                  <Line type="monotone" dataKey="capacity" name="Total capacity" stroke="var(--red)" strokeWidth={2} dot={false} strokeDasharray="5 3" />
                </ComposedChart>
              </ResponsiveContainer>
            </Card>

            {/* Balance chart */}
            <Card style={{ padding:'18px 18px 10px' }}>
              <SectionHead accent="var(--green)">Remaining Capacity After Demand</SectionHead>
              <ResponsiveContainer width="100%" height={180}>
                <AreaChart data={portfolioData} margin={{top:4,right:8,bottom:0,left:0}}>
                  <defs>
                    <linearGradient id="balGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--green)" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="var(--green)" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="label" tick={{fill:'var(--muted)',fontSize:9}} tickLine={false} interval={3} />
                  <YAxis tick={{fill:'var(--muted)',fontSize:9}} tickLine={false} axisLine={false} />
                  <Tooltip content={<ChartTooltip />} />
                  <ReferenceLine y={0} stroke="var(--red)" strokeDasharray="3 3" />
                  <ReferenceLine x={`Wk${CURRENT_WEEK}`} stroke="var(--teal)" strokeDasharray="4 3" />
                  <Area type="monotone" dataKey="balance" name="Available systems" stroke="var(--green)" strokeWidth={2} fill="url(#balGrad)" dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </Card>

            {/* Project list summary */}
            <Card style={{ padding:0, overflow:'hidden' }}>
              <div style={{ padding:'12px 18px', borderBottom:'1px solid var(--border)', background:'var(--card2)' }}>
                <SectionHead>Active Projects in Forecast</SectionHead>
              </div>
              {activeProjects.map(p => {
                if (!p.start_date || !p.total_km) return null
                const forecast = forecastProject(p.total_km, parseISO(p.start_date), p.region, p.desired_systems_per_week||1, benchmarks)
                const endWeek = forecast[forecast.length-1]
                const regionBm = benchmarks.filter(b=>b.region===p.region)
                const avgKm = regionBm.length ? regionBm.reduce((s,b)=>s+b.km_per_week,0)/regionBm.length : 175
                return (
                  <div key={p.id} style={{ display:'grid', gridTemplateColumns:'2fr 70px 80px 120px 120px 100px', padding:'10px 18px', borderBottom:'1px solid rgba(30,45,66,0.4)', fontSize:12, gap:12, alignItems:'center' }}>
                    <div>
                      <div style={{ fontWeight:600 }}>{p.name}</div>
                      <div style={{ color:'var(--dim)', fontSize:11 }}>{p.total_km.toLocaleString()} km · {p.desired_systems_per_week||1} sys/wk</div>
                    </div>
                    <Pill small color={REGION_C[p.region]||'var(--muted)'}>{p.region}</Pill>
                    <Pill small color={p.status==='Committed'?'var(--teal)':'var(--amber)'}>{p.status}</Pill>
                    <div style={{ color:'var(--dim)' }}>Start: {p.start_date ? new Date(p.start_date).toLocaleDateString('en-GB',{day:'numeric',month:'short'}) : '?'}</div>
                    <div style={{ color:endWeek?'var(--teal)':'var(--muted)' }}>End: {endWeek ? `Wk${endWeek.week_number}` : '?'}</div>
                    <button onClick={()=>{setSelected(p.id);setView('project')}} style={{ background:'rgba(0,212,184,0.1)', border:'1px solid rgba(0,212,184,0.2)', borderRadius:5, color:'var(--teal)', cursor:'pointer', fontSize:11, padding:'4px 10px', fontWeight:600 }}>Drill down →</button>
                  </div>
                )
              })}
            </Card>
          </>
        )}

        {view === 'project' && (
          <>
            {/* Project selector */}
            <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
              {activeProjects.map(p => (
                <button key={p.id} onClick={()=>setSelected(p.id)} style={{ background:selected===p.id?'rgba(0,212,184,0.12)':'var(--card)', border:`1px solid ${selected===p.id?'rgba(0,212,184,0.3)':'var(--border)'}`, color:selected===p.id?'var(--teal)':'var(--dim)', borderRadius:7, padding:'6px 14px', fontSize:12, fontWeight:600, cursor:'pointer', transition:'all 0.1s' }}>
                  {p.name}
                </button>
              ))}
            </div>

            {selectedProject ? (
              <>
                {/* Project info */}
                <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12 }}>
                  {[
                    {l:'Total KM',v:selectedProject.total_km?.toLocaleString()||'—',c:'var(--teal)'},
                    {l:'Systems/Wk',v:selectedProject.desired_systems_per_week||1,c:'var(--blue)'},
                    {l:'Start',v:selectedProject.start_date?new Date(selectedProject.start_date).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'2-digit'}):'—',c:'var(--violet)'},
                    {l:'Expected Finish',v:forecastBands.expected[forecastBands.expected.length-1]?`Wk${forecastBands.expected.length} (${forecastBands.expected[forecastBands.expected.length-1].cum_km.toLocaleString()} km)`:'—',c:'var(--amber)'},
                  ].map(({l,v,c}) => (
                    <Card key={l} style={{ padding:'12px 16px' }} accent={c}>
                      <div style={{ color:'var(--muted)', fontSize:10, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:4 }}>{l}</div>
                      <div style={{ color:c, fontSize:18, fontWeight:800, fontFamily:'monospace' }}>{v}</div>
                    </Card>
                  ))}
                </div>

                {/* Confidence bands chart */}
                {bandChartData.length > 0 && (
                  <Card style={{ padding:'18px 18px 10px' }}>
                    <SectionHead>Completion Forecast — Confidence Bands</SectionHead>
                    <div style={{ color:'var(--muted)', fontSize:11, marginBottom:12 }}>Best case (peak benchmark month) · Expected (average) · Worst case (slowest month)</div>
                    <ResponsiveContainer width="100%" height={240}>
                      <AreaChart data={bandChartData} margin={{top:4,right:8,bottom:0,left:0}}>
                        <defs>
                          <linearGradient id="bandGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="var(--teal)" stopOpacity={0.15}/>
                            <stop offset="95%" stopColor="var(--teal)" stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                        <XAxis dataKey="label" tick={{fill:'var(--muted)',fontSize:9}} tickLine={false} interval={3} />
                        <YAxis tick={{fill:'var(--muted)',fontSize:9}} tickLine={false} axisLine={false} unit="%" domain={[0,100]} />
                        <Tooltip formatter={(v:number)=>`${v}%`} contentStyle={{background:'#1a2840',border:'1px solid var(--border)',borderRadius:8}} />
                        <ReferenceLine y={100} stroke="var(--green)" strokeDasharray="4 3" label={{value:'Complete',fill:'var(--green)',fontSize:9}} />
                        <Area type="monotone" dataKey="best" name="Best case" stroke="var(--green)" strokeWidth={1.5} fill="none" strokeDasharray="3 3" dot={false} />
                        <Area type="monotone" dataKey="expected" name="Expected" stroke="var(--teal)" strokeWidth={2.5} fill="url(#bandGrad)" dot={false} />
                        <Area type="monotone" dataKey="worst" name="Worst case" stroke="var(--amber)" strokeWidth={1.5} fill="none" strokeDasharray="3 3" dot={false} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </Card>
                )}
              </>
            ) : (
              <div style={{ textAlign:'center', padding:48, color:'var(--dim)' }}>
                <div style={{ fontSize:32, marginBottom:12 }}>🔮</div>
                Select a project above to see detailed forecast
              </div>
            )}
          </>
        )}
      </div>
    </Shell>
  )
}

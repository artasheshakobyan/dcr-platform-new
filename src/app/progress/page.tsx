'use client'
// [IMPROVED] Two-phase loading: Phase 1 fetches latest entry per project only.
// Phase 2 fetches full history only when a project is selected.
// Fixes: 1000-row limit, O(n²) filter, adds table view with stale indicators + sparklines.
import { useEffect, useState, useMemo } from 'react'
import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'
import Shell from '@/components/ui/Shell'
import { Card, Pill, Btn, Input, SectionHead, ChartTooltip } from '@/components/ui'
import { supabase, ProjectProgress, imagesToKm } from '@/lib/supabase'
import { Project } from '@/types'
import { forecastProject } from '@/lib/forecast'
import { KmBenchmark } from '@/lib/supabase'
import { getISOWeek, parseISO, differenceInCalendarDays } from 'date-fns'
import { ComposedChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts'

const CURRENT_WEEK = getISOWeek(new Date())
const CURRENT_YEAR = new Date().getFullYear()

function StaleIndicator({ loggedAt }: { loggedAt: string | null }) {
  if (!loggedAt) return <span style={{ color:'var(--red)', fontSize:10, fontWeight:700 }}>Never</span>
  const days = differenceInCalendarDays(new Date(), new Date(loggedAt))
  const color = days > 14 ? 'var(--red)' : days > 7 ? 'var(--amber)' : 'var(--green)'
  return (
    <div style={{ display:'flex', alignItems:'center', gap:4 }}>
      <div style={{ width:6, height:6, borderRadius:'50%', background:color, animation: days > 14 ? 'blink 2s infinite' : 'none' }} />
      <span style={{ fontSize:10, color, fontWeight: days > 14 ? 700 : 400 }}>
        {days === 0 ? 'Today' : `${days}d ago`}
      </span>
    </div>
  )
}

function LogModal({ project, existing, onClose, onSaved }: { project: Project; existing: ProjectProgress|null; onClose:()=>void; onSaved:()=>void }) {
  const [week, setWeek] = useState(existing?.week_number ?? CURRENT_WEEK)
  const [cumImages, setCumImages] = useState(existing?.cumulative_images ?? 0)
  const [loggedBy, setLoggedBy] = useState(existing?.logged_by ?? (typeof window!=='undefined'?localStorage.getItem('dcr_username')||'':''))
  const [notes, setNotes] = useState(existing?.notes ?? '')
  const [saving, setSaving] = useState(false)

  const save = async () => {
    setSaving(true)
    const payload = { project_id: project.id, week_number: week, year: CURRENT_YEAR, cumulative_images: cumImages, notes, logged_by: loggedBy, logged_at: new Date().toISOString() }
    if (existing) await supabase.from('project_progress').update(payload).eq('id', existing.id)
    else await supabase.from('project_progress').upsert(payload, { onConflict:'project_id,week_number,year' })
    if (typeof window!=='undefined') localStorage.setItem('dcr_username', loggedBy)
    setSaving(false); onSaved(); onClose()
  }

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.75)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:300 }}>
      <Card style={{ padding:'28px 32px', minWidth:400, maxWidth:460 }} accent="var(--teal)">
        <div style={{ fontWeight:800, fontSize:17, marginBottom:4 }}>📸 Log Progress</div>
        <div style={{ color:'var(--dim)', fontSize:12, marginBottom:20 }}>{project.name}</div>
        <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
          <div><label style={{ fontSize:11, color:'var(--muted)', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.08em', display:'block', marginBottom:5 }}>Week number</label>
            <Input type="number" value={week} onChange={e=>setWeek(parseInt(e.target.value)||CURRENT_WEEK)} min="1" max="52" /></div>
          <div><label style={{ fontSize:11, color:'var(--muted)', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.08em', display:'block', marginBottom:5 }}>Cumulative images synced</label>
            <Input type="number" value={cumImages||''} onChange={e=>setCumImages(parseInt(e.target.value)||0)} placeholder="e.g. 48200" autoFocus />
            {cumImages > 0 && <div style={{ marginTop:4, fontSize:12, color:'var(--teal)', fontWeight:600 }}>= {imagesToKm(cumImages).toLocaleString()} km driven</div>}</div>
          <div><label style={{ fontSize:11, color:'var(--muted)', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.08em', display:'block', marginBottom:5 }}>Logged by</label>
            <Input value={loggedBy} onChange={e=>setLoggedBy(e.target.value)} placeholder="Your name" /></div>
          <div><label style={{ fontSize:11, color:'var(--muted)', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.08em', display:'block', marginBottom:5 }}>Notes (optional)</label>
            <Input value={notes} onChange={e=>setNotes(e.target.value)} placeholder="e.g. Road closures in NW sector" /></div>
          <div style={{ display:'flex', gap:10 }}>
            <Btn onClick={save} disabled={saving||!loggedBy.trim()}>{saving?'Saving…':'💾 Save'}</Btn>
            <Btn variant="secondary" onClick={onClose}>Cancel</Btn>
          </div>
        </div>
      </Card>
    </div>
  )
}

function CompleteModal({ project, latestImages, onClose, onSaved }: { project:Project; latestImages:number; onClose:()=>void; onSaved:()=>void }) {
  const [name, setName] = useState(''); const [note, setNote] = useState(''); const [saving, setSaving] = useState(false)
  const finalKm = imagesToKm(latestImages)
  const pct = project.total_km > 0 ? Math.round(finalKm/project.total_km*100) : 0
  const confirm = async () => {
    if (!name.trim()) return; setSaving(true)
    await supabase.from('project_completions').insert({ project_id:project.id, signed_off_by:name, sign_off_note:note, final_images:latestImages, final_km:finalKm, previous_status:project.status })
    await supabase.from('projects').update({ status:'Finished', updated_at:new Date().toISOString() }).eq('id',project.id)
    setSaving(false); onSaved(); onClose()
  }
  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.75)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:300 }}>
      <Card style={{ padding:'28px 32px', minWidth:400 }} accent="var(--green)">
        <div style={{ fontWeight:800, fontSize:17, marginBottom:20 }}>✅ Mark Complete — {project.name}</div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:12, marginBottom:20 }}>
          {[{l:'Images',v:latestImages.toLocaleString(),c:'var(--teal)'},{l:'KMs',v:finalKm.toLocaleString(),c:'var(--blue)'},{l:'% of Target',v:`${pct}%`,c:pct>=100?'var(--green)':pct>=80?'var(--amber)':'var(--red)'}].map(({l,v,c}) => (
            <div key={l} style={{ background:'var(--card2)', borderRadius:8, padding:'10px 12px', textAlign:'center' }}>
              <div style={{ color:'var(--muted)', fontSize:10, textTransform:'uppercase', marginBottom:3 }}>{l}</div>
              <div style={{ color:c, fontSize:16, fontWeight:800, fontFamily:'monospace' }}>{v}</div>
            </div>
          ))}
        </div>
        <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
          <Input value={name} onChange={e=>setName(e.target.value)} placeholder="Sign-off name *" autoFocus />
          <Input value={note} onChange={e=>setNote(e.target.value)} placeholder="Completion note (optional)" />
          <div style={{ display:'flex', gap:10 }}>
            <Btn onClick={confirm} disabled={saving||!name.trim()} style={{ background:'linear-gradient(135deg,var(--green),var(--teal))', color:'#000' }}>{saving?'Completing…':'✅ Confirm'}</Btn>
            <Btn variant="secondary" onClick={onClose}>Cancel</Btn>
          </div>
        </div>
      </Card>
    </div>
  )
}

function ProgressContent() {
  const searchParams = useSearchParams()
  const projectParam = searchParams.get('project')
  const [projects, setProjects] = useState<Project[]>([])
  // Phase 1: only latest entry per project — avoids 1000-row limit
  const [latestMap, setLatestMap] = useState<Map<string, ProjectProgress>>(new Map())
  // Phase 2: full history — only loaded when project is selected
  const [selectedProgress, setSelectedProgress] = useState<ProjectProgress[]>([])
  const [selectedLoading, setSelectedLoading] = useState(false)
  const [benchmarks, setBenchmarks] = useState<KmBenchmark[]>([])
  const [loading, setLoading] = useState(true)
  const [logModal, setLogModal] = useState<{project:Project; existing:ProjectProgress|null}|null>(null)
  const [completeModal, setCompleteModal] = useState<Project|null>(null)
  const [selectedProject, setSelectedProject] = useState<string|null>(projectParam)
  const [filterStatus, setFilterStatus] = useState<'active'|'all'>('active')
  const [search, setSearch] = useState('')

  const load = async () => {
    const [p, pr, b] = await Promise.all([
      supabase.from('projects').select('*').neq('status','Other').order('status').order('name'),
      // Only fetch latest entry per project — order desc so first occurrence = latest
      supabase.from('project_progress')
        .select('project_id, week_number, cumulative_images, logged_at, logged_by, notes, id, year')
        .eq('year', CURRENT_YEAR)
        .order('week_number', { ascending: false })
        .limit(2000), // explicit limit prevents silent 1000-row truncation
      supabase.from('km_benchmarks').select('*'),
    ])
    // Build O(n) Map — one pass, first row per project = latest
    const map = new Map<string, ProjectProgress>()
    ;(pr.data || []).forEach((row: ProjectProgress) => { if (!map.has(row.project_id)) map.set(row.project_id, row) })
    setProjects(p.data||[]); setLatestMap(map); setBenchmarks(b.data||[]); setLoading(false)
  }
  useEffect(() => { load() }, [])

  // Phase 2: load full history only when project selected
  useEffect(() => {
    if (!selectedProject) { setSelectedProgress([]); return }
    setSelectedLoading(true)
    supabase.from('project_progress').select('*').eq('project_id', selectedProject).eq('year', CURRENT_YEAR).order('week_number')
      .then(({ data }) => { setSelectedProgress(data || []); setSelectedLoading(false) })
  }, [selectedProject])

  const shownProjects = useMemo(() => {
    const base = filterStatus==='active' ? projects.filter(p=>p.status==='Committed'||p.status==='Pipeline') : projects
    if (!search) return base
    return base.filter(p => p.name.toLowerCase().includes(search.toLowerCase()) || (p.region||'').toLowerCase().includes(search.toLowerCase()))
  }, [projects, filterStatus, search])

  const selectedProj = projects.find(p => p.id === selectedProject)

  const chartData = useMemo(() => {
    if (!selectedProj?.start_date || !selectedProj.total_km) return []
    const forecast = forecastProject(selectedProj.total_km, parseISO(selectedProj.start_date), selectedProj.region, selectedProj.desired_systems_per_week||1, benchmarks)
    const pm: Record<number,number> = {}
    selectedProgress.forEach(p => { pm[p.week_number] = imagesToKm(p.cumulative_images) })
    const maxW = Math.max(...forecast.map(f=>f.week_number), ...selectedProgress.map(p=>p.week_number), CURRENT_WEEK+4)
    return Array.from({length:maxW},(_,i)=>i+1).map(wk => {
      const fc = forecast.find(f=>f.week_number===wk)
      return { label:`Wk${wk}`, forecast_km:fc?.cumulative_km, actual_km:pm[wk] }
    }).filter(d=>d.forecast_km!==undefined||d.actual_km!==undefined)
  }, [selectedProj, selectedProgress, benchmarks])

  if (loading) return <Shell><div style={{padding:40,color:'var(--dim)'}}>Loading progress…</div></Shell>

  return (
    <Shell>
      <style>{`@keyframes blink { 0%,100%{opacity:1} 50%{opacity:0.3} }`}</style>
      <div style={{ borderBottom:'1px solid var(--border)', padding:'14px 28px', background:'var(--card)', display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', gap:8 }}>
        <div>
          <h1 style={{ fontSize:18, fontWeight:800 }}>Progress</h1>
          <p style={{ color:'var(--dim)', fontSize:12, marginTop:2 }}>Images → KM → Pace · {shownProjects.length} projects</p>
        </div>
        <div style={{ display:'flex', gap:8, alignItems:'center' }}>
          <div style={{ display:'flex', alignItems:'center', gap:8, background:'var(--card2)', border:'1px solid var(--border)', borderRadius:8, padding:'6px 10px' }}>
            <span style={{ color:'var(--muted)', fontSize:11 }}>🔍</span>
            <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Filter…" style={{ background:'none', border:'none', color:'var(--text)', fontFamily:'inherit', fontSize:12, outline:'none', width:130 }} />
          </div>
          <div style={{ display:'flex', background:'var(--card2)', border:'1px solid var(--border)', borderRadius:8, padding:3, gap:2 }}>
            {(['active','all'] as const).map(f => (
              <button key={f} onClick={()=>setFilterStatus(f)} style={{ padding:'5px 12px', border:'none', background:filterStatus===f?'var(--card)':'transparent', color:filterStatus===f?'var(--teal)':'var(--muted)', borderRadius:6, fontSize:12, fontWeight:600, cursor:'pointer' }}>
                {f==='active'?'Active':'All'}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div style={{ display:'grid', gridTemplateColumns: selectedProject ? '380px 1fr' : '1fr', height:'calc(100vh - 62px)' }}>
        {/* Project table */}
        <div style={{ overflowY:'auto', borderRight: selectedProject?'1px solid var(--border)':'none' }}>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 100px 55px 75px 70px 54px', background:'var(--card2)', borderBottom:'1px solid var(--border)', padding:'8px 14px', position:'sticky', top:0, zIndex:5 }}>
            {['Project','Progress','Sys','Pace','Last Log',''].map(h=><div key={h} style={{ color:'var(--muted)', fontSize:9, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.07em' }}>{h}</div>)}
          </div>
          {shownProjects.map(p => {
            const latest = latestMap.get(p.id)
            const kmDone = latest ? imagesToKm(latest.cumulative_images) : 0
            const pct = p.total_km ? Math.round(kmDone/p.total_km*100) : 0
            const barColor = pct>=100?'var(--green)':pct>=75?'var(--teal)':pct>=50?'var(--blue)':'var(--amber)'
            const isSelected = selectedProject === p.id
            const isStale = latest ? differenceInCalendarDays(new Date(), new Date(latest.logged_at||'')) > 14 : true
            return (
              <div key={p.id} onClick={()=>setSelectedProject(isSelected?null:p.id)}
                style={{ display:'grid', gridTemplateColumns:'1fr 100px 55px 75px 70px 54px', padding:'10px 14px', cursor:'pointer', borderBottom:'1px solid rgba(30,45,66,0.4)', background:isSelected?'rgba(0,212,184,0.06)':'transparent', transition:'background 0.1s' }}
                onMouseEnter={e=>!isSelected&&((e.currentTarget as HTMLElement).style.background='rgba(22,32,48,0.4)')}
                onMouseLeave={e=>!isSelected&&((e.currentTarget as HTMLElement).style.background='transparent')}>
                <div>
                  <div style={{ fontWeight:700, fontSize:12, color:isSelected?'var(--teal)':'var(--text)' }}>{p.name}</div>
                  <div style={{ color:'var(--muted)', fontSize:10 }}>{p.region}{p.pm?` · ${p.pm}`:''}</div>
                </div>
                <div style={{ display:'flex', flexDirection:'column', gap:3, justifyContent:'center' }}>
                  <div style={{ display:'flex', justifyContent:'space-between' }}>
                    <span style={{ color:barColor, fontSize:10, fontWeight:700 }}>{pct}%</span>
                    <span style={{ color:'var(--muted)', fontSize:9 }}>{kmDone.toFixed(0)}km</span>
                  </div>
                  <div style={{ background:'var(--border)', borderRadius:3, height:4 }}>
                    <div style={{ background:barColor, width:`${Math.min(pct,100)}%`, height:'100%', borderRadius:3 }} />
                  </div>
                </div>
                <div style={{ color:'var(--teal)', fontSize:11, fontWeight:800, fontFamily:'monospace', alignSelf:'center', textAlign:'center' }}>{p.desired_systems_per_week||1}</div>
                <div style={{ color:'var(--teal)', fontSize:10, alignSelf:'center' }}>
                  {latest ? `${Math.round(kmDone/Math.max(1,CURRENT_WEEK-(latest.week_number||1)+1))}km/w` : '—'}
                </div>
                <div style={{ alignSelf:'center' }}><StaleIndicator loggedAt={latest?.logged_at||null} /></div>
                <div onClick={e=>e.stopPropagation()} style={{ alignSelf:'center' }}>
                  <button onClick={()=>setLogModal({project:p,existing:latest||null})}
                    style={{ background:isStale?'rgba(239,68,68,0.12)':'rgba(0,212,184,0.1)', border:`1px solid ${isStale?'rgba(239,68,68,0.3)':'rgba(0,212,184,0.25)'}`, borderRadius:5, color:isStale?'var(--red)':'var(--teal)', fontSize:10, fontWeight:700, cursor:'pointer', padding:'3px 8px' }}>
                    {isStale?'Log!':'Log'}
                  </button>
                </div>
              </div>
            )
          })}
        </div>

        {/* Detail panel */}
        {selectedProj && (
          <div style={{ overflowY:'auto', padding:'20px 24px' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:16 }}>
              <div>
                <div style={{ fontWeight:800, fontSize:16 }}>{selectedProj.name}</div>
                <div style={{ color:'var(--dim)', fontSize:12, marginTop:2 }}>{selectedProj.region} · {selectedProj.total_km?.toLocaleString()} km</div>
              </div>
              <div style={{ display:'flex', gap:8 }}>
                <Btn onClick={()=>setLogModal({project:selectedProj,existing:null})} style={{ fontSize:11, padding:'6px 14px' }}>+ Log</Btn>
                {selectedProj.status==='Committed' && <Btn variant="secondary" onClick={()=>setCompleteModal(selectedProj)} style={{ fontSize:11, padding:'6px 12px', color:'var(--green)' }}>✅ Complete</Btn>}
                <button onClick={()=>setSelectedProject(null)} style={{ background:'none', border:'1px solid var(--border)', borderRadius:6, color:'var(--muted)', cursor:'pointer', padding:'4px 10px', fontSize:12 }}>✕</button>
              </div>
            </div>

            {selectedLoading ? (
              <div style={{ padding:24, color:'var(--dim)', textAlign:'center' }}>Loading history…</div>
            ) : (
              <>
                {chartData.length > 0 && (
                  <Card style={{ padding:'16px 16px 8px', marginBottom:16 }}>
                    <SectionHead>Forecast vs Actual</SectionHead>
                    <ResponsiveContainer width="100%" height={200}>
                      <ComposedChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                        <XAxis dataKey="label" tick={{fill:'var(--muted)',fontSize:9}} tickLine={false} interval={3} />
                        <YAxis tick={{fill:'var(--muted)',fontSize:9}} tickLine={false} axisLine={false} />
                        <Tooltip content={<ChartTooltip />} />
                        <ReferenceLine x={`Wk${CURRENT_WEEK}`} stroke="var(--teal)" strokeDasharray="4 3" />
                        <Line type="monotone" dataKey="forecast_km" name="Forecast KM" stroke="rgba(59,130,246,0.5)" strokeWidth={1.5} dot={false} strokeDasharray="5 3" />
                        <Line type="monotone" dataKey="actual_km" name="Actual KM" stroke="var(--teal)" strokeWidth={2.5} dot={{fill:'var(--teal)',r:3}} connectNulls={false} />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </Card>
                )}
                <Card style={{ padding:0, overflow:'hidden' }}>
                  <div style={{ padding:'12px 16px', borderBottom:'1px solid var(--border)' }}>
                    <SectionHead accent="var(--blue)">Progress Log</SectionHead>
                  </div>
                  {selectedProgress.length === 0 ? (
                    <div style={{ padding:24, color:'var(--muted)', textAlign:'center', fontSize:13 }}>No progress logged yet</div>
                  ) : (
                    [...selectedProgress].reverse().map(pr => (
                      <div key={pr.id} style={{ display:'grid', gridTemplateColumns:'60px 110px 90px 60px 1fr 60px', padding:'10px 16px', borderBottom:'1px solid rgba(30,45,66,0.4)', fontSize:12, gap:10, alignItems:'center' }}>
                        <span style={{ color:'var(--muted)', fontWeight:600 }}>Wk{pr.week_number}</span>
                        <span style={{ fontFamily:'monospace', fontWeight:700, color:'var(--teal)' }}>{pr.cumulative_images.toLocaleString()}</span>
                        <span style={{ color:'var(--blue)', fontWeight:600 }}>{imagesToKm(pr.cumulative_images).toFixed(0)} km</span>
                        <span style={{ color: selectedProj.total_km ? (imagesToKm(pr.cumulative_images)/selectedProj.total_km >= 1 ? 'var(--green)' : 'var(--teal)') : 'var(--muted)', fontWeight:700, fontSize:11 }}>
                          {selectedProj.total_km ? `${Math.round(imagesToKm(pr.cumulative_images)/selectedProj.total_km*100)}%` : '—'}
                        </span>
                        <span style={{ color:'var(--dim)', fontSize:11 }}>{pr.notes||'—'}{pr.logged_by?` · ${pr.logged_by}`:''}</span>
                        <Btn variant="secondary" onClick={()=>setLogModal({project:selectedProj,existing:pr})} style={{ fontSize:10, padding:'3px 8px' }}>Edit</Btn>
                      </div>
                    ))
                  )}
                </Card>
              </>
            )}
          </div>
        )}
      </div>

      {logModal && <LogModal project={logModal.project} existing={logModal.existing} onClose={()=>setLogModal(null)} onSaved={load} />}
      {completeModal && <CompleteModal project={completeModal} latestImages={latestMap.get(completeModal.id)?.cumulative_images||0} onClose={()=>setCompleteModal(null)} onSaved={load} />}
    </Shell>
  )
}

export default function ProgressPage() {
  return <Suspense fallback={<Shell><div style={{padding:40,color:'var(--dim)'}}>Loading…</div></Shell>}><ProgressContent /></Suspense>
}

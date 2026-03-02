'use client'
import { useEffect, useState, useMemo } from 'react'
import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'
import Shell from '@/components/ui/Shell'
import { Card, Pill, Btn, Input, Select, Textarea, SectionHead, REGION_C, STATUS_C } from '@/components/ui'
import { supabase } from '@/lib/supabase'
import { Project, Region, ProjectStatus as Status } from '@/types'
import { geocodeCityState } from '@/lib/geocode'
import { KmBenchmark } from '@/lib/supabase'

const REGIONS: Region[] = ['NL','BE','DE','US','EU','CZ','LU','GR','CH','AT','FR','UK']
const STATUSES: Status[] = ['Committed','Pipeline','Finished','Other']
const CURRENT_YEAR = new Date().getFullYear()

function getEmpty(): Partial<Project> {
  return { name:'', region:undefined, city_state:'', category:'EU', status:'Pipeline', total_km:0,
    desired_systems_per_week:1, pm:'', start_date:'', end_date:'', crm_percent:0, notes:'' }
}

// Computed outside render to avoid O(n) work inside .map()
function computeHealthScore(project: Project) {
  let score = 100; const reasons: string[] = []
  if (!project.pm) { score -= 20; reasons.push('No PM') }
  if (!project.start_date) { score -= 15; reasons.push('No start date') }
  if (!project.total_km) { score -= 25; reasons.push('No KM target') }
  if (!project.desired_systems_per_week) { score -= 20; reasons.push('No systems/wk') }
  const color = score >= 80 ? 'var(--green)' : score >= 60 ? 'var(--amber)' : 'var(--red)'
  return { score, color, reasons }
}

function SystemsCalculator({ project, benchmarks }: { project: Partial<Project>; benchmarks: KmBenchmark[] }) {
  const totalKm = Number(project.total_km) || 0
  const startDate = project.start_date ? new Date(project.start_date) : null
  const endDate = project.end_date ? new Date(project.end_date) : null
  const region = project.region || ''
  const systemsPerWeek = Number(project.desired_systems_per_week) || 1
  const regionBm = benchmarks.filter(b => b.region === region)
  const avgKmPerSystemPerWeek = regionBm.length ? regionBm.reduce((s,b) => s + b.km_per_week, 0) / regionBm.length : 175
  if (!totalKm || !startDate) return null

  let insight: { type: 'info'|'warning'|'success'; text: string; subtext?: string }
  if (endDate && endDate > startDate) {
    const weeksAvailable = Math.ceil((endDate.getTime() - startDate.getTime()) / (7*24*3600*1000))
    const systemsNeeded = Math.ceil((totalKm / weeksAvailable) / avgKmPerSystemPerWeek)
    const projectedEnd = new Date(startDate.getTime() + Math.ceil(totalKm / (systemsPerWeek * avgKmPerSystemPerWeek)) * 7*24*3600*1000)
    insight = {
      type: systemsPerWeek >= systemsNeeded ? 'success' : 'warning',
      text: systemsPerWeek >= systemsNeeded
        ? `✅ On track — finishes ~${projectedEnd.toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'})}`
        : `⚠ Need ${systemsNeeded} systems/wk to meet ${endDate.toLocaleDateString('en-GB',{day:'numeric',month:'short'})} deadline`,
      subtext: `${weeksAvailable} weeks · ${avgKmPerSystemPerWeek.toFixed(0)} km/system/wk (${region || 'no region'})`
    }
  } else {
    const weeksNeeded = Math.ceil(totalKm / (systemsPerWeek * avgKmPerSystemPerWeek))
    const projectedEnd = new Date(startDate.getTime() + weeksNeeded * 7*24*3600*1000)
    insight = {
      type: 'info',
      text: `📅 Completes ~${projectedEnd.toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'})} with ${systemsPerWeek} system${systemsPerWeek>1?'s':''}/wk`,
      subtext: `${weeksNeeded} weeks · ${avgKmPerSystemPerWeek.toFixed(0)} km/system/wk benchmark`
    }
  }
  const col = { info:'var(--blue)', warning:'var(--amber)', success:'var(--green)' }[insight.type]
  return (
    <div style={{ background:`${col}10`, border:`1px solid ${col}33`, borderRadius:10, padding:'10px 14px', marginTop:4 }}>
      <div style={{ fontSize:12, fontWeight:700, color:col }}>{insight.text}</div>
      {insight.subtext && <div style={{ fontSize:10, color:'var(--muted)', marginTop:2 }}>{insight.subtext}</div>}
    </div>
  )
}

function ProjectsContent() {
  const searchParams = useSearchParams()
  const highlightId = searchParams.get('id')

  const [projects, setProjects] = useState<Project[]>([])
  const [benchmarks, setBenchmarks] = useState<KmBenchmark[]>([])
  const [pms, setPms] = useState<{id:string;name:string}[]>([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<'list'|'add'|'edit'>('list')
  const [editProject, setEditProject] = useState<Project|null>(null)
  const [form, setForm] = useState<Partial<Project>>(getEmpty())
  const [step, setStep] = useState(1)
  const [saving, setSaving] = useState(false)
  const [geocoding, setGeocoding] = useState(false)
  const [filterStatus, setFilterStatus] = useState<Status|'All'>('All')
  const [filterRegion, setFilterRegion] = useState<string>('All')
  const [search, setSearch] = useState('')
  const [expandedId, setExpandedId] = useState<string|null>(highlightId || null)
  const [comments, setComments] = useState<Record<string,any[]>>({})
  const [newComment, setNewComment] = useState('')
  const [quickStatusProject, setQuickStatusProject] = useState<string|null>(null)

  const load = async () => {
    const [p, b, pm] = await Promise.all([
      supabase.from('projects').select('*').order('status').order('name'),
      supabase.from('km_benchmarks').select('*'),
      supabase.from('pms').select('*').order('name'),
    ])
    setProjects(p.data||[]); setBenchmarks(b.data||[]); setPms(pm.data||[]); setLoading(false)
  }
  useEffect(() => { load() }, [])

  const upd = (k: keyof Project, v: any) => setForm(f => ({ ...f, [k]: v }))
  const startAdd = () => { setForm(getEmpty()); setStep(1); setView('add'); setEditProject(null) }
  const startEdit = (p: Project) => { setForm(p); setStep(1); setView('edit'); setEditProject(p) }

  const save = async () => {
    if (!form.name || !form.region) return
    setSaving(true)
    const payload = { ...form, updated_at: new Date().toISOString() }
    if (view === 'add') await supabase.from('projects').insert({ ...payload, created_at: new Date().toISOString() })
    else if (editProject) await supabase.from('projects').update(payload).eq('id', editProject.id)
    await load(); setView('list'); setSaving(false)
  }

  const deleteProject = async (id: string) => {
    if (!confirm('Delete this project? This cannot be undone.')) return
    await supabase.from('projects').delete().eq('id', id)
    await load()
  }

  const quickStatusChange = async (id: string, status: Status) => {
    await supabase.from('projects').update({ status, updated_at: new Date().toISOString() }).eq('id', id)
    setQuickStatusProject(null); await load()
  }

  const handleGeocode = async () => {
    if (!form.city_state) return
    setGeocoding(true)
    try { const r = await geocodeCityState(form.city_state); if (r) setForm(f => ({ ...f, lat: r.lat, lng: r.lng })) }
    finally { setGeocoding(false) }
  }

  const loadComments = async (projectId: string) => {
    const { data } = await supabase.from('project_comments').select('*').eq('project_id', projectId).order('created_at', { ascending: false })
    setComments(c => ({ ...c, [projectId]: data || [] }))
  }

  const addComment = async (projectId: string) => {
    if (!newComment.trim()) return
    const author = localStorage.getItem('dcr_username') || 'Team'
    await supabase.from('project_comments').insert({ project_id: projectId, comment: newComment, author })
    setNewComment(''); await loadComments(projectId)
  }

  const toggleExpand = (id: string) => {
    const opening = expandedId !== id
    setExpandedId(opening ? id : null)
    if (opening && !comments[id]) loadComments(id)
  }

  // Build health score map once — O(n) total, not O(n) per render
  const healthMap = useMemo(() => {
    const m = new Map<string, ReturnType<typeof computeHealthScore>>()
    projects.forEach(p => m.set(p.id, computeHealthScore(p)))
    return m
  }, [projects])

  const filtered = useMemo(() => projects.filter(p =>
    (filterStatus === 'All' || p.status === filterStatus) &&
    (filterRegion === 'All' || p.region === filterRegion) &&
    (p.status !== 'Other' || filterStatus === 'Other') &&
    (search === '' ||
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      (p.city_state || '').toLowerCase().includes(search.toLowerCase()) ||
      (p.pm || '').toLowerCase().includes(search.toLowerCase()) ||
      p.region.toLowerCase().includes(search.toLowerCase()))
  ), [projects, filterStatus, filterRegion, search])

  const activeProjects = useMemo(() => projects.filter(p => p.status === 'Committed' || p.status === 'Pipeline'), [projects])

  if (loading) return <Shell><div style={{padding:40,color:'var(--dim)'}}>Loading projects…</div></Shell>

  if (view === 'add' || view === 'edit') {
    return (
      <Shell>
        <div style={{ borderBottom:'1px solid var(--border)', padding:'18px 28px', background:'var(--card)', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <div>
            <h1 style={{ fontSize:18, fontWeight:800 }}>{view === 'add' ? 'Add Project' : `Edit — ${editProject?.name}`}</h1>
            <p style={{ color:'var(--dim)', fontSize:12, marginTop:2 }}>Step {step} of 2</p>
          </div>
          <div style={{ display:'flex', gap:8 }}>
            <Btn variant="secondary" onClick={() => setView('list')}>Cancel</Btn>
            {step === 1 && <Btn onClick={() => setStep(2)} disabled={!form.name || !form.region}>Next →</Btn>}
            {step === 2 && (<><Btn variant="secondary" onClick={() => setStep(1)}>← Back</Btn><Btn onClick={save} disabled={saving||!form.name||!form.region}>{saving?'Saving…':view==='add'?'✅ Create':'💾 Save'}</Btn></>)}
          </div>
        </div>
        <div style={{ padding:'28px', maxWidth:680, display:'flex', flexDirection:'column', gap:20 }}>
          <div style={{ display:'flex', gap:4, marginBottom:4 }}>
            {[1,2].map(s => <div key={s} style={{ flex:1, height:3, background: s <= step ? 'var(--teal)' : 'var(--border)', borderRadius:2, transition:'background 0.2s' }} />)}
          </div>
          {step === 1 && (
            <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
              <Card style={{ padding:20 }}>
                <SectionHead>Essential Info</SectionHead>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
                  <div style={{ gridColumn:'1/-1' }}>
                    <label style={{ fontSize:11, color:'var(--muted)', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.08em', display:'block', marginBottom:5 }}>Project Name *</label>
                    <Input value={form.name||''} onChange={e=>upd('name',e.target.value)} placeholder="e.g. DTAG Germany 2026" autoFocus />
                  </div>
                  <div><label style={{ fontSize:11, color:'var(--muted)', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.08em', display:'block', marginBottom:5 }}>Region *</label>
                    <Select value={form.region||''} onChange={e=>upd('region',e.target.value as Region)}><option value="">Select region…</option>{REGIONS.map(r => <option key={r} value={r}>{r}</option>)}</Select></div>
                  <div><label style={{ fontSize:11, color:'var(--muted)', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.08em', display:'block', marginBottom:5 }}>Status</label>
                    <Select value={form.status||'Pipeline'} onChange={e=>upd('status',e.target.value as Status)}>{STATUSES.map(s => <option key={s} value={s}>{s}</option>)}</Select></div>
                  <div><label style={{ fontSize:11, color:'var(--muted)', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.08em', display:'block', marginBottom:5 }}>Category</label>
                    <Select value={form.category||'EU'} onChange={e=>upd('category',e.target.value as any)}><option value="EU">EU</option><option value="US">US</option></Select></div>
                  <div><label style={{ fontSize:11, color:'var(--muted)', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.08em', display:'block', marginBottom:5 }}>Total KM *</label>
                    <Input type="number" value={form.total_km||''} onChange={e=>upd('total_km',parseFloat(e.target.value)||0)} placeholder="e.g. 2400" /></div>
                  <div><label style={{ fontSize:11, color:'var(--muted)', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.08em', display:'block', marginBottom:5 }}>Systems / Week</label>
                    <Input type="number" value={form.desired_systems_per_week||1} onChange={e=>upd('desired_systems_per_week',parseInt(e.target.value)||1)} min="1" /></div>
                  <div><label style={{ fontSize:11, color:'var(--muted)', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.08em', display:'block', marginBottom:5 }}>Start Date</label>
                    <Input type="date" value={form.start_date||''} onChange={e=>upd('start_date',e.target.value)} /></div>
                  <div><label style={{ fontSize:11, color:'var(--muted)', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.08em', display:'block', marginBottom:5 }}>End Date</label>
                    <Input type="date" value={form.end_date||''} onChange={e=>upd('end_date',e.target.value)} /></div>
                  <div><label style={{ fontSize:11, color:'var(--muted)', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.08em', display:'block', marginBottom:5 }}>PM</label>
                    <Select value={form.pm||''} onChange={e=>upd('pm',e.target.value)}><option value="">No PM assigned</option>{pms.map(pm => <option key={pm.id} value={pm.name}>{pm.name}</option>)}</Select></div>
                  <div><label style={{ fontSize:11, color:'var(--muted)', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.08em', display:'block', marginBottom:5 }}>CRM %</label>
                    <Input type="number" value={form.crm_percent||0} onChange={e=>upd('crm_percent',parseFloat(e.target.value)||0)} min="0" max="100" /></div>
                </div>
              </Card>
              <SystemsCalculator project={form} benchmarks={benchmarks} />
            </div>
          )}
          {step === 2 && (
            <Card style={{ padding:20 }}>
              <SectionHead accent="var(--muted)">Optional Details</SectionHead>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
                <div><label style={{ fontSize:11, color:'var(--muted)', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.08em', display:'block', marginBottom:5 }}>Finance ID</label>
                  <Input value={(form as any).finance_id||''} onChange={e=>upd('finance_id' as any,e.target.value)} placeholder="e.g. FIN-2026-042" /></div>
                <div><label style={{ fontSize:11, color:'var(--muted)', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.08em', display:'block', marginBottom:5 }}>City / State</label>
                  <div style={{ display:'flex', gap:6 }}><Input value={form.city_state||''} onChange={e=>upd('city_state',e.target.value)} placeholder="e.g. Frankfurt, Hesse" style={{ flex:1 }} /><Btn variant="secondary" onClick={handleGeocode} disabled={geocoding||!form.city_state} style={{ whiteSpace:'nowrap', fontSize:11 }}>{geocoding?'…':'📍'}</Btn></div></div>
                <div style={{ gridColumn:'1/-1' }}><label style={{ fontSize:11, color:'var(--muted)', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.08em', display:'block', marginBottom:5 }}>Notes</label>
                  <Textarea value={form.notes||''} onChange={e=>upd('notes',e.target.value)} rows={3} placeholder="Any relevant notes…" /></div>
              </div>
            </Card>
          )}
        </div>
      </Shell>
    )
  }

  if (!loading && projects.length === 0) {
    return (
      <Shell>
        <div style={{ padding:'60px 28px', maxWidth:520, margin:'0 auto', textAlign:'center' }}>
          <div style={{ fontSize:40, marginBottom:16 }}>📁</div>
          <h2 style={{ fontSize:22, fontWeight:800, marginBottom:8 }}>Add your first project</h2>
          <p style={{ color:'var(--dim)', fontSize:14, marginBottom:28, lineHeight:1.7 }}>Projects are the heart of the platform.</p>
          <Btn onClick={startAdd} style={{ fontSize:15, padding:'13px 28px' }}>+ Add First Project</Btn>
        </div>
      </Shell>
    )
  }

  return (
    <Shell>
      <div style={{ borderBottom:'1px solid var(--border)', padding:'14px 28px', background:'var(--card)', display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', gap:10 }}>
        <div>
          <h1 style={{ fontSize:18, fontWeight:800 }}>Projects</h1>
          <p style={{ color:'var(--dim)', fontSize:12, marginTop:2 }}>
            {activeProjects.length} active · {projects.filter(p=>p.status==='Finished').length} finished
            {search && ` · ${filtered.length} results`}
          </p>
        </div>
        <div style={{ display:'flex', gap:8, flexWrap:'wrap', alignItems:'center' }}>
          <div style={{ display:'flex', alignItems:'center', gap:8, background:'var(--card2)', border:'1px solid var(--border)', borderRadius:8, padding:'7px 12px', minWidth:220, transition:'border-color 0.15s' }}>
            <span style={{ color:'var(--muted)', fontSize:12 }}>🔍</span>
            <input
              value={search}
              onChange={e=>setSearch(e.target.value)}
              placeholder="Search name, city, PM…"
              style={{ background:'none', border:'none', color:'var(--text)', fontFamily:'inherit', fontSize:12, outline:'none', width:'100%' }}
            />
            {search && <button onClick={()=>setSearch('')} style={{ background:'none', border:'none', color:'var(--muted)', cursor:'pointer', fontSize:14, padding:0, lineHeight:1 }}>×</button>}
          </div>
          <Select value={filterStatus} onChange={e=>setFilterStatus(e.target.value as any)} style={{ width:'auto' }}>
            <option value="All">All statuses</option>
            {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
          </Select>
          <Select value={filterRegion} onChange={e=>setFilterRegion(e.target.value)} style={{ width:'auto' }}>
            <option value="All">All regions</option>
            {REGIONS.map(r => <option key={r} value={r}>{r}</option>)}
          </Select>
          <Btn onClick={startAdd}>+ Add Project</Btn>
        </div>
      </div>

      <div style={{ padding:'14px 28px', display:'flex', flexDirection:'column', gap:4 }}>
        {filtered.map(p => {
          const isExpanded = expandedId === p.id
          const health = healthMap.get(p.id)!
          return (
            <Card key={p.id} style={{ padding:0, overflow:'hidden', outline: highlightId===p.id ? '2px solid var(--teal)' : 'none', borderColor: isExpanded ? (STATUS_C[p.status]+'66' || 'var(--teal)') : undefined }}>
              {/* Collapsed row — always visible */}
              <div
                onClick={() => toggleExpand(p.id)}
                style={{ padding:'11px 16px', display:'grid', gridTemplateColumns:'3px 1fr 70px 100px 70px 90px 28px auto', gap:10, alignItems:'center', cursor:'pointer' }}
                onMouseEnter={e=>(e.currentTarget as HTMLElement).style.background='rgba(22,32,48,0.4)'}
                onMouseLeave={e=>(e.currentTarget as HTMLElement).style.background='transparent'}
              >
                <div style={{ width:3, height:30, borderRadius:2, background: STATUS_C[p.status]||'var(--muted)' }} />
                <div>
                  <div style={{ fontWeight:700, fontSize:13 }}>{p.name}</div>
                  <div style={{ color:'var(--dim)', fontSize:10, marginTop:1 }}>{p.city_state || p.region}{p.pm ? ` · ${p.pm}` : ' · No PM ⚠'}</div>
                </div>
                <Pill small color={REGION_C[p.region]||'var(--muted)'}>{p.region}</Pill>
                <div style={{ position:'relative' }} onClick={e=>e.stopPropagation()}>
                  {quickStatusProject === p.id ? (
                    <div style={{ position:'absolute', top:'100%', left:0, zIndex:100, background:'var(--card)', border:'1px solid var(--border)', borderRadius:8, padding:4, minWidth:120, boxShadow:'0 8px 24px rgba(0,0,0,0.4)' }}>
                      {STATUSES.map(s => <div key={s} onClick={() => quickStatusChange(p.id, s)} style={{ padding:'7px 12px', cursor:'pointer', fontSize:12, color:STATUS_C[s]||'var(--text)', fontWeight:600, borderRadius:5 }} onMouseEnter={e=>(e.currentTarget as HTMLElement).style.background='var(--card2)'} onMouseLeave={e=>(e.currentTarget as HTMLElement).style.background='transparent'}>{s}</div>)}
                      <div onClick={()=>setQuickStatusProject(null)} style={{ padding:'5px 12px', cursor:'pointer', fontSize:11, color:'var(--muted)', borderRadius:5 }}>Cancel</div>
                    </div>
                  ) : (
                    <div onClick={() => setQuickStatusProject(p.id)} style={{ cursor:'pointer' }}>
                      <Pill small color={STATUS_C[p.status]||'var(--muted)'}>{p.status} ▾</Pill>
                    </div>
                  )}
                </div>
                <div style={{ color:'var(--teal)', fontFamily:'monospace', fontWeight:800, fontSize:12 }}>{p.desired_systems_per_week||1}/wk</div>
                <div style={{ fontSize:10, color:'var(--dim)' }}>
                  {p.start_date ? new Date(p.start_date).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'2-digit'}) : '—'} →{' '}
                  {p.end_date ? new Date(p.end_date).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'2-digit'}) : '?'}
                </div>
                {(p.status !== 'Finished' && p.status !== 'Other') ? (
                  <div title={health.reasons.join(', ') || 'All good'} style={{ width:26, height:26, borderRadius:'50%', background:`${health.color}18`, border:`2px solid ${health.color}`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:9, fontWeight:800, color:health.color, cursor:'help' }} onClick={e=>e.stopPropagation()}>{health.score}</div>
                ) : <div />}
                <span style={{ color: isExpanded ? 'var(--teal)' : 'var(--muted)', fontSize:16, transition:'transform 0.2s, color 0.15s', transform: isExpanded ? 'rotate(90deg)' : 'none', display:'inline-block' }}>›</span>
              </div>

              {/* Expanded detail */}
              {isExpanded && (
                <div style={{ borderTop:'1px solid var(--border)', padding:'14px 16px 16px', background:'var(--card2)', display:'flex', flexDirection:'column', gap:12 }}>
                  <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(90px,1fr))', gap:8 }}>
                    {[
                      { l:'Total KM', v:p.total_km?.toLocaleString()||'—', c:'var(--teal)' },
                      { l:'Systems/wk', v:`${p.desired_systems_per_week||1}`, c:'var(--blue)' },
                      { l:'CRM %', v:p.crm_percent?`${p.crm_percent}%`:'—', c:'var(--amber)' },
                      { l:'Category', v:p.category||'—', c:'var(--dim)' },
                      { l:'Finance ID', v:(p as any).finance_id||'—', c:'var(--muted)' },
                    ].map(({l,v,c}) => (
                      <div key={l} style={{ background:'var(--card)', borderRadius:8, padding:'8px 10px', textAlign:'center' }}>
                        <div style={{ color:'var(--muted)', fontSize:9, textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:2 }}>{l}</div>
                        <div style={{ color:c, fontSize:13, fontWeight:800, fontFamily:'monospace' }}>{v}</div>
                      </div>
                    ))}
                  </div>
                  {(p.status === 'Committed' || p.status === 'Pipeline') && p.total_km && p.start_date && (
                    <SystemsCalculator project={p} benchmarks={benchmarks} />
                  )}
                  {p.notes && <div style={{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:8, padding:'8px 12px', fontSize:12, color:'var(--dim)' }}>{p.notes}</div>}
                  <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                    <button onClick={e=>{e.stopPropagation();startEdit(p)}} style={{ background:'rgba(0,212,184,0.1)', border:'1px solid rgba(0,212,184,0.3)', borderRadius:6, padding:'5px 12px', color:'var(--teal)', fontSize:11, fontWeight:700, cursor:'pointer' }}>✏ Edit</button>
                    <button onClick={async e=>{
                      e.stopPropagation()
                      const { data: existing } = await supabase.from('project_share_tokens').select('token').eq('project_id', p.id).single()
                      let tok = existing?.token
                      if (!tok) { const { data: nt } = await supabase.from('project_share_tokens').insert({ project_id: p.id }).select('token').single(); tok = nt?.token }
                      if (tok) { navigator.clipboard.writeText(`${window.location.origin}/share/${tok}`); alert('Share link copied!') }
                    }} style={{ background:'rgba(139,92,246,0.1)', border:'1px solid rgba(139,92,246,0.3)', borderRadius:6, padding:'5px 12px', color:'var(--violet)', fontSize:11, fontWeight:700, cursor:'pointer' }}>🔗 Share</button>
                    <button onClick={e=>{e.stopPropagation();deleteProject(p.id)}} style={{ background:'rgba(239,68,68,0.08)', border:'1px solid rgba(239,68,68,0.2)', borderRadius:6, padding:'5px 12px', color:'var(--red)', fontSize:11, fontWeight:600, cursor:'pointer' }}>✕ Delete</button>
                  </div>
                  <div>
                    <div style={{ fontSize:10, fontWeight:700, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:8 }}>Activity & Notes</div>
                    <div style={{ display:'flex', gap:8, marginBottom:10 }}>
                      <Input value={newComment} onChange={e=>setNewComment(e.target.value)} placeholder="Add a note…" onKeyDown={e=>e.key==='Enter'&&addComment(p.id)} style={{ flex:1, fontSize:12 }} />
                      <Btn onClick={()=>addComment(p.id)} disabled={!newComment.trim()} style={{ fontSize:11, padding:'5px 12px' }}>Post</Btn>
                    </div>
                    {(comments[p.id]||[]).map((c:any) => (
                      <div key={c.id} style={{ display:'flex', gap:8, marginBottom:8 }}>
                        <div style={{ width:22, height:22, borderRadius:'50%', background:'rgba(0,212,184,0.12)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:10, fontWeight:700, color:'var(--teal)', flexShrink:0 }}>{c.author.charAt(0).toUpperCase()}</div>
                        <div>
                          <span style={{ fontSize:11, fontWeight:700 }}>{c.author}</span>
                          <span style={{ fontSize:10, color:'var(--muted)', marginLeft:6 }}>{new Date(c.created_at).toLocaleDateString('en-GB',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})}</span>
                          <div style={{ fontSize:12, color:'var(--dim)', marginTop:2 }}>{c.comment}</div>
                        </div>
                      </div>
                    ))}
                    {(comments[p.id]||[]).length === 0 && <div style={{ fontSize:11, color:'var(--muted)' }}>No notes yet</div>}
                  </div>
                </div>
              )}
            </Card>
          )
        })}
        {filtered.length === 0 && (
          <div style={{ textAlign:'center', padding:48, color:'var(--dim)' }}>
            <div style={{ fontSize:32, marginBottom:12 }}>📁</div>
            {search ? `No projects match "${search}"` : 'No projects match your filter.'}
          </div>
        )}
      </div>
    </Shell>
  )
}

export default function ProjectsPage() {
  return <Suspense fallback={<Shell><div style={{padding:40,color:'var(--dim)'}}>Loading…</div></Shell>}><ProjectsContent /></Suspense>
}

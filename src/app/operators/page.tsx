'use client'
import { useEffect, useState, useMemo } from 'react'
import Shell from '@/components/ui/Shell'
import { Card, Pill, Btn, Input, Select, PageHeader, SectionHead, REGION_C } from '@/components/ui'
import { supabase, Operator, OperatorAssignment } from '@/lib/supabase'
import { Project, Region } from '@/types'
import { getISOWeek } from 'date-fns'

const REGIONS: Region[] = ['NL','BE','DE','US','EU','CZ','LU','GR','CH']
const ASSIGN_COLORS: Record<string, string> = { assigned:'var(--teal)', pto:'var(--amber)', sick:'var(--red)', training:'var(--violet)', repair:'#F97316', transit:'#06B6D4' }
const WEEK_COUNT = 52
const CURRENT_YEAR = new Date().getFullYear()
const CURRENT_WEEK = getISOWeek(new Date())

export default function OperatorsPage() {
  const [operators, setOperators] = useState<Operator[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [assignments, setAssignments] = useState<OperatorAssignment[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'gantt'|'list'|'add'>('gantt')
  const [newOp, setNewOp] = useState<Partial<Operator>>({ name:'', role:'', region:'NL', fte:1, active:true })
  const [saving, setSaving] = useState(false)
  const [filterRegion, setFilterRegion] = useState('All')
  const [visibleWeeks, setVisibleWeeks] = useState([CURRENT_WEEK, Math.min(CURRENT_WEEK+12, 52)])
  const [assignModal, setAssignModal] = useState<{ opId:string; week:number; existing:OperatorAssignment|null }|null>(null)
  const [assignForm, setAssignForm] = useState({ project_id:'', status:'assigned', notes:'' })
  const [projectSearch, setProjectSearch] = useState('')

  const load = async () => {
    const [ops, projs, ass] = await Promise.all([
      supabase.from('operators').select('*').order('name'),
      supabase.from('projects').select('*').neq('status','Other').order('name'),
      supabase.from('operator_assignments').select('*').eq('year', CURRENT_YEAR)
        .gte('week_number', visibleWeeks[0]).lte('week_number', visibleWeeks[1]),
    ])
    setOperators(ops.data||[]); setProjects(projs.data||[]); setAssignments(ass.data||[]); setLoading(false)
  }
  useEffect(() => { load() }, [visibleWeeks[0], visibleWeeks[1]])

  const visWeeks = useMemo(() => Array.from({ length: visibleWeeks[1]-visibleWeeks[0]+1 }, (_,i) => visibleWeeks[0]+i), [visibleWeeks])

  const getAssignment = (opId: string, week: number) =>
    assignments.find(a => a.operator_id===opId && a.week_number===week && a.year===CURRENT_YEAR)

  const openAssign = (opId: string, week: number) => {
    const existing = getAssignment(opId, week) || null
    setAssignModal({ opId, week, existing })
    setAssignForm({ project_id: existing?.project_id||'', status: existing?.status||'assigned', notes: existing?.notes||'' })
  }

  const saveAssignment = async () => {
    if (!assignModal) return
    setSaving(true)
    if (assignModal.existing) {
      if (!assignForm.project_id) {
        await supabase.from('operator_assignments').delete().eq('id', assignModal.existing.id)
      } else {
        await supabase.from('operator_assignments').update({ project_id: assignForm.project_id, status: assignForm.status, notes: assignForm.notes }).eq('id', assignModal.existing.id)
      }
    } else if (assignForm.project_id) {
      await supabase.from('operator_assignments').insert({ operator_id: assignModal.opId, project_id: assignForm.project_id, week_number: assignModal.week, year: CURRENT_YEAR, status: assignForm.status, notes: assignForm.notes })
    }
    await load(); setAssignModal(null); setSaving(false)
  }

  const addOperator = async () => {
    if (!newOp.name) return
    setSaving(true)
    await supabase.from('operators').insert(newOp)
    await load(); setNewOp({ name:'', role:'', region:'NL', fte:1, active:true }); setTab('list'); setSaving(false)
  }

  const delOperator = async (id: string) => {
    if (!confirm('Delete this operator?')) return
    await supabase.from('operators').delete().eq('id', id)
    await load()
  }

  const filteredOps = operators.filter(o => (filterRegion==='All'||o.region===filterRegion) && o.active)

  const projectName = (id: string) => projects.find(p=>p.id===id)?.name||'—'

  return (
    <Shell>
      <PageHeader title="Operator Planning" sub={`${operators.filter(o=>o.active).length} active operators · Gantt view`}
        actions={<Btn onClick={()=>setTab('add')}>+ Add Operator</Btn>} />
      <div style={{padding:'24px 28px'}}>

        {/* Tab nav */}
        <div style={{display:'flex',gap:8,marginBottom:20}}>
          {(['gantt','list','add'] as const).map(t=>(
            <button key={t} onClick={()=>setTab(t)} style={{ background:tab===t?'rgba(0,212,184,0.13)':'var(--card)', border:`1px solid ${tab===t?'rgba(0,212,184,0.27)':'var(--border)'}`, borderRadius:7, padding:'7px 18px', color:tab===t?'var(--teal)':'var(--dim)', fontWeight:tab===t?700:500, fontSize:13, cursor:'pointer' }}>
              {t==='gantt'?'📊 Gantt Chart':t==='list'?'👥 Operator List':'➕ Add Operator'}
            </button>
          ))}
        </div>

        {/* GANTT */}
        {tab==='gantt' && (
          <div style={{display:'flex',flexDirection:'column',gap:16}}>
            <div style={{display:'flex',gap:12,alignItems:'center',flexWrap:'wrap'}}>
              <Select value={filterRegion} onChange={e=>setFilterRegion(e.target.value)} style={{width:120}}>
                <option>All</option>{REGIONS.map(r=><option key={r}>{r}</option>)}
              </Select>
              <div style={{display:'flex',alignItems:'center',gap:8}}>
                <span style={{color:'var(--dim)',fontSize:12}}>Weeks:</span>
                <Input type="number" min="1" max="52" value={visibleWeeks[0]} onChange={e=>setVisibleWeeks(v=>[parseInt(e.target.value)||1,v[1]])} style={{width:60}} />
                <span style={{color:'var(--dim)'}}>→</span>
                <Input type="number" min="1" max="52" value={visibleWeeks[1]} onChange={e=>setVisibleWeeks(v=>[v[0],parseInt(e.target.value)||52])} style={{width:60}} />
              </div>
              {/* Legend */}
              <div style={{display:'flex',gap:10,marginLeft:'auto',flexWrap:'wrap'}}>
                {Object.entries(ASSIGN_COLORS).map(([k,c])=>(
                  <div key={k} style={{display:'flex',alignItems:'center',gap:4}}>
                    <div style={{width:10,height:10,borderRadius:2,background:c}}/>
                    <span style={{color:'var(--dim)',fontSize:10,textTransform:'capitalize'}}>{k}</span>
                  </div>
                ))}
              </div>
            </div>

            <Card style={{overflow:'auto',padding:0}}>
              <div style={{minWidth: 200+visWeeks.length*52}}>
                {/* Header row */}
                <div style={{display:'flex',background:'var(--card2)',borderBottom:'1px solid var(--border)',position:'sticky',top:0,zIndex:10}}>
                  <div style={{width:200,minWidth:200,padding:'8px 16px',borderRight:'1px solid var(--border)',color:'var(--muted)',fontSize:11,fontWeight:700,textTransform:'uppercase'}}>Operator</div>
                  {visWeeks.map(w=>(
                    <div key={w} style={{width:52,minWidth:52,padding:'8px 4px',textAlign:'center',borderRight:'1px solid var(--border)', background:w===CURRENT_WEEK?'rgba(0,212,184,0.08)':'transparent'}}>
                      <div style={{color:w===CURRENT_WEEK?'var(--teal)':'var(--muted)',fontSize:9,fontWeight:w===CURRENT_WEEK?700:400}}>{w===CURRENT_WEEK?'●':''} Wk{w}</div>
                    </div>
                  ))}
                </div>

                {/* Operator rows */}
                {loading ? (
                  <div style={{padding:24,color:'var(--dim)',textAlign:'center'}}>Loading Gantt…</div>
                ) : filteredOps.map((op, oi) => (
                  <div key={op.id} style={{display:'flex',borderBottom:'1px solid rgba(30,45,66,0.5)',background:oi%2===0?'transparent':'rgba(22,32,48,0.4)'}}>
                    <div style={{width:200,minWidth:200,padding:'6px 16px',borderRight:'1px solid var(--border)',display:'flex',alignItems:'center',gap:8}}>
                      <div style={{width:6,height:6,borderRadius:'50%',background:REGION_C[op.region]||'var(--muted)',flexShrink:0}}/>
                      <div>
                        <div style={{fontSize:12,fontWeight:600,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',maxWidth:140}}>{op.name}</div>
                        <div style={{color:'var(--muted)',fontSize:10}}>{op.role||op.region}</div>
                      </div>
                    </div>
                    {visWeeks.map(w => {
                      const a = getAssignment(op.id, w)
                      const proj = a?.project_id ? projects.find(p=>p.id===a.project_id) : null
                      return (
                        <div key={w} onClick={()=>openAssign(op.id, w)} style={{
                          width:52,minWidth:52,padding:'3px 2px',borderRight:'1px solid var(--border)',cursor:'pointer',
                          background:w===CURRENT_WEEK?'rgba(0,212,184,0.04)':'transparent',
                        }}>
                          {a && (
                            <div style={{
                              background: ASSIGN_COLORS[a.status]+'33',
                              border:`1px solid ${ASSIGN_COLORS[a.status]}66`,
                              borderRadius:4, padding:'2px 4px', fontSize:9, fontWeight:600,
                              color: ASSIGN_COLORS[a.status], overflow:'hidden', whiteSpace:'nowrap', textOverflow:'ellipsis',
                              maxWidth:46, lineHeight:1.3,
                            }} title={proj?.name||a.status}>
                              {a.status==='assigned'&&proj?proj.name.slice(0,8)+'…':a.status.slice(0,4)}
                            </div>
                          )}
                          {!a && <div style={{height:20,borderRadius:4,transition:'background 0.1s'}} onMouseEnter={e=>(e.currentTarget.style.background='rgba(0,212,184,0.08)')} onMouseLeave={e=>(e.currentTarget.style.background='transparent')}/>}
                        </div>
                      )
                    })}
                  </div>
                ))}
              </div>
            </Card>

            {/* Assignment counts per week */}
            <Card style={{padding:'16px 20px'}}>
              <SectionHead accent="var(--blue)">Systems Planned Per Week</SectionHead>
              <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
                {visWeeks.map(w=>{
                  const count = assignments.filter(a=>a.week_number===w&&a.year===CURRENT_YEAR&&a.status==='assigned').length
                  return(
                    <div key={w} style={{background:count>80?'rgba(239,68,68,0.15)':count>60?'rgba(245,158,11,0.15)':'var(--card2)', border:`1px solid ${count>80?'rgba(239,68,68,0.4)':count>60?'rgba(245,158,11,0.3)':'var(--border)'}`, borderRadius:7, padding:'6px 10px', textAlign:'center', minWidth:46}}>
                      <div style={{color:'var(--muted)',fontSize:9}}>Wk{w}</div>
                      <div style={{color:count>80?'var(--red)':count>60?'var(--amber)':'var(--teal)',fontWeight:800,fontSize:16,fontFamily:'monospace'}}>{count}</div>
                    </div>
                  )
                })}
              </div>
            </Card>
          </div>
        )}

        {/* LIST */}
        {tab==='list' && (
          <Card style={{overflow:'hidden'}}>
            <div style={{display:'grid',gridTemplateColumns:'2fr 80px 120px 60px 80px 80px',background:'var(--card2)',padding:'9px 20px',borderBottom:'1px solid var(--border)'}}>
              {['Name','Region','Role','FTE','Status',''].map(h=><div key={h} style={{color:'var(--muted)',fontSize:10,fontWeight:700,textTransform:'uppercase',letterSpacing:'0.07em'}}>{h}</div>)}
            </div>
            <div style={{maxHeight:560,overflowY:'auto'}}>
              {operators.map((op,i)=>(
                <div key={i} style={{display:'grid',gridTemplateColumns:'2fr 80px 120px 60px 80px 80px',padding:'9px 20px',borderBottom:'1px solid rgba(30,45,66,0.5)'}}>
                  <div style={{fontWeight:600,fontSize:13}}>{op.name}</div>
                  <Pill small color={REGION_C[op.region]||'var(--muted)'}>{op.region}</Pill>
                  <div style={{color:'var(--dim)',fontSize:12}}>{op.role||'—'}</div>
                  <div style={{color:'var(--teal)',fontFamily:'monospace',fontWeight:700}}>{op.fte}</div>
                  <Pill small color={op.active?'var(--green)':'var(--muted)'}>{op.active?'Active':'Inactive'}</Pill>
                  <div style={{display:'flex',gap:6}}>
                    <button onClick={()=>supabase.from('operators').update({active:!op.active}).eq('id',op.id).then(()=>load())} style={{background:'none',border:'none',color:'var(--dim)',cursor:'pointer',fontSize:12}}>
                      {op.active?'⏸':'▶'}
                    </button>
                    <button onClick={()=>delOperator(op.id)} style={{background:'none',border:'none',color:'var(--red)',cursor:'pointer',fontSize:12}}>🗑</button>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* ADD OPERATOR */}
        {tab==='add' && (
          <Card style={{padding:'24px 28px',maxWidth:560}}>
            <SectionHead>Add New Operator</SectionHead>
            <div style={{display:'flex',flexDirection:'column',gap:14}}>
              {[
                {l:'Full Name',k:'name',type:'text',ph:'e.g. Jan de Vries'},
                {l:'Role / Title',k:'role',type:'text',ph:'e.g. Germany, Coach/Int'},
                {l:'Email',k:'email',type:'email',ph:'name@example.com'},
                {l:'Phone',k:'phone',type:'text',ph:'+31 6 12345678'},
              ].map(({l,k,type,ph})=>(
                <div key={k}>
                  <div style={{color:'var(--dim)',fontSize:11,marginBottom:4,fontWeight:600}}>{l}</div>
                  <Input type={type} value={(newOp as any)[k]||''} onChange={e=>setNewOp(p=>({...p,[k]:e.target.value}))} placeholder={ph} />
                </div>
              ))}
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14}}>
                <div>
                  <div style={{color:'var(--dim)',fontSize:11,marginBottom:4,fontWeight:600}}>Region</div>
                  <Select value={newOp.region||'NL'} onChange={e=>setNewOp(p=>({...p,region:e.target.value as Region}))}>
                    {REGIONS.map(r=><option key={r}>{r}</option>)}
                  </Select>
                </div>
                <div>
                  <div style={{color:'var(--dim)',fontSize:11,marginBottom:4,fontWeight:600}}>FTE</div>
                  <Input type="number" min="0" max="1" step="0.1" value={newOp.fte||1} onChange={e=>setNewOp(p=>({...p,fte:parseFloat(e.target.value)||1}))} />
                </div>
              </div>
              <div style={{display:'flex',gap:10,marginTop:4}}>
                <Btn onClick={addOperator} disabled={saving||!newOp.name}>{saving?'Saving…':'Add Operator'}</Btn>
                <Btn variant="secondary" onClick={()=>setTab('list')}>Cancel</Btn>
              </div>
            </div>
          </Card>
        )}
      </div>

      {/* Assignment modal */}
      {assignModal && (
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.7)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:200}}>
          <Card style={{padding:'28px 32px',minWidth:400,maxWidth:480}} accent="var(--teal)">
            <div style={{fontWeight:800,fontSize:16,marginBottom:4}}>Assign Week {assignModal.week}</div>
            <div style={{color:'var(--dim)',fontSize:12,marginBottom:20}}>
              {operators.find(o=>o.id===assignModal.opId)?.name} · {CURRENT_YEAR}
            </div>
            <div style={{display:'flex',flexDirection:'column',gap:14}}>
              <div>
                <div style={{color:'var(--dim)',fontSize:11,marginBottom:4,fontWeight:600}}>Project (clear to unassign)</div>
                {assignForm.project_id && (
                  <div style={{ background:'rgba(0,212,184,0.08)', border:'1px solid rgba(0,212,184,0.3)', borderRadius:6, padding:'6px 10px', fontSize:12, fontWeight:700, color:'var(--teal)', marginBottom:6, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                    <span>{projects.find(p=>p.id===assignForm.project_id)?.name || '—'}</span>
                    <button onClick={()=>{setAssignForm(f=>({...f,project_id:''}));setProjectSearch('')}} style={{ background:'none', border:'none', color:'var(--muted)', cursor:'pointer', fontSize:14 }}>×</button>
                  </div>
                )}
                <div style={{ background:'var(--card2)', border:'1px solid var(--border)', borderRadius:6, display:'flex', alignItems:'center', gap:6, padding:'6px 10px', marginBottom:4 }}>
                  <span style={{ color:'var(--muted)', fontSize:12 }}>🔍</span>
                  <input value={projectSearch} onChange={e=>setProjectSearch(e.target.value)} placeholder="Search projects…"
                    style={{ background:'none', border:'none', color:'var(--text)', fontFamily:'inherit', fontSize:12, outline:'none', flex:1 }} />
                </div>
                <div style={{ border:'1px solid var(--border)', borderRadius:6, maxHeight:150, overflowY:'auto' }}>
                  <div onClick={()=>{setAssignForm(f=>({...f,project_id:''}));setProjectSearch('')}}
                    style={{ padding:'6px 10px', cursor:'pointer', fontSize:11, color:'var(--muted)', borderBottom:'1px solid rgba(30,45,66,0.5)' }}>
                    — Unassigned / Clear —
                  </div>
                  {projects.filter(p => !projectSearch || p.name.toLowerCase().includes(projectSearch.toLowerCase()) || (p.region||'').toLowerCase().includes(projectSearch.toLowerCase())).map(p => (
                    <div key={p.id} onClick={()=>{setAssignForm(f=>({...f,project_id:p.id}));setProjectSearch('')}}
                      style={{ padding:'7px 10px', cursor:'pointer', fontSize:12, display:'flex', alignItems:'center', gap:8, background:assignForm.project_id===p.id?'rgba(0,212,184,0.08)':'transparent', borderBottom:'1px solid rgba(30,45,66,0.3)' }}>
                      <div style={{ width:3, height:18, borderRadius:2, background:p.status==='Committed'?'var(--teal)':p.status==='Pipeline'?'var(--amber)':'var(--muted)', flexShrink:0 }} />
                      <div style={{ flex:1, fontSize:11, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{p.name} <span style={{color:'var(--muted)'}}>{p.region}</span></div>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <div style={{color:'var(--dim)',fontSize:11,marginBottom:4,fontWeight:600}}>Status</div>
                <Select value={assignForm.status} onChange={e=>setAssignForm(f=>({...f,status:e.target.value}))}>
                  {Object.keys(ASSIGN_COLORS).map(s=><option key={s}>{s}</option>)}
                </Select>
              </div>
              <div>
                <div style={{color:'var(--dim)',fontSize:11,marginBottom:4,fontWeight:600}}>Notes</div>
                <Input value={assignForm.notes} onChange={e=>setAssignForm(f=>({...f,notes:e.target.value}))} placeholder="Optional" />
              </div>
              <div style={{display:'flex',gap:10}}>
                <Btn onClick={saveAssignment} disabled={saving}>{saving?'Saving…':'Save'}</Btn>
                <Btn variant="secondary" onClick={()=>setAssignModal(null)}>Cancel</Btn>
              </div>
            </div>
          </Card>
        </div>
      )}
    </Shell>
  )
}

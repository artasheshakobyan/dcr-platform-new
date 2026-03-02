'use client'
import { useEffect, useState } from 'react'
import Shell from '@/components/ui/Shell'
import { Card, Pill, Btn, Input, Select, PageHeader, SectionHead, REGION_C } from '@/components/ui'
import { supabase, SystemLocation } from '@/lib/supabase'
import { Project } from '@/types'
import { GoogleMap, useLoadScript, Marker, InfoWindow } from '@react-google-maps/api'

const MAP_STYLE = [
  {elementType:'geometry',stylers:[{color:'#0d1a2e'}]},
  {elementType:'labels.text.fill',stylers:[{color:'#8ba3be'}]},
  {elementType:'labels.text.stroke',stylers:[{color:'#0d1a2e'}]},
  {featureType:'administrative.country',elementType:'geometry.stroke',stylers:[{color:'#1e2d42'}]},
  {featureType:'road',elementType:'geometry',stylers:[{color:'#162030'}]},
  {featureType:'road',elementType:'geometry.stroke',stylers:[{color:'#1e2d42'}]},
  {featureType:'water',elementType:'geometry',stylers:[{color:'#050d18'}]},
]

const STATUS_COLORS = { active:'#00D4B8', repair:'#F59E0B', transit:'#3B82F6', storage:'#4B6280' }

export default function MapPage() {
    // Capital city coordinates for each region
    const REGION_CAPITALS: Record<string, {lat: number, lng: number}> = {
      NL: { lat: 52.3676, lng: 4.9041 }, // Amsterdam
      BE: { lat: 50.8503, lng: 4.3517 }, // Brussels
      DE: { lat: 52.52, lng: 13.405 },   // Berlin
      US: { lat: 38.9072, lng: -77.0369 }, // Washington DC
      EU: { lat: 50.8503, lng: 4.3517 }, // Brussels (EU)
      CZ: { lat: 50.0755, lng: 14.4378 }, // Prague
      LU: { lat: 49.6116, lng: 6.1319 }, // Luxembourg City
      GR: { lat: 37.9838, lng: 23.7275 }, // Athens
      CH: { lat: 46.948, lng: 7.4474 }, // Bern
      AT: { lat: 48.2082, lng: 16.3738 }, // Vienna
      FR: { lat: 48.8566, lng: 2.3522 }, // Paris
      UK: { lat: 51.5074, lng: -0.1278 }, // London
    };

    // Optionally, a lookup for some major city/state capitals (expand as needed)
    const CITY_STATE_CAPITALS: Record<string, {lat: number, lng: number}> = {
      'Berlin': { lat: 52.52, lng: 13.405 },
      'Bavaria': { lat: 48.7904, lng: 11.4979 },
      'Brussels': { lat: 50.8503, lng: 4.3517 },
      'Paris': { lat: 48.8566, lng: 2.3522 },
      'London': { lat: 51.5074, lng: -0.1278 },
      // Add more as needed
    };
  const [systems, setSystems] = useState<SystemLocation[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [selected, setSelected] = useState<SystemLocation|null>(null)
  const [selectedProject, setSelectedProject] = useState<Project|null>(null)
  const [tab, setTab] = useState<'map'|'manage'>('map')
  const [form, setForm] = useState<Partial<SystemLocation>>({ system_code:'', region:'', lat:52.0, lng:4.0, status:'active', notes:'' })
  const [saving, setSaving] = useState(false)

  // Count systems per project (only those with a project_id matching a project)
  const systemsByProject: Record<string, number> = {};
  systems.forEach(sys => {
    if (sys.project_id) {
      systemsByProject[sys.project_id] = (systemsByProject[sys.project_id] || 0) + 1;
    }
  });

  const { isLoaded } = useLoadScript({ googleMapsApiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY||'' })

  const load = async () => {
    const [s, p] = await Promise.all([
      supabase.from('system_locations').select('*, project:projects(name,region)').order('system_code'),
      supabase.from('projects').select('id,name,region,category,status,finance_id,city_state,crm_percent,total_km,km_per_week,pm,delivery,inf_prod,start_date,end_date,desired_systems_per_week,notes,lat,lng,created_at,updated_at').order('name'),
    ])
    setSystems(s.data||[]);
    if (p.data) {
      setProjects(
        p.data.map((item: any) => ({
          id: item.id,
          name: item.name,
          region: item.region,
          category: item.category ?? 'EU',
          status: item.status ?? 'Pipeline',
          finance_id: item.finance_id ?? '',
          total_km: item.total_km ?? 0,
          km_per_week: item.km_per_week ?? 0,
          pm: item.pm ?? '',
          delivery: item.delivery ?? '',
          inf_prod: item.inf_prod ?? '',
          start_date: item.start_date ?? '',
          end_date: item.end_date ?? '',
          desired_systems_per_week: item.desired_systems_per_week ?? 1,
          notes: item.notes ?? '',
          lat: item.lat ?? undefined,
          lng: item.lng ?? undefined,
          created_at: item.created_at ?? '',
          updated_at: item.updated_at ?? '',
        }))
      );
    } else {
      setProjects([]);
    }
  }
  useEffect(() => { load() }, [])

  const save = async () => {
    setSaving(true)
    if (form.id) { await supabase.from('system_locations').update({ ...form, last_updated: new Date().toISOString() }).eq('id', form.id) }
    else { await supabase.from('system_locations').insert({ ...form, last_updated: new Date().toISOString() }) }
    await load(); setForm({ system_code:'', region:'', lat:52.0, lng:4.0, status:'active', notes:'' }); setSaving(false)
  }

  const del = async (id: string) => { if (!confirm('Remove system?')) return; await supabase.from('system_locations').delete().eq('id', id); await load() }

  const statusCounts = { active: systems.filter(s=>s.status==='active').length, repair: systems.filter(s=>s.status==='repair').length, transit: systems.filter(s=>s.status==='transit').length, storage: systems.filter(s=>s.status==='storage').length }

  return (
    <Shell>
      <PageHeader title="Live Map" sub={`${systems.length} DCR systems tracked globally`} />
      <div style={{padding:'24px 28px',display:'flex',flexDirection:'column',gap:20}}>

        {/* Status summary */}
        <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:12}}>
          {Object.entries(statusCounts).map(([s,c])=>(
            <Card key={s} style={{padding:'12px 16px'}} accent={STATUS_COLORS[s as keyof typeof STATUS_COLORS]}>
              <div style={{color:'var(--muted)',fontSize:10,textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:4}}>{s}</div>
              <div style={{color:STATUS_COLORS[s as keyof typeof STATUS_COLORS],fontSize:28,fontWeight:800,fontFamily:'monospace'}}>{c}</div>
            </Card>
          ))}
        </div>

        <div style={{display:'flex',gap:8,marginBottom:4}}>
          {(['map','manage'] as const).map(t=>(
            <button key={t} onClick={()=>setTab(t)} style={{ background:tab===t?'rgba(0,212,184,0.13)':'var(--card)', border:`1px solid ${tab===t?'rgba(0,212,184,0.27)':'var(--border)'}`, borderRadius:7, padding:'7px 18px', color:tab===t?'var(--teal)':'var(--dim)', fontWeight:tab===t?700:500, fontSize:13, cursor:'pointer' }}>
              {t==='map'?'🗺 Live Map':'⚙ Manage Systems'}
            </button>
          ))}
        </div>

      {tab==='map' && (
        <Card style={{overflow:'hidden',height:580}}>
          {!isLoaded ? (
            <div style={{height:'100%',display:'flex',alignItems:'center',justifyContent:'center',color:'var(--dim)'}}>Loading Google Maps…</div>
          ) : (
            <GoogleMap
              mapContainerStyle={{width:'100%',height:'100%'}}
              center={{lat:51.0,lng:10.0}} zoom={5}
              options={{styles:MAP_STYLE,disableDefaultUI:false,zoomControl:true,streetViewControl:false,mapTypeControl:false}}
            >
              {/* Project pins */}
              {projects.map(p => {
                // Use project lat/lng if present and valid
                let lat = (typeof p.lat === 'number' && p.lat) ? p.lat : undefined;
                let lng = (typeof p.lng === 'number' && p.lng) ? p.lng : undefined;
                // If missing, try city/state capital
                if ((!lat || !lng) && p.city_state && CITY_STATE_CAPITALS[p.city_state]) {
                  lat = CITY_STATE_CAPITALS[p.city_state].lat;
                  lng = CITY_STATE_CAPITALS[p.city_state].lng;
                }
                // If still missing, use region capital
                if ((!lat || !lng) && p.region && REGION_CAPITALS[p.region]) {
                  lat = REGION_CAPITALS[p.region].lat;
                  lng = REGION_CAPITALS[p.region].lng;
                }
                // If still missing, skip
                if (!lat || !lng) return null;
                return (
                  <Marker key={p.id} position={{lat, lng}}
                    onClick={()=>setSelectedProject(p)}
                    label={systemsByProject[p.id] ? { text: String(systemsByProject[p.id]), color: '#fff', fontWeight: 'bold', fontSize: '14px' } : undefined}
                    icon={{
                      path: 'M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z',
                      fillColor: REGION_C[p.region]||'#888',
                      fillOpacity:1, strokeColor:'#fff', strokeWeight:2, scale:2.1,
                      anchor:{x:12,y:24} as any,
                    }}
                  />
                );
              })}
              {/* System pins */}
              {systems.map(sys=>(
                <Marker key={sys.id} position={{lat:sys.lat,lng:sys.lng}}
                  onClick={()=>setSelected(sys)}
                  icon={{
                    path: 'M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z',
                    fillColor: STATUS_COLORS[sys.status as keyof typeof STATUS_COLORS]||'#666',
                    fillOpacity:1, strokeColor:'#fff', strokeWeight:1.5, scale:1.8,
                    anchor:{x:12,y:24} as any,
                  }}
                />
              ))}
              {/* Project InfoWindow */}
              {selectedProject && (() => {
                // Compute InfoWindow position using the same fallback logic as for Marker
                let lat = (typeof selectedProject.lat === 'number' && selectedProject.lat) ? selectedProject.lat : undefined;
                let lng = (typeof selectedProject.lng === 'number' && selectedProject.lng) ? selectedProject.lng : undefined;
                if ((!lat || !lng) && selectedProject.city_state && CITY_STATE_CAPITALS[selectedProject.city_state]) {
                  lat = CITY_STATE_CAPITALS[selectedProject.city_state].lat;
                  lng = CITY_STATE_CAPITALS[selectedProject.city_state].lng;
                }
                if ((!lat || !lng) && selectedProject.region && REGION_CAPITALS[selectedProject.region]) {
                  lat = REGION_CAPITALS[selectedProject.region].lat;
                  lng = REGION_CAPITALS[selectedProject.region].lng;
                }
                if (!lat || !lng) return null;
                return (
                  <InfoWindow position={{lat, lng}} onCloseClick={()=>setSelectedProject(null)}>
                    <div style={{fontFamily:'Inter,sans-serif',minWidth:220}}>
                      <div style={{fontWeight:700,fontSize:15,marginBottom:4}}>{selectedProject.name}</div>
                      <div style={{fontSize:12,color:'#555',marginBottom:2}}>{selectedProject.city_state||'—'} | CRM: <b>{selectedProject.crm_percent||0}%</b></div>
                      <div style={{fontSize:11,color:'#666'}}>Region: <b style={{color:REGION_C[selectedProject.region]}}>{selectedProject.region}</b> | Status: <b>{selectedProject.status}</b></div>
                      <div style={{fontSize:13,color:'#00D4B8',margin:'6px 0 2px 0',fontWeight:700}}>
                        {systemsByProject[selectedProject.id] ? `${systemsByProject[selectedProject.id]} system${systemsByProject[selectedProject.id]!==1?'s':''} driving` : 'No systems driving'}
                      </div>
                      <div style={{fontSize:11,color:'#888',marginTop:4}}>{selectedProject.notes||''}</div>
                      <a href={`/projects?pid=${selectedProject.id}`} style={{fontSize:12,color:'#00D4B8',textDecoration:'underline',marginTop:6,display:'inline-block'}}>Open Project ↗</a>
                    </div>
                  </InfoWindow>
                );
              })()}
              {/* System InfoWindow */}
              {selected && (
                <InfoWindow position={{lat:selected.lat,lng:selected.lng}} onCloseClick={()=>setSelected(null)}>
                  <div style={{fontFamily:'Inter,sans-serif',minWidth:180}}>
                    <div style={{fontWeight:700,fontSize:14,marginBottom:4}}>{selected.system_code}</div>
                    {selected.project && <div style={{fontSize:12,color:'#555',marginBottom:4}}>{(selected.project as any).name}</div>}
                    <div style={{fontSize:11,color:'#666'}}>Status: <b style={{color:STATUS_COLORS[selected.status as keyof typeof STATUS_COLORS]}}>{selected.status}</b></div>
                    {selected.notes && <div style={{fontSize:11,color:'#888',marginTop:4}}>{selected.notes}</div>}
                    <div style={{fontSize:10,color:'#aaa',marginTop:4}}>{new Date(selected.last_updated).toLocaleString()}</div>
                  </div>
                </InfoWindow>
              )}
            </GoogleMap>
          )}
        </Card>
      )}

        {tab==='manage' && (
          <div style={{display:'grid',gridTemplateColumns:'1fr 360px',gap:20,alignItems:'start'}}>
            <Card style={{padding:0,overflow:'hidden'}}>
              <div style={{display:'grid',gridTemplateColumns:'120px 100px 100px 180px 80px 60px',background:'var(--card2)',padding:'9px 20px',borderBottom:'1px solid var(--border)'}}>
                {['System Code','Status','Region','Project','Updated',''].map(h=>(
                  <div key={h} style={{color:'var(--muted)',fontSize:10,fontWeight:700,textTransform:'uppercase',letterSpacing:'0.07em'}}>{h}</div>
                ))}
              </div>
              <div style={{maxHeight:520,overflowY:'auto'}}>
                {systems.map((s,i)=>(
                  <div key={i} style={{display:'grid',gridTemplateColumns:'120px 100px 100px 180px 80px 60px',padding:'9px 20px',borderBottom:'1px solid rgba(30,45,66,0.4)'}}>
                    <div style={{fontWeight:700,fontSize:12,fontFamily:'monospace'}}>{s.system_code}</div>
                    <Pill small color={STATUS_COLORS[s.status as keyof typeof STATUS_COLORS]}>{s.status}</Pill>
                    <Pill small color={REGION_C[s.region||'']||'var(--muted)'}>{s.region||'—'}</Pill>
                    <div style={{fontSize:11,color:'var(--dim)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{(s.project as any)?.name||'—'}</div>
                    <div style={{fontSize:10,color:'var(--muted)'}}>{new Date(s.last_updated).toLocaleDateString()}</div>
                    <div style={{display:'flex',gap:4}}>
                      <button onClick={()=>setForm(s)} style={{background:'none',border:'none',color:'var(--dim)',cursor:'pointer',fontSize:12}}>✏️</button>
                      <button onClick={()=>del(s.id)} style={{background:'none',border:'none',color:'var(--red)',cursor:'pointer',fontSize:12}}>🗑</button>
                    </div>
                  </div>
                ))}
              </div>
            </Card>

            {/* Add/Edit form */}
            <Card style={{padding:'20px 22px'}}>
              <SectionHead>{form.id?'Edit System':'Add System Location'}</SectionHead>
              <div style={{display:'flex',flexDirection:'column',gap:12}}>
                {[{l:'System Code',k:'system_code',ph:'e.g. DCR-NL-01'},{l:'Notes',k:'notes',ph:'Optional'}].map(({l,k,ph})=>(
                  <div key={k}>
                    <div style={{color:'var(--dim)',fontSize:11,marginBottom:3,fontWeight:600}}>{l}</div>
                    <Input value={(form as any)[k]||''} onChange={e=>setForm(f=>({...f,[k]:e.target.value}))} placeholder={ph} />
                  </div>
                ))}
                <div>
                  <div style={{color:'var(--dim)',fontSize:11,marginBottom:3,fontWeight:600}}>Status</div>
                  <Select value={form.status||'active'} onChange={e=>setForm(f=>({...f,status:e.target.value as any}))}>
                    {Object.keys(STATUS_COLORS).map(s=><option key={s}>{s}</option>)}
                  </Select>
                </div>
                <div>
                  <div style={{color:'var(--dim)',fontSize:11,marginBottom:3,fontWeight:600}}>Region</div>
                  <Select value={form.region||''} onChange={e=>setForm(f=>({...f,region:e.target.value}))}>
                    <option value="">—</option>
                    {['NL','BE','DE','US','EU','CZ','LU','GR','CH'].map(r=><option key={r}>{r}</option>)}
                  </Select>
                </div>
                <div>
                  <div style={{color:'var(--dim)',fontSize:11,marginBottom:3,fontWeight:600}}>Project</div>
                  <Select value={form.project_id||''} onChange={e=>setForm(f=>({...f,project_id:e.target.value}))}>
                    <option value="">—</option>
                    {projects.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
                  </Select>
                </div>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
                  <div>
                    <div style={{color:'var(--dim)',fontSize:11,marginBottom:3,fontWeight:600}}>Latitude</div>
                    <Input type="number" step="0.0001" value={form.lat||''} onChange={e=>setForm(f=>({...f,lat:parseFloat(e.target.value)||0}))} />
                  </div>
                  <div>
                    <div style={{color:'var(--dim)',fontSize:11,marginBottom:3,fontWeight:600}}>Longitude</div>
                    <Input type="number" step="0.0001" value={form.lng||''} onChange={e=>setForm(f=>({...f,lng:parseFloat(e.target.value)||0}))} />
                  </div>
                </div>
                <div style={{display:'flex',gap:8,marginTop:4}}>
                  <Btn onClick={save} disabled={saving||!form.system_code}>{saving?'Saving…':form.id?'Update':'Add System'}</Btn>
                  {form.id && <Btn variant="secondary" onClick={()=>setForm({system_code:'',region:'',lat:52,lng:4,status:'active',notes:''})}>Clear</Btn>}
                </div>
              </div>
            </Card>
          </div>
        )}
      </div>
    </Shell>
  )
}

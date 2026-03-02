'use client'
import { useEffect, useState } from 'react'
import Shell from '@/components/ui/Shell'
import { Card, PageHeader, SectionHead, Pill, Btn, Input, Select } from '@/components/ui'
import { supabase, FleetMaintenance } from '@/lib/supabase'
import { getISOWeek } from 'date-fns'

const CURRENT_WEEK = getISOWeek(new Date())
const CURRENT_YEAR = new Date().getFullYear()
const STATUS_C: Record<string, string> = { active: 'var(--teal)', repair: 'var(--red)', transit: 'var(--amber)', storage: 'var(--muted)' }

export default function FleetPage() {
  const [tab, setTab] = useState<'systems' | 'maintenance'>('systems')
  const [systems, setSystems] = useState<any[]>([])
  const [maintenance, setMaintenance] = useState<FleetMaintenance[]>([])
  const [progress, setProgress] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showAddMaint, setShowAddMaint] = useState(false)
  const [maintForm, setMaintForm] = useState({ system_code: '', maintenance_type: 'calibration', performed_by: '', notes: '', cost_eur: '' })
  const [saving, setSaving] = useState(false)

  const load = async () => {
    const [s, m, pr] = await Promise.all([
      supabase.from('system_locations').select('*, project:projects(name,region)').order('system_code'),
      supabase.from('fleet_maintenance').select('*').order('performed_at', { ascending: false }).limit(100),
      supabase.from('project_progress').select('project_id,cumulative_images').order('week_number', { ascending: false }),
    ])
    setSystems(s.data || [])
    setMaintenance(m.data || [])
    setProgress(pr.data || [])
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  // Lifetime KM per system — from all progress entries ever for projects linked to this system
  const getSystemKm = (systemCode: string) => {
    const sys = systems.find(s => s.system_code === systemCode)
    if (!sys?.project_id) return 0
    const entries = progress.filter(p => p.project_id === sys.project_id)
    if (!entries.length) return 0
    const latest = entries[0]
    return Math.round(latest.cumulative_images / 200)
  }

  // Systems not updated in 3+ weeks
  const staleThreshold = new Date()
  staleThreshold.setDate(staleThreshold.getDate() - 21)

  const saveMaint = async () => {
    if (!maintForm.system_code || !maintForm.maintenance_type) return
    setSaving(true)
    await supabase.from('fleet_maintenance').insert({
      ...maintForm,
      cost_eur: maintForm.cost_eur ? parseFloat(maintForm.cost_eur) : null,
      performed_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
    })
    setShowAddMaint(false)
    setMaintForm({ system_code: '', maintenance_type: 'calibration', performed_by: '', notes: '', cost_eur: '' })
    setSaving(false)
    load()
  }

  const TABS = [
    { key: 'systems', label: '🏥 Systems' },
    { key: 'maintenance', label: '🔧 Maintenance Log' },
  ]

  return (
    <Shell>
      <PageHeader title="Fleet" sub={`${systems.length} systems · ${systems.filter(s => s.status === 'active').length} active · ${systems.filter(s => s.status === 'repair').length} in repair`}
        actions={tab === 'maintenance' ? <Btn onClick={() => setShowAddMaint(true)}>+ Log Maintenance</Btn> : undefined} />
      <div style={{ padding: '24px 28px' }}>

        <div style={{ display: 'flex', gap: 6, marginBottom: 20 }}>
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key as any)} style={{ background: tab === t.key ? 'rgba(0,212,184,0.13)' : 'var(--card)', border: `1px solid ${tab === t.key ? 'rgba(0,212,184,0.27)' : 'var(--border)'}`, borderRadius: 8, padding: '8px 18px', color: tab === t.key ? 'var(--teal)' : 'var(--dim)', fontWeight: tab === t.key ? 700 : 500, fontSize: 13, cursor: 'pointer' }}>{t.label}</button>
          ))}
        </div>

        {loading ? <div style={{ color: 'var(--dim)', padding: 40, textAlign: 'center' }}>Loading…</div> : (
          <>
            {tab === 'systems' && (
              <>
                {/* Summary tiles */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 20 }}>
                  {[
                    { label: 'Total Systems', value: systems.length, color: 'var(--teal)' },
                    { label: 'Active', value: systems.filter(s => s.status === 'active').length, color: 'var(--green)' },
                    { label: 'In Repair', value: systems.filter(s => s.status === 'repair').length, color: 'var(--red)' },
                    { label: 'In Transit', value: systems.filter(s => s.status === 'transit').length, color: 'var(--amber)' },
                  ].map(({ label, value, color }) => (
                    <Card key={label} style={{ padding: '14px 16px' }} accent={color}>
                      <div style={{ color: 'var(--muted)', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>{label}</div>
                      <div style={{ color, fontSize: 28, fontWeight: 800, fontFamily: 'monospace' }}>{value}</div>
                    </Card>
                  ))}
                </div>

                <Card style={{ overflow: 'hidden' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '120px 80px 80px 1fr 100px 90px 80px', background: 'var(--card2)', padding: '9px 20px', borderBottom: '1px solid var(--border)' }}>
                    {['System', 'Status', 'Region', 'Project', 'Last Updated', 'Lifetime KM', ''].map(h => (
                      <div key={h} style={{ color: 'var(--muted)', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em' }}>{h}</div>
                    ))}
                  </div>
                  {systems.length === 0 ? (
                    <div style={{ padding: '32px', textAlign: 'center', color: 'var(--dim)' }}>No systems in fleet yet. Add systems via the system_locations table in Supabase.</div>
                  ) : (
                    <div style={{ maxHeight: 500, overflowY: 'auto' }}>
                      {systems.map((s, i) => {
                        const isStale = new Date(s.last_updated) < staleThreshold && s.status === 'active'
                        const lifetimeKm = getSystemKm(s.system_code)
                        return (
                          <div key={i} style={{ display: 'grid', gridTemplateColumns: '120px 80px 80px 1fr 100px 90px 80px', padding: '10px 20px', borderBottom: '1px solid rgba(30,45,66,0.5)', alignItems: 'center' }}
                            onMouseEnter={e => ((e.currentTarget as HTMLElement).style.background = 'var(--card2)')}
                            onMouseLeave={e => ((e.currentTarget as HTMLElement).style.background = 'transparent')}>
                            <div style={{ fontWeight: 700, fontFamily: 'monospace', fontSize: 13, color: 'var(--text)' }}>{s.system_code}</div>
                            <Pill small color={STATUS_C[s.status] || 'var(--muted)'}>{s.status}</Pill>
                            <div style={{ color: 'var(--dim)', fontSize: 12 }}>{s.region || s.project?.region || '—'}</div>
                            <div style={{ fontSize: 12, color: 'var(--dim)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingRight: 8 }}>{s.project?.name || '—'}</div>
                            <div style={{ fontSize: 11, color: isStale ? 'var(--red)' : 'var(--muted)' }} title={isStale ? 'No movement in 3+ weeks' : ''}>
                              {isStale ? '⚠ ' : ''}{new Date(s.last_updated).toLocaleDateString()}
                            </div>
                            <div style={{ fontFamily: 'monospace', fontSize: 12, color: lifetimeKm > 0 ? 'var(--teal)' : 'var(--muted)' }}>{lifetimeKm > 0 ? `${lifetimeKm.toLocaleString()} km` : '—'}</div>
                            <div style={{ fontSize: 11, color: 'var(--muted)' }}>{s.notes || ''}</div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </Card>
              </>
            )}

            {tab === 'maintenance' && (
              <Card style={{ overflow: 'hidden' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '120px 110px 120px 1fr 90px 90px', background: 'var(--card2)', padding: '9px 20px', borderBottom: '1px solid var(--border)' }}>
                  {['System', 'Type', 'Performed By', 'Notes', 'Cost (€)', 'Date'].map(h => (
                    <div key={h} style={{ color: 'var(--muted)', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em' }}>{h}</div>
                  ))}
                </div>
                {maintenance.length === 0 ? (
                  <div style={{ padding: '32px', textAlign: 'center', color: 'var(--dim)' }}>No maintenance logged yet.</div>
                ) : (
                  <div style={{ maxHeight: 500, overflowY: 'auto' }}>
                    {maintenance.map((m, i) => (
                      <div key={i} style={{ display: 'grid', gridTemplateColumns: '120px 110px 120px 1fr 90px 90px', padding: '10px 20px', borderBottom: '1px solid rgba(30,45,66,0.5)', alignItems: 'center' }}
                        onMouseEnter={e => ((e.currentTarget as HTMLElement).style.background = 'var(--card2)')}
                        onMouseLeave={e => ((e.currentTarget as HTMLElement).style.background = 'transparent')}>
                        <div style={{ fontWeight: 700, fontFamily: 'monospace', fontSize: 13 }}>{m.system_code}</div>
                        <Pill small color="var(--blue)">{m.maintenance_type}</Pill>
                        <div style={{ fontSize: 12, color: 'var(--dim)' }}>{m.performed_by || '—'}</div>
                        <div style={{ fontSize: 12, color: 'var(--dim)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingRight: 8 }}>{m.notes || '—'}</div>
                        <div style={{ fontFamily: 'monospace', fontSize: 12, color: m.cost_eur ? 'var(--amber)' : 'var(--muted)' }}>{m.cost_eur ? `€${m.cost_eur}` : '—'}</div>
                        <div style={{ fontSize: 11, color: 'var(--muted)' }}>{new Date(m.performed_at).toLocaleDateString()}</div>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            )}
          </>
        )}

        {/* Add Maintenance Modal */}
        {showAddMaint && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }}>
            <Card style={{ padding: '28px 32px', minWidth: 440 }} accent="var(--teal)">
              <SectionHead>Log Maintenance</SectionHead>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div><div style={{ color: 'var(--dim)', fontSize: 11, fontWeight: 600, marginBottom: 4 }}>System Code *</div>
                  <Select value={maintForm.system_code} onChange={e => setMaintForm(f => ({ ...f, system_code: e.target.value }))}>
                    <option value="">— Select System —</option>
                    {systems.map(s => <option key={s.system_code} value={s.system_code}>{s.system_code}</option>)}
                  </Select>
                </div>
                <div><div style={{ color: 'var(--dim)', fontSize: 11, fontWeight: 600, marginBottom: 4 }}>Type *</div>
                  <Select value={maintForm.maintenance_type} onChange={e => setMaintForm(f => ({ ...f, maintenance_type: e.target.value }))}>
                    {['calibration', 'repair', 'inspection', 'upgrade', 'cleaning'].map(t => <option key={t} value={t}>{t}</option>)}
                  </Select>
                </div>
                <div><div style={{ color: 'var(--dim)', fontSize: 11, fontWeight: 600, marginBottom: 4 }}>Performed By</div><Input value={maintForm.performed_by} onChange={e => setMaintForm(f => ({ ...f, performed_by: e.target.value }))} placeholder="Your name" /></div>
                <div><div style={{ color: 'var(--dim)', fontSize: 11, fontWeight: 600, marginBottom: 4 }}>Cost (€)</div><Input type="number" value={maintForm.cost_eur} onChange={e => setMaintForm(f => ({ ...f, cost_eur: e.target.value }))} placeholder="0" /></div>
                <div><div style={{ color: 'var(--dim)', fontSize: 11, fontWeight: 600, marginBottom: 4 }}>Notes</div><Input value={maintForm.notes} onChange={e => setMaintForm(f => ({ ...f, notes: e.target.value }))} placeholder="What was done?" /></div>
                <div style={{ display: 'flex', gap: 10 }}>
                  <Btn onClick={saveMaint} disabled={saving || !maintForm.system_code}>{saving ? 'Saving…' : 'Save Maintenance'}</Btn>
                  <Btn variant="secondary" onClick={() => setShowAddMaint(false)}>Cancel</Btn>
                </div>
              </div>
            </Card>
          </div>
        )}
      </div>
    </Shell>
  )
}

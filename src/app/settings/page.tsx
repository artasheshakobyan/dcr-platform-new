'use client'
import { useEffect, useState } from 'react'
import Shell from '@/components/ui/Shell'
import { Card, PageHeader, SectionHead, Pill, Btn, Input, Select } from '@/components/ui'
import { supabase, Operator, OperatorLeave, WeeklyCapacity } from '@/lib/supabase'
import { Region } from '@/types'
import { getISOWeek } from 'date-fns'
import { getPMs, addPM, removePM, PM } from '@/lib/pm'

const REGIONS: Region[] = ['NL','BE','DE','US','EU','CZ','LU','GR','CH','AT','FR','UK']
const CURRENT_YEAR = new Date().getFullYear()
const CURRENT_WEEK = getISOWeek(new Date())
const LEAVE_TYPES = ['pto', 'sick', 'training', 'transit', 'other']
const LEAVE_COLORS: Record<string, string> = { pto: 'var(--blue)', sick: 'var(--red)', training: 'var(--violet)', transit: 'var(--teal)', other: 'var(--muted)' }

export default function SettingsPage() {
  const [tab, setTab] = useState<'operators'|'leave'|'capacity'|'pms'|'cz'>('operators')
  const [operators, setOperators] = useState<Operator[]>([])
  const [leaves, setLeaves] = useState<OperatorLeave[]>([])
  const [capacities, setCapacities] = useState<WeeklyCapacity[]>([])
  const [pms, setPms] = useState<PM[]>([])
  const [loading, setLoading] = useState(true)

  // operator form
  const [newOp, setNewOp] = useState<Partial<Operator>>({ name: '', role: '', region: 'NL', fte: 1, active: true })
  const [editOpId, setEditOpId] = useState<string | null>(null)

  // capacity edit
  const [editingCap, setEditingCap] = useState<Partial<WeeklyCapacity>>({})
  const [capWeek, setCapWeek] = useState(CURRENT_WEEK)
  const [savingCap, setSavingCap] = useState(false)

  // PM
  const [newPmName, setNewPmName] = useState('')

  // CZ tracker
  const [czData, setCzData] = useState<any[]>([])

  const load = async () => {
    const [ops, lv, caps, pmList] = await Promise.all([
      supabase.from('operators').select('*').order('name'),
      supabase.from('operator_leave').select('*, operator:operators(name,region)').order('start_date', { ascending: false }).limit(50),
      supabase.from('weekly_capacity').select('*').eq('year', CURRENT_YEAR).order('week_number'),
      getPMs(),
    ])
    setOperators(ops.data || [])
    setLeaves(lv.data || [])
    setCapacities(caps.data || [])
    setPms(pmList)
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  useEffect(() => {
    const cap = capacities.find(c => c.week_number === capWeek)
    if (cap) setEditingCap(cap)
    else setEditingCap({ week_number: capWeek, year: CURRENT_YEAR, total_capacity: 0, repair_eu: 0, repair_us: 0, rd_systems: 0, spare_eu: 0, spare_us: 0 })
  }, [capWeek, capacities])

  useEffect(() => {
    if (tab === 'cz') {
      // Load CZ operators (region = CZ)
      supabase.from('operators').select('*, assignments:operator_assignments(week_number,year,status,project_id)').eq('region', 'CZ').eq('active', true)
        .then(({ data }) => setCzData(data || []))
    }
  }, [tab])

  const saveOp = async () => {
    if (!newOp.name) return
    if (editOpId) {
      await supabase.from('operators').update({ ...newOp, updated_at: new Date().toISOString() }).eq('id', editOpId)
      setEditOpId(null)
    } else {
      await supabase.from('operators').insert({ ...newOp, created_at: new Date().toISOString() })
    }
    setNewOp({ name: '', role: '', region: 'NL', fte: 1, active: true })
    load()
  }

  const delOp = async (id: string) => {
    if (!confirm('Delete this operator?')) return
    await supabase.from('operators').delete().eq('id', id)
    load()
  }

  const saveCap = async () => {
    setSavingCap(true)
    const existing = capacities.find(c => c.week_number === capWeek)
    if (existing) {
      await supabase.from('weekly_capacity').update(editingCap).eq('id', existing.id)
    } else {
      await supabase.from('weekly_capacity').insert({ ...editingCap, week_number: capWeek, year: CURRENT_YEAR })
    }
    setSavingCap(false)
    load()
  }

  const approveLeave = async (id: string, by: string) => {
    await supabase.from('operator_leave').update({ approved_by: by }).eq('id', id)
    load()
  }

  const deleteLeave = async (id: string) => {
    if (!confirm('Delete this leave request?')) return
    await supabase.from('operator_leave').delete().eq('id', id)
    load()
  }

  const TABS = [
    { key: 'operators', label: '👷 Operators' },
    { key: 'leave', label: '📅 Leave Requests' },
    { key: 'capacity', label: '⚙️ Capacity Config' },
    { key: 'pms', label: '👔 Project Managers' },
    { key: 'cz', label: '🛂 CZ 180-Day' },
  ]

  return (
    <Shell>
      <PageHeader title="Settings & Admin" sub="Operators, leave, capacity configuration, PMs" />
      <div style={{ padding: '24px 28px' }}>
        <div style={{ display: 'flex', gap: 6, marginBottom: 20, flexWrap: 'wrap' }}>
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key as any)} style={{ background: tab === t.key ? 'rgba(0,212,184,0.13)' : 'var(--card)', border: `1px solid ${tab === t.key ? 'rgba(0,212,184,0.27)' : 'var(--border)'}`, borderRadius: 8, padding: '8px 16px', color: tab === t.key ? 'var(--teal)' : 'var(--dim)', fontWeight: tab === t.key ? 700 : 500, fontSize: 13, cursor: 'pointer' }}>{t.label}</button>
          ))}
        </div>

        {loading ? <div style={{ color: 'var(--dim)', padding: 40, textAlign: 'center' }}>Loading…</div> : (
          <>
            {/* OPERATORS TAB */}
            {tab === 'operators' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                <Card style={{ padding: '20px 24px' }}>
                  <SectionHead accent="var(--teal)">{editOpId ? 'Edit Operator' : 'Add Operator'}</SectionHead>
                  <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr 80px 80px 1fr auto', gap: 10, alignItems: 'flex-end' }}>
                    {[['Name *', <Input key="n" value={newOp.name || ''} onChange={e => setNewOp(p => ({ ...p, name: e.target.value }))} placeholder="Full name" />],
                      ['Role', <Input key="r" value={newOp.role || ''} onChange={e => setNewOp(p => ({ ...p, role: e.target.value }))} placeholder="e.g. Driver" />],
                      ['Region', <Select key="reg" value={newOp.region || 'NL'} onChange={e => setNewOp(p => ({ ...p, region: e.target.value as Region }))}>{REGIONS.map(r => <option key={r} value={r}>{r}</option>)}</Select>],
                      ['FTE', <Input key="fte" type="number" min="0.1" max="1" step="0.1" value={newOp.fte || 1} onChange={e => setNewOp(p => ({ ...p, fte: parseFloat(e.target.value) || 1 }))} />],
                      ['Email', <Input key="e" value={(newOp as any).email || ''} onChange={e => setNewOp(p => ({ ...p, email: e.target.value }))} placeholder="optional" type="email" />],
                      ['', <Btn key="s" onClick={saveOp} disabled={!newOp.name}>{editOpId ? 'Update' : 'Add'}</Btn>]
                    ].map(([label, field], i) => (
                      <div key={i}>
                        <div style={{ color: 'var(--dim)', fontSize: 11, fontWeight: 600, marginBottom: 4 }}>{label as string}</div>
                        {field as React.ReactNode}
                      </div>
                    ))}
                  </div>
                  {editOpId && <Btn variant="secondary" onClick={() => { setEditOpId(null); setNewOp({ name: '', role: '', region: 'NL', fte: 1, active: true }) }} style={{ marginTop: 10 }}>Cancel Edit</Btn>}
                </Card>
                <Card style={{ overflow: 'hidden' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr 65px 65px 1fr 80px', background: 'var(--card2)', padding: '9px 20px', borderBottom: '1px solid var(--border)' }}>
                    {['Name', 'Role', 'Region', 'FTE', 'Email', 'Actions'].map(h => <div key={h} style={{ color: 'var(--muted)', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em' }}>{h}</div>)}
                  </div>
                  <div style={{ maxHeight: 400, overflowY: 'auto' }}>
                    {operators.map((op, i) => (
                      <div key={i} style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr 65px 65px 1fr 80px', padding: '10px 20px', borderBottom: '1px solid rgba(30,45,66,0.5)', alignItems: 'center' }}
                        onMouseEnter={e => ((e.currentTarget as HTMLElement).style.background = 'var(--card2)')}
                        onMouseLeave={e => ((e.currentTarget as HTMLElement).style.background = 'transparent')}>
                        <div style={{ fontWeight: 600, fontSize: 13 }}>{op.name}</div>
                        <div style={{ color: 'var(--dim)', fontSize: 12 }}>{op.role || '—'}</div>
                        <Pill small color="var(--blue)">{op.region}</Pill>
                        <div style={{ color: 'var(--muted)', fontSize: 12 }}>{op.fte}</div>
                        <div style={{ color: 'var(--muted)', fontSize: 11 }}>{op.email || '—'}</div>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button onClick={() => { setEditOpId(op.id); setNewOp({ name: op.name, role: op.role, region: op.region, fte: op.fte, email: op.email, active: op.active }) }} style={{ background: 'none', border: 'none', color: 'var(--teal)', cursor: 'pointer', fontSize: 13 }}>✏️</button>
                          <button onClick={() => delOp(op.id)} style={{ background: 'none', border: 'none', color: 'var(--red)', cursor: 'pointer', fontSize: 13 }}>🗑</button>
                        </div>
                      </div>
                    ))}
                  </div>
                </Card>
              </div>
            )}

            {/* LEAVE REQUESTS TAB */}
            {tab === 'leave' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                <div style={{ color: 'var(--dim)', fontSize: 13 }}>Leave requests submitted by operators via their <a href="/me" style={{ color: 'var(--teal)' }}>/me page</a>. Review and approve or delete them here.</div>
                <Card style={{ overflow: 'hidden' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 90px 100px 100px 1fr 90px 80px', background: 'var(--card2)', padding: '9px 20px', borderBottom: '1px solid var(--border)' }}>
                    {['Operator', 'Region', 'Type', 'From', 'Until / Notes', 'Approved By', 'Actions'].map(h => <div key={h} style={{ color: 'var(--muted)', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em' }}>{h}</div>)}
                  </div>
                  {leaves.length === 0 ? (
                    <div style={{ padding: '32px', textAlign: 'center', color: 'var(--dim)' }}>No leave requests yet. Operators submit leave via their /me page.</div>
                  ) : (
                    <div style={{ maxHeight: 500, overflowY: 'auto' }}>
                      {leaves.map((lv, i) => (
                        <div key={i} style={{ display: 'grid', gridTemplateColumns: '1.2fr 90px 100px 100px 1fr 90px 80px', padding: '10px 20px', borderBottom: '1px solid rgba(30,45,66,0.5)', alignItems: 'center' }}
                          onMouseEnter={e => ((e.currentTarget as HTMLElement).style.background = 'var(--card2)')}
                          onMouseLeave={e => ((e.currentTarget as HTMLElement).style.background = 'transparent')}>
                          <div style={{ fontWeight: 600, fontSize: 13 }}>{(lv as any).operator?.name || '—'}</div>
                          <Pill small color="var(--blue)">{(lv as any).operator?.region || '—'}</Pill>
                          <Pill small color={LEAVE_COLORS[lv.leave_type] || 'var(--muted)'}>{lv.leave_type}</Pill>
                          <div style={{ fontSize: 12, color: 'var(--dim)' }}>{lv.start_date}</div>
                          <div style={{ fontSize: 12 }}>
                            <div style={{ color: 'var(--dim)' }}>{lv.end_date}</div>
                            {lv.notes && <div style={{ color: 'var(--muted)', fontSize: 11 }}>{lv.notes}</div>}
                          </div>
                          <div style={{ fontSize: 11 }}>
                            {lv.approved_by ? (
                              <Pill small color="var(--green)">✓ {lv.approved_by}</Pill>
                            ) : (
                              <span style={{ color: 'var(--amber)', fontSize: 11 }}>Pending</span>
                            )}
                          </div>
                          <div style={{ display: 'flex', gap: 6 }}>
                            {!lv.approved_by && <button onClick={() => approveLeave(lv.id, 'PM')} style={{ background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.3)', borderRadius: 5, padding: '3px 8px', color: 'var(--green)', cursor: 'pointer', fontSize: 11, fontWeight: 600 }}>✓</button>}
                            <button onClick={() => deleteLeave(lv.id)} style={{ background: 'none', border: 'none', color: 'var(--red)', cursor: 'pointer', fontSize: 13 }}>🗑</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </Card>
              </div>
            )}

            {/* CAPACITY CONFIG TAB */}
            {tab === 'capacity' && (
              <Card style={{ padding: '24px 28px', maxWidth: 640 }}>
                <SectionHead>Weekly Capacity — Week {capWeek}, {CURRENT_YEAR}</SectionHead>
                <div style={{ marginBottom: 16 }}>
                  <label style={{ color: 'var(--dim)', fontSize: 11, fontWeight: 600, marginBottom: 6, display: 'block' }}>Select Week</label>
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    {Array.from({ length: 52 }, (_, i) => i + 1).map(w => {
                      const hasCap = capacities.find(c => c.week_number === w)
                      return (
                        <button key={w} onClick={() => setCapWeek(w)} style={{ width: 32, height: 28, borderRadius: 5, fontWeight: 700, fontSize: 11, cursor: 'pointer', background: w === capWeek ? 'rgba(0,212,184,0.2)' : hasCap ? 'rgba(59,130,246,0.1)' : 'var(--card2)', border: `1px solid ${w === capWeek ? 'var(--teal)' : hasCap ? 'rgba(59,130,246,0.3)' : 'var(--border)'}`, color: w === capWeek ? 'var(--teal)' : hasCap ? 'var(--blue)' : 'var(--muted)' }}>{w}</button>
                      )
                    })}
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                  {[
                    ['Total Capacity *', 'total_capacity', 'Total systems in fleet'],
                    ['Repair EU', 'repair_eu', 'Incl. calibration'],
                    ['Repair US', 'repair_us', ''],
                    ['R&D Systems', 'rd_systems', ''],
                    ['Spare EU', 'spare_eu', ''],
                    ['Spare US', 'spare_us', ''],
                  ].map(([label, field, hint]) => (
                    <div key={field as string}>
                      <div style={{ color: 'var(--dim)', fontSize: 11, fontWeight: 600, marginBottom: 4 }}>{label as string}{hint ? <span style={{ color: 'var(--muted)', fontWeight: 400 }}> — {hint as string}</span> : ''}</div>
                      <Input type="number" min="0" value={(editingCap as any)[field as string] ?? ''} onChange={e => setEditingCap(c => ({ ...c, [field as string]: parseFloat(e.target.value) || 0 }))} />
                    </div>
                  ))}
                </div>
                <div style={{ marginTop: 14 }}>
                  <div style={{ color: 'var(--dim)', fontSize: 11, fontWeight: 600, marginBottom: 4 }}>Notes</div>
                  <Input value={editingCap.notes || ''} onChange={e => setEditingCap(c => ({ ...c, notes: e.target.value }))} placeholder="Optional notes for this week" />
                </div>
                <Btn onClick={saveCap} disabled={savingCap} style={{ marginTop: 16 }}>{savingCap ? 'Saving…' : `Save Week ${capWeek}`}</Btn>
              </Card>
            )}

            {/* PMs TAB */}
            {tab === 'pms' && (
              <Card style={{ padding: '24px 28px', maxWidth: 500 }}>
                <SectionHead>Project Managers</SectionHead>
                <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
                  <Input value={newPmName} onChange={e => setNewPmName(e.target.value)} placeholder="Full name" style={{ flex: 1 }} />
                  <Btn onClick={async () => { if (!newPmName.trim()) return; await addPM(newPmName.trim(), 'NL'); setNewPmName(''); setPms(await getPMs()) }} disabled={!newPmName.trim()}>Add PM</Btn>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {pms.map(pm => (
                    <div key={pm.id} style={{ background: 'var(--card2)', borderRadius: 8, padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', border: '1px solid var(--border)' }}>
                      <span style={{ fontWeight: 600, fontSize: 13 }}>{pm.name}</span>
                      <button onClick={async () => { await removePM(pm.id); setPms(await getPMs()) }} style={{ background: 'none', border: 'none', color: 'var(--red)', cursor: 'pointer', fontSize: 13 }}>🗑</button>
                    </div>
                  ))}
                </div>
              </Card>
            )}

            {/* CZ 180-DAY TRACKER */}
            {tab === 'cz' && (
              <div>
                <div style={{ color: 'var(--dim)', fontSize: 13, marginBottom: 16 }}>CZ-region operators are limited to 180 days of work in Czechia per year. Track their cumulative working days here.</div>
                {czData.length === 0 ? (
                  <Card style={{ padding: '32px', textAlign: 'center' }}><div style={{ color: 'var(--dim)', fontSize: 14 }}>No CZ-region operators found.</div></Card>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
                    {czData.map((op: any) => {
                      const workingDays = (op.assignments || []).filter((a: any) => a.year === CURRENT_YEAR && a.status === 'assigned').length * 5
                      const pct = Math.min(100, Math.round(workingDays / 180 * 100))
                      const color = pct > 90 ? 'var(--red)' : pct > 70 ? 'var(--amber)' : 'var(--green)'
                      return (
                        <Card key={op.id} style={{ padding: '18px 20px' }} accent={color}>
                          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 12 }}>{op.name}</div>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
                            <div style={{ background: 'var(--card2)', borderRadius: 7, padding: '8px 10px', textAlign: 'center' }}>
                              <div style={{ color, fontSize: 22, fontWeight: 800, fontFamily: 'monospace' }}>{workingDays}</div>
                              <div style={{ color: 'var(--muted)', fontSize: 10 }}>days used</div>
                            </div>
                            <div style={{ background: 'var(--card2)', borderRadius: 7, padding: '8px 10px', textAlign: 'center' }}>
                              <div style={{ color: 'var(--text)', fontSize: 22, fontWeight: 800, fontFamily: 'monospace' }}>{180 - workingDays}</div>
                              <div style={{ color: 'var(--muted)', fontSize: 10 }}>days left</div>
                            </div>
                          </div>
                          <div style={{ background: 'var(--border)', borderRadius: 6, height: 10, overflow: 'hidden' }}>
                            <div style={{ background: color, width: `${pct}%`, height: '100%', borderRadius: 6, transition: 'width 0.5s' }} />
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 5, color: 'var(--muted)', fontSize: 10 }}>
                            <span>0</span><span style={{ color }}>{pct}%</span><span>180 days</span>
                          </div>
                          {pct > 90 && <div style={{ marginTop: 10, color: 'var(--red)', fontSize: 11, fontWeight: 600 }}>⚡ Near limit — {180 - workingDays} days remaining</div>}
                        </Card>
                      )
                    })}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </Shell>
  )
}

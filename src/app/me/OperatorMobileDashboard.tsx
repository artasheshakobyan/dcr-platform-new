'use client'
import { useEffect, useState, useRef } from 'react'
import { supabase, OperatorLeave } from '@/lib/supabase'
import { getISOWeek } from 'date-fns'

const CURRENT_WEEK = getISOWeek(new Date())
const CURRENT_YEAR = new Date().getFullYear()
const LEAVE_TYPES = [
  { value: 'pto', label: '🏖 Annual Leave / PTO', color: '#3B82F6' },
  { value: 'sick', label: '🤒 Sick / Medical', color: '#EF4444' },
  { value: 'training', label: '🎓 Training', color: '#8B5CF6' },
  { value: 'transit', label: '🚗 Transit', color: '#06B6D4' },
  { value: 'other', label: '📝 Other', color: '#6B7280' },
]

export default function OperatorMobileDashboard() {
  const [operators, setOperators] = useState<any[]>([])
  const [selectedOp, setSelectedOp] = useState<any>(null)
  const [assignment, setAssignment] = useState<any>(null)
  const [leaves, setLeaves] = useState<OperatorLeave[]>([])
  const [showSelector, setShowSelector] = useState(false)
  const [showLeaveForm, setShowLeaveForm] = useState(false)
  const [search, setSearch] = useState('')
  const [saved, setSaved] = useState(false)

  // Leave form state
  const [leaveType, setLeaveType] = useState<string>('pto')
  const [leaveStart, setLeaveStart] = useState('')
  const [leaveEnd, setLeaveEnd] = useState('')
  const [leaveNotes, setLeaveNotes] = useState('')
  const [savingLeave, setSavingLeave] = useState(false)

  useEffect(() => {
    supabase.from('operators').select('*').eq('active', true).order('name').then(({ data }) => setOperators(data || []))
    // Load from cookie
    const opId = getCookie('dcr-operator-id')
    if (opId) loadOperator(opId)
    else setShowSelector(true)
  }, [])

  const getCookie = (name: string) => {
    if (typeof document === 'undefined') return null
    const match = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'))
    return match ? decodeURIComponent(match[1]) : null
  }

  const setCookie = (name: string, value: string, days = 180) => {
    const expires = new Date(Date.now() + days * 864e5).toUTCString()
    document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires}; path=/`
  }

  const loadOperator = async (id: string) => {
    const { data: op } = await supabase.from('operators').select('*').eq('id', id).single()
    if (!op) { setShowSelector(true); return }
    setSelectedOp(op)

    const [{ data: ass }, { data: lv }] = await Promise.all([
      supabase.from('operator_assignments').select('*, project:projects(name,region,city_state)').eq('operator_id', id).eq('week_number', CURRENT_WEEK).eq('year', CURRENT_YEAR).single(),
      supabase.from('operator_leave').select('*').eq('operator_id', id).gte('end_date', new Date().toISOString().slice(0, 10)).order('start_date').limit(10),
    ])
    setAssignment(ass)
    setLeaves(lv || [])
  }

  const selectOperator = (op: any) => {
    setCookie('dcr-operator-id', op.id)
    setShowSelector(false)
    loadOperator(op.id)
  }

  const submitLeave = async () => {
    if (!selectedOp || !leaveStart || !leaveEnd) return
    setSavingLeave(true)
    await supabase.from('operator_leave').insert({
      operator_id: selectedOp.id,
      leave_type: leaveType,
      start_date: leaveStart,
      end_date: leaveEnd,
      notes: leaveNotes,
      submitted_at: new Date().toISOString(),
    })
    setSavingLeave(false)
    setShowLeaveForm(false)
    setLeaveType('pto'); setLeaveStart(''); setLeaveEnd(''); setLeaveNotes('')
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
    loadOperator(selectedOp.id)
  }

  const filteredOps = operators.filter(op => op.name.toLowerCase().includes(search.toLowerCase()) || (op.region || '').toLowerCase().includes(search.toLowerCase()))

  // Operator selector screen
  if (showSelector || !selectedOp) {
    return (
      <div style={{ minHeight: '100vh', background: '#080E1C', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-start', padding: '40px 20px' }}>
        <div style={{ width: 36, height: 36, borderRadius: 9, background: 'linear-gradient(135deg,#00D4B8,#3B82F6)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, color: '#000', fontWeight: 900, marginBottom: 24 }}>◈</div>
        <h1 style={{ fontSize: 24, fontWeight: 800, color: '#D1E4F5', marginBottom: 6, textAlign: 'center' }}>Who are you?</h1>
        <p style={{ color: '#8BA3BE', fontSize: 14, marginBottom: 28, textAlign: 'center' }}>Select your name once, we'll remember you for 6 months</p>
        <div style={{ width: '100%', maxWidth: 400 }}>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name or region…" autoFocus style={{ width: '100%', background: '#0F1824', border: '1px solid #1E2D42', borderRadius: 12, padding: '14px 16px', color: '#D1E4F5', fontSize: 16, outline: 'none', marginBottom: 12, boxSizing: 'border-box' }}
            onFocus={e => { e.target.style.borderColor = '#00D4B8' }} onBlur={e => { e.target.style.borderColor = '#1E2D42' }} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {filteredOps.map(op => (
              <button key={op.id} onClick={() => selectOperator(op)} style={{ width: '100%', background: '#0F1824', border: '1px solid #1E2D42', borderRadius: 12, padding: '16px 18px', color: '#D1E4F5', fontSize: 15, fontWeight: 600, cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', textAlign: 'left' }}>
                <span>{op.name}</span>
                <span style={{ background: '#162030', borderRadius: 6, padding: '3px 8px', fontSize: 11, color: '#8BA3BE' }}>{op.region}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    )
  }

  const leaveTypeInfo = LEAVE_TYPES.find(l => l.value === (assignment?.status || 'pto'))

  return (
    <div style={{ minHeight: '100vh', background: '#080E1C', padding: '0 0 40px' }}>
      {/* Header */}
      <div style={{ background: '#0F1824', borderBottom: '1px solid #1E2D42', padding: '18px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ color: '#00D4B8', fontSize: 13, fontWeight: 700, marginBottom: 2 }}>👤 {selectedOp.name}</div>
          <div style={{ color: '#4B6280', fontSize: 11 }}>{selectedOp.region} · Week {CURRENT_WEEK}</div>
        </div>
        <button onClick={() => { setCookie('dcr-operator-id', '', -1); setSelectedOp(null); setShowSelector(true) }} style={{ background: 'none', border: '1px solid #1E2D42', borderRadius: 8, padding: '6px 12px', color: '#8BA3BE', fontSize: 12, cursor: 'pointer' }}>Switch</button>
      </div>

      <div style={{ padding: '20px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>

        {/* Saved confirmation */}
        {saved && (
          <div style={{ background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.3)', borderRadius: 12, padding: '14px 16px', textAlign: 'center', color: '#10B981', fontWeight: 700 }}>
            ✅ Leave request submitted!
          </div>
        )}

        {/* This week assignment */}
        <div style={{ background: assignment ? 'rgba(0,212,184,0.08)' : '#0F1824', border: `1px solid ${assignment ? 'rgba(0,212,184,0.3)' : '#1E2D42'}`, borderRadius: 16, padding: '20px 18px' }}>
          <div style={{ color: '#4B6280', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>This week</div>
          {assignment ? (
            <>
              <div style={{ fontSize: 18, fontWeight: 800, color: '#D1E4F5', marginBottom: 4 }}>{(assignment as any).project?.name || 'Unknown Project'}</div>
              <div style={{ color: '#00D4B8', fontSize: 13, fontWeight: 600 }}>{(assignment as any).project?.region} {(assignment as any).project?.city_state ? `· ${(assignment as any).project?.city_state}` : ''}</div>
            </>
          ) : (
            <div style={{ color: '#8BA3BE', fontSize: 15 }}>No assignment for Week {CURRENT_WEEK}</div>
          )}
        </div>

        {/* CTA: Submit Leave */}
        <button onClick={() => setShowLeaveForm(true)} style={{ width: '100%', background: 'rgba(59,130,246,0.15)', border: '2px solid rgba(59,130,246,0.4)', borderRadius: 14, padding: '18px', color: '#3B82F6', fontWeight: 800, fontSize: 16, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
          📅 Submit Leave / Unavailability
        </button>

        {/* Upcoming leave */}
        {leaves.length > 0 && (
          <div style={{ background: '#0F1824', border: '1px solid #1E2D42', borderRadius: 16, overflow: 'hidden' }}>
            <div style={{ padding: '14px 18px', borderBottom: '1px solid #1E2D42', fontWeight: 700, fontSize: 13, color: '#D1E4F5' }}>Upcoming Leave</div>
            {leaves.map((lv, i) => {
              const lt = LEAVE_TYPES.find(l => l.value === lv.leave_type)
              return (
                <div key={i} style={{ padding: '12px 18px', borderBottom: '1px solid rgba(30,45,66,0.5)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 13, color: lt?.color || '#D1E4F5' }}>{lt?.label || lv.leave_type}</div>
                    <div style={{ color: '#8BA3BE', fontSize: 11, marginTop: 2 }}>{lv.start_date} → {lv.end_date}</div>
                    {lv.notes && <div style={{ color: '#4B6280', fontSize: 11 }}>{lv.notes}</div>}
                  </div>
                </div>
              )
            })}
          </div>
        )}

      </div>

      {/* Leave form modal */}
      {showLeaveForm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 999 }}>
          <div style={{ background: '#0F1824', borderRadius: '20px 20px 0 0', padding: '24px 20px 40px', width: '100%', maxWidth: 480, border: '1px solid #1E2D42', borderBottom: 'none' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <div style={{ fontSize: 18, fontWeight: 800, color: '#D1E4F5' }}>📅 Submit Leave</div>
              <button onClick={() => setShowLeaveForm(false)} style={{ background: 'none', border: 'none', color: '#8BA3BE', cursor: 'pointer', fontSize: 22 }}>×</button>
            </div>

            <div style={{ marginBottom: 16 }}>
              <div style={{ color: '#8BA3BE', fontSize: 12, fontWeight: 600, marginBottom: 8 }}>Type of leave</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {LEAVE_TYPES.map(lt => (
                  <button key={lt.value} onClick={() => setLeaveType(lt.value)} style={{ padding: '12px 16px', borderRadius: 10, textAlign: 'left', fontSize: 14, fontWeight: 600, cursor: 'pointer', border: `2px solid ${leaveType === lt.value ? lt.color : '#1E2D42'}`, background: leaveType === lt.value ? `${lt.color}15` : '#162030', color: leaveType === lt.value ? lt.color : '#8BA3BE' }}>
                    {lt.label}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
              <div>
                <div style={{ color: '#8BA3BE', fontSize: 12, fontWeight: 600, marginBottom: 6 }}>From</div>
                <input type="date" value={leaveStart} onChange={e => setLeaveStart(e.target.value)} style={{ width: '100%', background: '#162030', border: '1px solid #1E2D42', borderRadius: 10, padding: '12px', color: '#D1E4F5', fontSize: 14, outline: 'none', boxSizing: 'border-box' }} onFocus={e => { e.target.style.borderColor = '#3B82F6' }} onBlur={e => { e.target.style.borderColor = '#1E2D42' }} />
              </div>
              <div>
                <div style={{ color: '#8BA3BE', fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Until</div>
                <input type="date" value={leaveEnd} onChange={e => setLeaveEnd(e.target.value)} min={leaveStart} style={{ width: '100%', background: '#162030', border: '1px solid #1E2D42', borderRadius: 10, padding: '12px', color: '#D1E4F5', fontSize: 14, outline: 'none', boxSizing: 'border-box' }} onFocus={e => { e.target.style.borderColor = '#3B82F6' }} onBlur={e => { e.target.style.borderColor = '#1E2D42' }} />
              </div>
            </div>

            <div style={{ marginBottom: 20 }}>
              <div style={{ color: '#8BA3BE', fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Note (optional)</div>
              <textarea value={leaveNotes} onChange={e => setLeaveNotes(e.target.value)} placeholder="e.g. Doctor appointment, family emergency…" rows={2} style={{ width: '100%', background: '#162030', border: '1px solid #1E2D42', borderRadius: 10, padding: '12px', color: '#D1E4F5', fontSize: 14, outline: 'none', resize: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }} />
            </div>

            <button onClick={submitLeave} disabled={savingLeave || !leaveStart || !leaveEnd} style={{ width: '100%', background: 'linear-gradient(135deg,#3B82F6,#8B5CF6)', color: '#fff', border: 'none', borderRadius: 14, padding: '16px', fontWeight: 800, fontSize: 16, cursor: savingLeave || !leaveStart || !leaveEnd ? 'not-allowed' : 'pointer', opacity: savingLeave || !leaveStart || !leaveEnd ? 0.6 : 1 }}>
              {savingLeave ? 'Submitting…' : '✅ Submit Leave Request'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

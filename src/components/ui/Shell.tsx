'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState, useEffect, useRef } from 'react'
import { supabase, imagesToKm } from '@/lib/supabase'
import { getISOWeek } from 'date-fns'

const CURRENT_WEEK = getISOWeek(new Date())
const CURRENT_YEAR = new Date().getFullYear()

const NAV = [
  { href: '/',               icon: '◈',  label: 'Home'           },
  { href: '/plan',           icon: '📅', label: 'Plan'           },
  { href: '/command-center', icon: '🎯', label: 'Command Center' },
  { href: '/projects',       icon: '📁', label: 'Projects'       },
  { href: '/progress',       icon: '📈', label: 'Progress'       },
  { href: '/forecast',       icon: '🔮', label: 'Forecast'       },
  { href: '/alerts',         icon: '🔔', label: 'Alerts', badge: true },
  { href: '/fleet',          icon: '🏥', label: 'Fleet'          },
  { href: '/map',            icon: '🌍', label: 'Live Map'       },
  { href: '/operators',      icon: '👷', label: 'Operators'      },
  { href: '/settings',       icon: '⚙️', label: 'Settings'       },
]

function QuickLogModal({ onClose }: { onClose: () => void }) {
  const [projects, setProjects] = useState<any[]>([])
  const [selectedProject, setSelectedProject] = useState('')
  const [cumImages, setCumImages] = useState(0)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    supabase.from('projects').select('id,name,region,status,total_km').in('status', ['Committed', 'Pipeline']).order('name')
      .then(({ data }) => {
        setProjects(data || [])
        const last = typeof window !== 'undefined' ? localStorage.getItem('dcr-last-project') : null
        if (last && data?.find((p: any) => p.id === last)) setSelectedProject(last)
        else if (data?.[0]) setSelectedProject(data[0].id)
      })
    setTimeout(() => inputRef.current?.focus(), 100)
  }, [])

  useEffect(() => {
    if (!selectedProject) return
    supabase.from('project_progress').select('cumulative_images').eq('project_id', selectedProject).eq('year', CURRENT_YEAR).order('week_number', { ascending: false }).limit(1)
      .then(({ data }) => { if (data?.[0]) setCumImages(data[0].cumulative_images); else setCumImages(0) })
  }, [selectedProject])

  const project = projects.find((p: any) => p.id === selectedProject)
  const km = imagesToKm(cumImages)
  const pct = project?.total_km > 0 ? Math.round(km / project.total_km * 100) : 0

  const save = async () => {
    if (!selectedProject || cumImages <= 0) return
    setSaving(true)
    await supabase.from('project_progress').upsert({ project_id: selectedProject, week_number: CURRENT_WEEK, year: CURRENT_YEAR, cumulative_images: cumImages, logged_at: new Date().toISOString() }, { onConflict: 'project_id,week_number,year' })
    if (typeof window !== 'undefined') localStorage.setItem('dcr-last-project', selectedProject)
    setSaving(false); setSaved(true)
    setTimeout(() => onClose(), 1000)
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 16, padding: '28px 32px', width: 400, boxShadow: '0 24px 64px rgba(0,0,0,0.6)' }}>
        {saved ? (
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>✅</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--green)' }}>Progress saved!</div>
            <div style={{ color: 'var(--dim)', fontSize: 13, marginTop: 6 }}>{km.toLocaleString()} km · {pct}% complete</div>
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <div style={{ fontSize: 17, fontWeight: 800 }}>⚡ Quick Log Progress</div>
              <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 22, lineHeight: 1 }}>×</button>
            </div>
            <div style={{ marginBottom: 14 }}>
              <div style={{ color: 'var(--dim)', fontSize: 11, fontWeight: 600, marginBottom: 5 }}>Project</div>
              <select value={selectedProject} onChange={e => setSelectedProject(e.target.value)} style={{ width: '100%', background: 'var(--card2)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px', color: 'var(--text)', fontSize: 13, outline: 'none' }}>
                {projects.map((p: any) => <option key={p.id} value={p.id}>{p.name} ({p.region})</option>)}
              </select>
            </div>
            <div style={{ marginBottom: 16 }}>
              <div style={{ color: 'var(--dim)', fontSize: 11, fontWeight: 600, marginBottom: 5 }}>Cumulative Images Synced <span style={{ color: 'var(--muted)', fontWeight: 400 }}>(running total)</span></div>
              <input ref={inputRef} type="number" min="0" value={cumImages || ''} onChange={e => setCumImages(parseInt(e.target.value) || 0)} placeholder="e.g. 48200"
                style={{ width: '100%', background: 'var(--card2)', border: '1px solid var(--border)', borderRadius: 8, padding: '12px 14px', color: 'var(--text)', fontSize: 22, fontFamily: 'monospace', fontWeight: 800, outline: 'none' }}
                onFocus={e => { e.target.style.borderColor = 'var(--teal)' }} onBlur={e => { e.target.style.borderColor = 'var(--border)' }} />
            </div>
            {cumImages > 0 && (
              <div style={{ background: 'var(--card2)', borderRadius: 10, padding: '14px 16px', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 16 }}>
                {[['km driven', km.toLocaleString(), 'var(--teal)'], ['km left', project?.total_km > 0 ? Math.max(0, project.total_km - km).toLocaleString() : '—', 'var(--amber)'], ['complete', `${pct}%`, pct >= 100 ? 'var(--green)' : pct >= 75 ? 'var(--teal)' : 'var(--amber)']].map(([label, value, color]) => (
                  <div key={label as string} style={{ textAlign: 'center' }}>
                    <div style={{ color: color as string, fontSize: 20, fontWeight: 800, fontFamily: 'monospace' }}>{value}</div>
                    <div style={{ color: 'var(--muted)', fontSize: 10 }}>{label}</div>
                  </div>
                ))}
              </div>
            )}
            <button onClick={save} disabled={saving || !selectedProject || cumImages <= 0} style={{ width: '100%', background: 'linear-gradient(135deg,var(--teal),var(--blue))', color: '#000', border: 'none', borderRadius: 10, padding: '13px', fontWeight: 800, fontSize: 15, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1 }}>
              {saving ? 'Saving…' : '💾 Save Progress'}
            </button>
            <div style={{ color: 'var(--muted)', fontSize: 11, textAlign: 'center', marginTop: 8 }}>Ctrl+L to open · Esc to close</div>
          </>
        )}
      </div>
    </div>
  )
}

export default function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname()
  const [collapsed, setCollapsed] = useState(false)
  const [quickLog, setQuickLog] = useState(false)
  const [alertCount, setAlertCount] = useState(0)

  useEffect(() => {
    async function loadAlerts() {
      try {
        const [{ data: projects }, { data: capacities }, { data: assignments }, { data: progress }] = await Promise.all([
          supabase.from('projects').select('id,status,total_km,pm,start_date,end_date,desired_systems_per_week').in('status', ['Committed', 'Pipeline']),
          supabase.from('weekly_capacity').select('*').eq('year', CURRENT_YEAR),
          supabase.from('operator_assignments').select('*').eq('year', CURRENT_YEAR),
          supabase.from('project_progress').select('project_id,week_number').eq('year', CURRENT_YEAR),
        ])
        let count = 0
        if (capacities && projects && assignments) {
          const { computeWeeklySummary } = await import('@/lib/capacity')
          capacities.forEach((cap: any) => {
            const s = computeWeeklySummary(cap.week_number, CURRENT_YEAR, cap, projects as any, assignments as any)
            if (s.is_over_capacity) count++
          })
        }
        if (projects && progress) {
          projects.filter((p: any) => p.status === 'Committed').forEach((p: any) => {
            const entries = progress.filter((pr: any) => pr.project_id === p.id)
            if (entries.length === 0) { count++; return }
            const latest = entries.sort((a: any, b: any) => b.week_number - a.week_number)[0]
            if (CURRENT_WEEK - latest.week_number > 2) count++
          })
        }
        setAlertCount(count)
      } catch {}
    }
    loadAlerts()
  }, [])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'l') { e.preventDefault(); setQuickLog(true) }
      if (e.key === 'Escape') setQuickLog(false)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  if (path.startsWith('/me') || path.startsWith('/share')) return <>{children}</>

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <aside style={{ width: collapsed ? 54 : 218, background: 'var(--card)', borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', position: 'fixed', top: 0, left: 0, bottom: 0, zIndex: 50, transition: 'width 0.2s cubic-bezier(0.4,0,0.2,1)', overflow: 'hidden' }}>
        <div style={{ padding: collapsed ? '16px 0' : '16px 14px 13px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: collapsed ? 'center' : 'space-between', flexShrink: 0, minHeight: 58 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 30, height: 30, borderRadius: 7, flexShrink: 0, background: 'linear-gradient(135deg,#00D4B8,#3B82F6)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 900, color: '#000' }}>◈</div>
            {!collapsed && <div><div style={{ fontWeight: 800, fontSize: 13, letterSpacing: '-0.02em', lineHeight: 1.2 }}>DCR Platform</div><div style={{ color: 'var(--muted)', fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Cyclomedia Global</div></div>}
          </div>
          {!collapsed && <button onClick={() => setCollapsed(true)} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 16, lineHeight: 1, padding: '2px 4px', borderRadius: 4, flexShrink: 0 }}>‹</button>}
          {collapsed && <button onClick={() => setCollapsed(false)} style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 54, background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 13 }}>›</button>}
        </div>
        <nav style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: collapsed ? '6px 0' : '6px 8px', scrollbarWidth: 'none' }}>
          {NAV.map(({ href, icon, label, badge }) => {
            const active = path === href || (href !== '/' && path.startsWith(href))
            return (
              <Link key={href} href={href} style={{ textDecoration: 'none', display: 'block' }}>
                <div title={collapsed ? label : undefined} style={{ display: 'flex', alignItems: 'center', gap: collapsed ? 0 : 8, padding: collapsed ? '9px 0' : '7px 8px', justifyContent: collapsed ? 'center' : 'flex-start', borderRadius: collapsed ? 0 : 6, marginBottom: 1, background: active ? 'rgba(0,212,184,0.11)' : 'transparent', borderLeft: collapsed && active ? '2px solid var(--teal)' : '2px solid transparent', color: active ? 'var(--teal)' : 'var(--dim)', fontWeight: active ? 700 : 400, fontSize: 12.5, cursor: 'pointer', transition: 'all 0.1s', whiteSpace: 'nowrap', position: 'relative' }}
                  onMouseEnter={e => { if (!active) { const el = e.currentTarget as HTMLElement; el.style.background = 'rgba(255,255,255,0.04)'; el.style.color = 'var(--text)' } }}
                  onMouseLeave={e => { if (!active) { const el = e.currentTarget as HTMLElement; el.style.background = 'transparent'; el.style.color = 'var(--dim)' } }}>
                  <span style={{ fontSize: 13, flexShrink: 0, width: collapsed ? 'auto' : 18, textAlign: 'center', position: 'relative' }}>
                    {icon}
                    {badge && alertCount > 0 && collapsed && <span style={{ position: 'absolute', top: -4, right: -4, background: 'var(--red)', color: '#fff', borderRadius: '50%', width: 14, height: 14, fontSize: 8, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid var(--card)' }}>{alertCount > 9 ? '9+' : alertCount}</span>}
                  </span>
                  {!collapsed && <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', flex: 1 }}>{label}</span>}
                  {!collapsed && badge && alertCount > 0 && <span style={{ background: 'var(--red)', color: '#fff', borderRadius: 8, padding: '1px 5px', fontSize: 9, fontWeight: 800, flexShrink: 0 }}>{alertCount}</span>}
                  {!collapsed && active && !badge && <div style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--teal)', flexShrink: 0 }} />}
                </div>
              </Link>
            )
          })}
          <div style={{ height: 1, background: 'var(--border)', margin: collapsed ? '5px 10px' : '8px 4px' }} />
          <Link href="/me" style={{ textDecoration: 'none', display: 'block' }}>
            <div title={collapsed ? 'My View (Operator)' : undefined} style={{ display: 'flex', alignItems: 'center', gap: collapsed ? 0 : 8, padding: collapsed ? '9px 0' : '7px 8px', justifyContent: collapsed ? 'center' : 'flex-start', borderRadius: collapsed ? 0 : 6, background: path === '/me' ? 'rgba(139,92,246,0.11)' : 'transparent', color: path === '/me' ? 'var(--violet)' : 'var(--muted)', fontWeight: path === '/me' ? 700 : 400, fontSize: 12.5, cursor: 'pointer' }}>
              <span style={{ fontSize: 13, flexShrink: 0, width: collapsed ? 'auto' : 18, textAlign: 'center' }}>👤</span>
              {!collapsed && <span>My View</span>}
            </div>
          </Link>
        </nav>
        {!collapsed && <div style={{ padding: '9px 14px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}><span style={{ color: 'var(--muted)', fontSize: 10 }}>Cyclomedia</span><span style={{ background: 'rgba(0,212,184,0.13)', color: 'var(--teal)', border: '1px solid rgba(0,212,184,0.25)', borderRadius: 4, padding: '1px 7px', fontSize: 9, fontWeight: 700 }}>v2.0</span></div>}
      </aside>
      <main style={{ marginLeft: collapsed ? 54 : 218, flex: 1, minHeight: '100vh', transition: 'margin-left 0.2s cubic-bezier(0.4,0,0.2,1)', paddingBottom: 80 }}>
        {children}
      </main>
      <button onClick={() => setQuickLog(true)} title="Quick Log Progress (Ctrl+L)" style={{ position: 'fixed', bottom: 24, right: 24, width: 52, height: 52, borderRadius: '50%', background: 'linear-gradient(135deg,var(--teal),var(--blue))', border: 'none', color: '#000', fontSize: 22, cursor: 'pointer', boxShadow: '0 6px 24px rgba(0,212,184,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>📊</button>
      {quickLog && <QuickLogModal onClose={() => setQuickLog(false)} />}
    </div>
  )
}

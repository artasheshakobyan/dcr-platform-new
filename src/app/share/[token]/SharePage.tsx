'use client'
import { useEffect, useState } from 'react'
import { supabase, imagesToKm } from '@/lib/supabase'
import { getISOWeek, addWeeks, startOfISOWeek, format } from 'date-fns'

const CURRENT_WEEK = getISOWeek(new Date())
const CURRENT_YEAR = new Date().getFullYear()

export default function SharePage({ token }: { token: string }) {
  const [project, setProject] = useState<any>(null)
  const [progress, setProgress] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    async function load() {
      // Find project by share token
      const { data: tokenData } = await supabase.from('project_share_tokens').select('*, project:projects(*)').eq('token', token).single()
      if (!tokenData) { setNotFound(true); setLoading(false); return }
      // Increment view count
      await supabase.from('project_share_tokens').update({ view_count: (tokenData.view_count || 0) + 1 }).eq('token', token)
      setProject(tokenData.project)
      const { data: pr } = await supabase.from('project_progress').select('*').eq('project_id', tokenData.project.id).eq('year', CURRENT_YEAR).order('week_number')
      setProgress(pr || [])
      setLoading(false)
    }
    load()
  }, [token])

  if (loading) return (
    <div style={{ minHeight: '100vh', background: '#080E1C', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ color: '#8BA3BE', fontSize: 14 }}>Loading…</div>
    </div>
  )

  if (notFound) return (
    <div style={{ minHeight: '100vh', background: '#080E1C', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12 }}>
      <div style={{ fontSize: 36 }}>🔗</div>
      <div style={{ color: '#D1E4F5', fontSize: 18, fontWeight: 700 }}>Link not found</div>
      <div style={{ color: '#8BA3BE', fontSize: 13 }}>This share link may have expired or been removed.</div>
    </div>
  )

  const latest = [...progress].sort((a, b) => b.week_number - a.week_number)[0]
  const latestImages = latest?.cumulative_images ?? 0
  const km = imagesToKm(latestImages)
  const pct = project.total_km > 0 ? Math.round(km / project.total_km * 100) : 0
  const remaining = Math.max(0, project.total_km - km)

  // Estimate completion
  const recentWeeks = [...progress].sort((a, b) => b.week_number - a.week_number).slice(0, 4)
  let estCompletion = null
  if (recentWeeks.length >= 2) {
    const weeklyKms = recentWeeks.slice(0, -1).map((w, i) => {
      const prev = recentWeeks[i + 1]
      return imagesToKm(w.cumulative_images - prev.cumulative_images)
    })
    const avgKmPerWeek = weeklyKms.reduce((a, b) => a + b, 0) / weeklyKms.length
    if (avgKmPerWeek > 0) {
      const weeksLeft = Math.ceil(remaining / avgKmPerWeek)
      estCompletion = format(addWeeks(startOfISOWeek(new Date()), weeksLeft), 'MMMM d, yyyy')
    }
  }

  const statusColor = pct >= 100 ? '#10B981' : pct >= 75 ? '#00D4B8' : pct >= 40 ? '#3B82F6' : '#F59E0B'

  return (
    <div style={{ minHeight: '100vh', background: '#080E1C', padding: '0 0 60px' }}>
      {/* Header */}
      <div style={{ background: '#0F1824', borderBottom: '1px solid #1E2D42', padding: '20px 28px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: 'linear-gradient(135deg,#00D4B8,#3B82F6)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 900, color: '#000' }}>◈</div>
          <div>
            <div style={{ fontWeight: 800, fontSize: 14, color: '#D1E4F5' }}>Cyclomedia</div>
            <div style={{ color: '#4B6280', fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Project Progress Report</div>
          </div>
        </div>
        <div style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)', borderRadius: 20, padding: '4px 12px', fontSize: 11, fontWeight: 700, color: '#10B981' }}>● Live</div>
      </div>

      <div style={{ padding: '32px 28px', maxWidth: 720, margin: '0 auto' }}>
        {/* Project name */}
        <h1 style={{ fontSize: 28, fontWeight: 800, color: '#D1E4F5', marginBottom: 6, letterSpacing: '-0.02em' }}>{project.name}</h1>
        <div style={{ color: '#8BA3BE', fontSize: 14, marginBottom: 32 }}>
          {project.region} · {project.city_state || 'No location'} · Updated Week {latest?.week_number ?? '—'}
        </div>

        {/* Big progress */}
        <div style={{ background: '#0F1824', border: `1px solid ${statusColor}33`, borderTop: `4px solid ${statusColor}`, borderRadius: 16, padding: '28px 28px', marginBottom: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <div style={{ color: '#8BA3BE', fontSize: 13 }}>Overall progress</div>
            <div style={{ color: statusColor, fontSize: 48, fontWeight: 800, fontFamily: 'monospace', lineHeight: 1 }}>{pct}%</div>
          </div>
          <div style={{ background: '#1E2D42', borderRadius: 12, height: 20, overflow: 'hidden', marginBottom: 12 }}>
            <div style={{ background: pct >= 100 ? 'linear-gradient(90deg,#10B981,#00D4B8)' : `linear-gradient(90deg,${statusColor},#00D4B8)`, width: `${Math.min(100, pct)}%`, height: '100%', borderRadius: 12, transition: 'width 1s ease', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', paddingRight: 10 }}>
              {pct > 15 && <span style={{ color: '#000', fontSize: 11, fontWeight: 800 }}>{km.toLocaleString()} km</span>}
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', color: '#4B6280', fontSize: 11 }}>
            <span>0 km</span><span>{project.total_km?.toLocaleString() ?? '—'} km target</span>
          </div>
        </div>

        {/* Key numbers */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 20 }}>
          {[
            { label: 'KM Driven', value: km.toLocaleString(), unit: 'km', color: '#00D4B8' },
            { label: 'KM Remaining', value: remaining.toLocaleString(), unit: 'km', color: '#F59E0B' },
            { label: 'Estimated Completion', value: estCompletion || (pct >= 100 ? '✅ Done' : 'Pending data'), unit: '', color: '#8B5CF6' },
          ].map(({ label, value, unit, color }) => (
            <div key={label} style={{ background: '#0F1824', border: '1px solid #1E2D42', borderRadius: 12, padding: '18px 16px', textAlign: 'center' }}>
              <div style={{ color: '#4B6280', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>{label}</div>
              <div style={{ color, fontSize: 20, fontWeight: 800, fontFamily: 'monospace', lineHeight: 1 }}>{value}</div>
              {unit && <div style={{ color: '#4B6280', fontSize: 11, marginTop: 4 }}>{unit}</div>}
            </div>
          ))}
        </div>

        {/* Weekly progress log */}
        {progress.length > 0 && (
          <div style={{ background: '#0F1824', border: '1px solid #1E2D42', borderRadius: 16, overflow: 'hidden' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #1E2D42', fontWeight: 700, fontSize: 14, color: '#D1E4F5' }}>Weekly Progress</div>
            {[...progress].reverse().map((entry, i) => {
              const prevEntry = progress[progress.indexOf(entry) - 1]
              const weekKm = prevEntry ? imagesToKm(entry.cumulative_images - prevEntry.cumulative_images) : imagesToKm(entry.cumulative_images)
              const entryPct = project.total_km > 0 ? Math.round(imagesToKm(entry.cumulative_images) / project.total_km * 100) : 0
              return (
                <div key={i} style={{ padding: '12px 20px', borderBottom: '1px solid rgba(30,45,66,0.5)', display: 'grid', gridTemplateColumns: '60px 1fr 100px 80px', alignItems: 'center', gap: 12 }}>
                  <div style={{ fontFamily: 'monospace', fontWeight: 700, color: '#00D4B8', fontSize: 13 }}>W{entry.week_number}</div>
                  <div style={{ background: '#1E2D42', borderRadius: 4, height: 8, overflow: 'hidden' }}>
                    <div style={{ background: statusColor, width: `${Math.min(100, entryPct)}%`, height: '100%', borderRadius: 4 }} />
                  </div>
                  <div style={{ fontFamily: 'monospace', fontSize: 12, color: '#D1E4F5' }}>{imagesToKm(entry.cumulative_images).toLocaleString()} km</div>
                  <div style={{ fontFamily: 'monospace', fontSize: 11, color: '#4B6280' }}>{entryPct}%</div>
                </div>
              )
            })}
          </div>
        )}

        <div style={{ marginTop: 28, textAlign: 'center', color: '#4B6280', fontSize: 11 }}>
          Powered by Cyclomedia DCR Platform · Data updated in real-time
        </div>
      </div>
    </div>
  )
}

import { ReactNode, CSSProperties } from 'react'

// ── Pill badge ─────────────────────────────────────────────────────────────
export function Pill({ children, color = 'var(--teal)', small }: { children: ReactNode; color?: string; small?: boolean }) {
  return (
    <span style={{
      background: color + '22', color, border: `1px solid ${color}44`,
      borderRadius: 4, padding: small ? '1px 6px' : '2px 9px',
      fontSize: small ? 10 : 11, fontWeight: 700, whiteSpace: 'nowrap', letterSpacing: '0.04em',
      display: 'inline-block',
    }}>{children}</span>
  )
}

// ── Card ──────────────────────────────────────────────────────────────────
export function Card({ children, style, accent }: { children: ReactNode; style?: CSSProperties; accent?: string }) {
  return (
    <div style={{
      background: 'var(--card)', borderRadius: 12,
      border: `1px solid ${accent ? accent + '44' : 'var(--border)'}`,
      ...style,
    }}>{children}</div>
  )
}

// ── Section heading ───────────────────────────────────────────────────────
export function SectionHead({ children, accent = 'var(--teal)' }: { children: ReactNode; accent?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
      <div style={{ width: 3, height: 18, background: accent, borderRadius: 2 }} />
      <span style={{ color: 'var(--text)', fontSize: 13, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase' }}>{children}</span>
    </div>
  )
}

// ── KPI tile ──────────────────────────────────────────────────────────────
export function KpiTile({ label, value, sub, color = 'var(--teal)', alert }: { label: string; value: string | number; sub?: string; color?: string; alert?: boolean }) {
  return (
    <Card style={{ padding: '14px 16px', position: 'relative', overflow: 'hidden' }} accent={color}>
      {alert && <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: 'var(--red)' }} />}
      <div style={{ color: 'var(--muted)', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.09em', marginBottom: 4 }}>{label}</div>
      <div style={{ color, fontSize: 28, fontWeight: 800, fontFamily: 'JetBrains Mono, monospace', lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ color: 'var(--muted)', fontSize: 10, marginTop: 3 }}>{sub}</div>}
    </Card>
  )
}

// ── Input ─────────────────────────────────────────────────────────────────
import React from 'react';
export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(function Input(props, ref) {
  return (
    <input ref={ref} {...props} style={{
      background: 'var(--card2)', border: '1px solid var(--border)', borderRadius: 6,
      padding: '8px 10px', color: 'var(--text)', fontSize: 13, outline: 'none', width: '100%',
      transition: 'border-color 0.15s',
      ...props.style,
    }} onFocus={e => { e.target.style.borderColor = 'var(--teal)' }}
       onBlur={e => { e.target.style.borderColor = 'var(--border)' }} />
  );
});

// ── Select ────────────────────────────────────────────────────────────────
export function Select({ children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select {...props} style={{
      background: 'var(--card2)', border: '1px solid var(--border)', borderRadius: 6,
      padding: '8px 10px', color: 'var(--text)', fontSize: 13, outline: 'none', width: '100%',
      ...props.style,
    }}>{children}</select>
  )
}

// ── Textarea ──────────────────────────────────────────────────────────────
export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea {...props} style={{
      background: 'var(--card2)', border: '1px solid var(--border)', borderRadius: 6,
      padding: '8px 10px', color: 'var(--text)', fontSize: 13, outline: 'none', width: '100%',
      resize: 'vertical', fontFamily: 'inherit',
      ...props.style,
    }} />
  )
}

// ── Button ────────────────────────────────────────────────────────────────
export function Btn({ children, variant = 'primary', onClick, disabled, style }: {
  children: ReactNode; variant?: 'primary'|'secondary'|'danger'; onClick?: () => void; disabled?: boolean; style?: CSSProperties
}) {
  const styles: Record<string, CSSProperties> = {
    primary:   { background: 'linear-gradient(135deg,var(--teal),var(--blue))', color: '#000', border: 'none' },
    secondary: { background: 'var(--card2)', color: 'var(--text)', border: '1px solid var(--border)' },
    danger:    { background: 'rgba(239,68,68,0.15)', color: 'var(--red)', border: '1px solid rgba(239,68,68,0.4)' },
  }
  return (
    <button onClick={onClick} disabled={disabled} style={{
      ...styles[variant], borderRadius: 7, padding: '8px 18px', fontWeight: 700,
      fontSize: 13, cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1,
      transition: 'opacity 0.15s', ...style,
    }}>{children}</button>
  )
}

// ── Page header ──────────────────────────────────────────────────────────
export function PageHeader({ title, sub, actions }: { title: string; sub?: string; actions?: ReactNode }) {
  return (
    <div style={{
      borderBottom: '1px solid var(--border)', padding: '20px 28px',
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      background: 'var(--card)', position: 'sticky', top: 0, zIndex: 40,
    }}>
      <div>
        <h1 style={{ fontSize: 18, fontWeight: 800, letterSpacing: '-0.02em' }}>{title}</h1>
        {sub && <p style={{ color: 'var(--dim)', fontSize: 12, marginTop: 2 }}>{sub}</p>}
      </div>
      {actions && <div style={{ display: 'flex', gap: 10 }}>{actions}</div>}
    </div>
  )
}

// ── Chart tooltip ─────────────────────────────────────────────────────────
export function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ color: string; name: string; value: number }>; label?: string }) {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background: '#1a2840', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 14px', fontSize: 12 }}>
      <div style={{ color: 'var(--dim)', marginBottom: 6, fontWeight: 600 }}>{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ color: p.color, display: 'flex', gap: 10, justifyContent: 'space-between' }}>
          <span>{p.name}</span><b>{p.value}</b>
        </div>
      ))}
    </div>
  )
}

// ── Status color helpers ──────────────────────────────────────────────────
export const REGION_C: Record<string, string> = {
  NL:'#3B82F6',BE:'#8B5CF6',DE:'#F59E0B',EU:'#10B981',US:'#EF4444',
  LU:'#06B6D4',CZ:'#EC4899',GR:'#14B8A6',CH:'#F97316'
}
export const STATUS_C: Record<string, string> = {
  Committed:'var(--teal)',Pipeline:'var(--amber)',Finished:'#374151',Other:'var(--muted)'
}

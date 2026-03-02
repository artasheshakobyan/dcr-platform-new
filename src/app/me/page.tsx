import { Suspense } from 'react'
import OperatorMobileDashboard from './OperatorMobileDashboard'
export default function MePage() {
  return <Suspense fallback={<div style={{ padding: 40, color: '#8BA3BE' }}>Loading…</div>}><OperatorMobileDashboard /></Suspense>
}

import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'DCR Planning Platform',
  description: 'Global DCR System & Operator Planning',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}

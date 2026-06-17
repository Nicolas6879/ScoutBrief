import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'ScoutBrief — Hedera Policy Agent',
  description:
    'Policy-governed AI agent that delivers VC intelligence briefs via x402+HBAR on Hedera. Built for Hedera AI Bounty Week 5.',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}): React.ReactElement {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}

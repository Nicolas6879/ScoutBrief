'use client'

import { motion } from 'framer-motion'
import { Activity, Compass, History, Sparkles } from 'lucide-react'
import { BudgetGauge } from './BudgetGauge'
import { TechnicalToggle } from './TechnicalToggle'

export type TabKey = 'live' | 'history' | 'audit'

const TABS: { key: TabKey; label: string; icon: React.ComponentType<{ size?: number; className?: string }> }[] = [
  { key: 'live', label: 'Live', icon: Activity },
  { key: 'history', label: 'History', icon: History },
  { key: 'audit', label: 'Audit', icon: Compass },
]

export function TopBar({
  activeTab,
  onTabChange,
}: {
  activeTab: TabKey
  onTabChange: (tab: TabKey) => void
}): React.ReactElement {
  return (
    <header className="sticky top-0 z-30 glass-strong border-b border-white/[0.08]">
      <div className="mx-auto flex h-16 max-w-[1400px] items-center gap-6 px-6">
        {/* Logo */}
        <div className="flex items-center gap-2">
          <div className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-violet-500 via-fuchsia-500 to-cyan-400 shadow-lg shadow-violet-500/30">
            <Sparkles size={18} className="text-white" strokeWidth={2.5} />
          </div>
          <div className="leading-tight">
            <div className="text-base font-semibold tracking-tight">ScoutBrief</div>
            <div className="text-[10px] uppercase tracking-[0.18em] text-white/40">
              Account intelligence
            </div>
          </div>
        </div>

        {/* Tabs */}
        <nav className="flex items-center gap-1 rounded-xl bg-white/[0.04] p-1 border border-white/[0.06]">
          {TABS.map((t) => {
            const active = t.key === activeTab
            const Icon = t.icon
            return (
              <button
                key={t.key}
                onClick={() => onTabChange(t.key)}
                className="relative flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-sm font-medium transition-colors"
              >
                {active && (
                  <motion.span
                    layoutId="tab-pill"
                    className="absolute inset-0 rounded-lg bg-white/[0.10] border border-white/[0.12] shadow-sm"
                    transition={{ type: 'spring', bounce: 0.2, duration: 0.55 }}
                  />
                )}
                <Icon
                  size={14}
                  className={`relative z-10 ${active ? 'text-white' : 'text-white/50'}`}
                />
                <span className={`relative z-10 ${active ? 'text-white' : 'text-white/55'}`}>
                  {t.label}
                </span>
              </button>
            )
          })}
        </nav>

        <div className="ml-auto flex items-center gap-4">
          <BudgetGauge />
          <TechnicalToggle />
        </div>
      </div>
    </header>
  )
}

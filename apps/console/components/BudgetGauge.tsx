'use client'

import { motion } from 'framer-motion'
import { Wallet } from 'lucide-react'
import { useBudget } from '@/lib/hooks'

function hbar(tb: number): string {
  return (tb / 100_000_000).toFixed(2)
}

export function BudgetGauge(): React.ReactElement {
  const { budget } = useBudget()
  const used = budget?.daily_used_tinybars ?? 0
  const limit = budget?.daily_limit_tinybars ?? 0
  const pct = limit > 0 ? Math.min(used / limit, 1) : 0
  const tone =
    pct >= 0.9
      ? 'from-rose-500 to-rose-300'
      : pct >= 0.7
        ? 'from-amber-500 to-amber-300'
        : 'from-emerald-500 to-teal-300'

  return (
    <div className="hidden md:flex items-center gap-3 rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-1.5">
      <Wallet size={14} className="text-white/50" />
      <div className="flex flex-col">
        <div className="text-[10px] uppercase tracking-wider text-white/40">
          Budget today
        </div>
        <div className="flex items-baseline gap-1">
          <span className="font-mono text-sm font-semibold text-white">
            {hbar(used)}
          </span>
          <span className="text-[10px] text-white/40">/ {hbar(limit)} HBAR</span>
        </div>
      </div>
      <div className="relative h-1.5 w-24 overflow-hidden rounded-full bg-white/[0.06]">
        <motion.div
          className={`absolute inset-y-0 left-0 rounded-full bg-gradient-to-r ${tone}`}
          initial={{ width: 0 }}
          animate={{ width: `${Math.max(pct * 100, 4)}%` }}
          transition={{ type: 'spring', stiffness: 120, damping: 20 }}
        />
      </div>
    </div>
  )
}

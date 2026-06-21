'use client'

import { motion } from 'framer-motion'
import { CheckCircle2, Loader2, ShieldOff, Undo2 } from 'lucide-react'
import type { PerAccountRun, ScoutBatchState } from '@/lib/scoutRun'

interface Props {
  batch: ScoutBatchState
  onSelect: (accountId: string) => void
}

function statusFor(run?: PerAccountRun): {
  icon: React.ReactNode
  pill: string
} {
  if (!run)
    return {
      icon: <span className="h-1.5 w-1.5 rounded-full bg-white/20" />,
      pill: 'border-white/[0.08] bg-white/[0.02] text-white/50',
    }
  if (run.outcome === 'running')
    return {
      icon: <Loader2 size={12} className="animate-spin text-violet-300" />,
      pill: 'border-violet-400/40 bg-violet-500/15 text-violet-100',
    }
  if (run.outcome === 'ok')
    return {
      icon: <CheckCircle2 size={12} className="text-emerald-300" />,
      pill: 'border-emerald-400/35 bg-emerald-500/10 text-emerald-100',
    }
  if (run.outcome === 'refunded')
    return {
      icon: <Undo2 size={12} className="text-amber-300" />,
      pill: 'border-amber-400/35 bg-amber-500/10 text-amber-100',
    }
  return {
    icon: <ShieldOff size={12} className="text-rose-300" />,
    pill: 'border-rose-400/40 bg-rose-500/10 text-rose-100',
  }
}

export function QueueStrip({ batch, onSelect }: Props): React.ReactElement | null {
  if (batch.accounts.length === 0) return null
  return (
    <div className="flex flex-wrap items-center gap-2">
      {batch.accounts.map((a) => {
        const run = batch.perAccount[a.id]
        const status = statusFor(run)
        const current = batch.current === a.id
        return (
          <motion.button
            key={a.id}
            onClick={() => onSelect(a.id)}
            whileTap={{ scale: 0.96 }}
            className={`relative flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium transition-all ${status.pill} ${
              current ? 'ring-2 ring-white/20 shadow-md' : ''
            }`}
          >
            {status.icon}
            <span className="truncate max-w-[160px]">{a.name}</span>
          </motion.button>
        )
      })}
    </div>
  )
}

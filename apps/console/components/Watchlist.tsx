'use client'

import { AnimatePresence, motion } from 'framer-motion'
import { Building2, CheckCircle2, RefreshCw, ShieldOff, Trash2 } from 'lucide-react'
import type { Account } from '@/lib/types'

interface Props {
  accounts: Account[]
  selectedIds: Set<string>
  onToggleSelected: (id: string) => void
  onRemove: (id: string) => void
}

function relTime(ts: number | null): string | null {
  if (!ts) return null
  const diff = Date.now() - ts
  const m = Math.floor(diff / 60_000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  return `${d}d ago`
}

export function Watchlist({
  accounts,
  selectedIds,
  onToggleSelected,
  onRemove,
}: Props): React.ReactElement {
  if (accounts.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-white/[0.08] bg-white/[0.02] p-6 text-center">
        <Building2 size={28} className="mx-auto text-white/25" />
        <p className="mt-3 text-sm text-white/55">No accounts yet</p>
        <p className="mt-1 text-xs text-white/35">
          Add a company name below to start tracking it.
        </p>
      </div>
    )
  }
  return (
    <ul className="space-y-2">
      <AnimatePresence initial={false}>
        {accounts.map((a) => {
          const selected = selectedIds.has(a.id)
          const last = relTime(a.last_run_at)
          return (
            <motion.li
              key={a.id}
              layout
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6, transition: { duration: 0.15 } }}
              transition={{ type: 'spring', stiffness: 220, damping: 24 }}
              className={`group relative rounded-xl border px-3 py-2.5 transition-all ${
                selected
                  ? 'border-violet-400/40 bg-violet-500/10 shadow-lg shadow-violet-500/10'
                  : 'border-white/[0.08] bg-white/[0.025] hover:bg-white/[0.045] hover:border-white/[0.14]'
              }`}
            >
              <label className="flex cursor-pointer items-center gap-3">
                <input
                  type="checkbox"
                  className="sr-only"
                  checked={selected}
                  onChange={() => onToggleSelected(a.id)}
                />
                <motion.span
                  layout
                  className={`grid h-5 w-5 place-items-center rounded-md border transition-colors ${
                    selected
                      ? 'border-violet-400/60 bg-violet-500/40'
                      : 'border-white/15 bg-white/[0.04] group-hover:border-white/30'
                  }`}
                >
                  <AnimatePresence>
                    {selected && (
                      <motion.div
                        initial={{ scale: 0, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0, opacity: 0 }}
                        transition={{ duration: 0.12 }}
                      >
                        <CheckCircle2 size={14} className="text-white" />
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-white/90">
                    {a.name}
                  </div>
                  <div className="mt-0.5 flex items-center gap-2 text-[10px] text-white/40">
                    {last && (
                      <span className="flex items-center gap-1">
                        <RefreshCw size={9} /> {last}
                      </span>
                    )}
                    {a.last_status && <StatusDot status={a.last_status} />}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    onRemove(a.id)
                  }}
                  className="opacity-0 transition-opacity group-hover:opacity-100"
                  aria-label="Remove account"
                >
                  <Trash2 size={13} className="text-white/40 hover:text-rose-300" />
                </button>
              </label>
            </motion.li>
          )
        })}
      </AnimatePresence>
    </ul>
  )
}

function StatusDot({ status }: { status: NonNullable<Account['last_status']> }): React.ReactElement {
  if (status === 'ok')
    return (
      <span className="flex items-center gap-1 text-emerald-300/80">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> last brief
      </span>
    )
  if (status === 'blocked')
    return (
      <span className="flex items-center gap-1 text-rose-300/80">
        <ShieldOff size={9} /> blocked
      </span>
    )
  return (
    <span className="flex items-center gap-1 text-amber-300/80">
      <span className="h-1.5 w-1.5 rounded-full bg-amber-400" /> refunded
    </span>
  )
}

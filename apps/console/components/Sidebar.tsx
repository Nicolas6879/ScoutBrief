'use client'

import { motion } from 'framer-motion'
import { ListChecks, Play } from 'lucide-react'
import type { Account } from '@/lib/types'
import { AddAccountForm } from './AddAccountForm'
import { Watchlist } from './Watchlist'

interface Props {
  accounts: Account[]
  selectedIds: Set<string>
  onToggleSelected: (id: string) => void
  onAdd: (name: string) => Promise<unknown>
  onRemove: (id: string) => void
  onRun: () => void
  running: boolean
}

export function Sidebar({
  accounts,
  selectedIds,
  onToggleSelected,
  onAdd,
  onRemove,
  onRun,
  running,
}: Props): React.ReactElement {
  const existingNames = new Set(accounts.map((a) => a.name.toLowerCase()))
  const canRun = !running && selectedIds.size > 0

  return (
    <aside className="sticky top-20 flex max-h-[calc(100vh-6rem)] flex-col gap-4 self-start">
      <div className="glass rounded-2xl p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-white/55">
            <ListChecks size={13} className="text-violet-300" />
            Watchlist
          </h2>
          <span className="text-[10px] text-white/35">{accounts.length}</span>
        </div>
        <div className="flex-1 overflow-y-auto pr-1" style={{ maxHeight: '46vh' }}>
          <Watchlist
            accounts={accounts}
            selectedIds={selectedIds}
            onToggleSelected={onToggleSelected}
            onRemove={onRemove}
          />
        </div>
        <div className="mt-4">
          <AddAccountForm onAdd={onAdd} existing={existingNames} />
        </div>
      </div>

      <motion.button
        layout
        whileTap={canRun ? { scale: 0.97 } : undefined}
        whileHover={canRun ? { y: -1 } : undefined}
        onClick={onRun}
        disabled={!canRun}
        className={`group relative flex items-center justify-center gap-2 overflow-hidden rounded-2xl border px-4 py-4 text-sm font-semibold transition-all ${
          canRun
            ? 'border-violet-400/30 bg-gradient-to-r from-violet-600/80 via-fuchsia-500/70 to-cyan-500/70 text-white shadow-2xl shadow-violet-500/30'
            : 'border-white/[0.08] bg-white/[0.04] text-white/35'
        }`}
      >
        <Play size={16} className={canRun ? 'fill-white' : ''} />
        <span>
          {running
            ? 'Scouting…'
            : selectedIds.size === 0
              ? 'Select to scout'
              : `Scout ${selectedIds.size} ${selectedIds.size === 1 ? 'account' : 'accounts'}`}
        </span>
        {canRun && (
          <span className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/30 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
        )}
      </motion.button>
    </aside>
  )
}

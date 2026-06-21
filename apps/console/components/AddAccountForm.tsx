'use client'

import { motion } from 'framer-motion'
import { Plus } from 'lucide-react'
import { useState } from 'react'

export function AddAccountForm({
  onAdd,
  existing,
}: {
  onAdd: (name: string) => Promise<unknown>
  existing: Set<string>
}): React.ReactElement {
  const [value, setValue] = useState('')
  const [pending, setPending] = useState(false)
  const trimmed = value.trim()
  const dup = trimmed.length > 0 && existing.has(trimmed.toLowerCase())
  const canSubmit = trimmed.length > 0 && !dup && !pending

  const submit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()
    if (!canSubmit) return
    setPending(true)
    await onAdd(trimmed)
    setValue('')
    setPending(false)
  }

  return (
    <form onSubmit={submit} className="space-y-1">
      <div className="flex items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.025] px-3 py-2 focus-within:border-violet-400/50 focus-within:bg-white/[0.04] transition-colors">
        <Plus size={14} className="text-white/40" />
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Add account (e.g. Anthropic)"
          className="flex-1 bg-transparent text-sm outline-none placeholder:text-white/30"
        />
        <motion.button
          type="submit"
          disabled={!canSubmit}
          whileTap={canSubmit ? { scale: 0.94 } : undefined}
          className={`rounded-md px-2.5 py-1 text-[11px] font-semibold transition-colors ${
            canSubmit
              ? 'bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white shadow-md shadow-violet-500/30 hover:brightness-110'
              : 'bg-white/[0.05] text-white/30'
          }`}
        >
          Add
        </motion.button>
      </div>
      {dup && (
        <p className="px-1 text-[10px] text-amber-300/80">
          Already in your watchlist.
        </p>
      )}
    </form>
  )
}

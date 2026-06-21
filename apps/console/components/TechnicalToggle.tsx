'use client'

import { motion } from 'framer-motion'
import { Code2 } from 'lucide-react'
import { useTechnicalView } from '@/lib/hooks'

export function TechnicalToggle(): React.ReactElement {
  const { technical, setTechnical } = useTechnicalView()
  return (
    <button
      onClick={() => setTechnical(!technical)}
      title={technical ? 'Switch to friendly view' : 'Show internal policy names'}
      className={`relative flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-xs transition-colors ${
        technical
          ? 'border-violet-400/40 bg-violet-500/15 text-violet-200'
          : 'border-white/[0.08] bg-white/[0.03] text-white/60 hover:bg-white/[0.06]'
      }`}
    >
      <Code2 size={13} />
      <span className="font-medium">Dev</span>
      <motion.span
        layout
        className={`grid h-4 w-7 items-center rounded-full border ${
          technical ? 'border-violet-300/40 bg-violet-500/40' : 'border-white/15 bg-white/[0.04]'
        }`}
      >
        <motion.span
          layout
          className="block h-3 w-3 rounded-full bg-white shadow"
          style={{ marginLeft: technical ? 12 : 1 }}
          transition={{ type: 'spring', stiffness: 320, damping: 22 }}
        />
      </motion.span>
    </button>
  )
}

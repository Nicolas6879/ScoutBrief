'use client'

import { motion } from 'framer-motion'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import type { LucideIcon } from 'lucide-react'
import { CheckCircle2, Circle, Loader2, ShieldOff } from 'lucide-react'
import type { PipelineNodeStatus } from '@/lib/types'
import { useTechnicalView } from '@/lib/hooks'

export interface ScoutNodeData {
  friendlyLabel: string
  technicalLabel: string
  friendlyDescription: string
  technicalDescription: string
  icon: LucideIcon
  hue: 'violet' | 'cyan' | 'fuchsia' | 'emerald' | 'amber'
  status: PipelineNodeStatus
  selected: boolean
  onSelect?: () => void
  nodeWidth?: number
}

const hueRings: Record<ScoutNodeData['hue'], string> = {
  violet: 'shadow-violet-500/30 ring-violet-400/30',
  cyan: 'shadow-cyan-500/30 ring-cyan-400/30',
  fuchsia: 'shadow-fuchsia-500/30 ring-fuchsia-400/30',
  emerald: 'shadow-emerald-500/30 ring-emerald-400/30',
  amber: 'shadow-amber-500/30 ring-amber-400/30',
}

const hueIcon: Record<ScoutNodeData['hue'], string> = {
  violet: 'text-violet-300 bg-violet-500/15',
  cyan: 'text-cyan-300 bg-cyan-500/15',
  fuchsia: 'text-fuchsia-300 bg-fuchsia-500/15',
  emerald: 'text-emerald-300 bg-emerald-500/15',
  amber: 'text-amber-300 bg-amber-500/15',
}

const statusStyles: Record<PipelineNodeStatus, string> = {
  idle: 'border-white/[0.08] bg-white/[0.025]',
  active:
    'border-violet-400/50 bg-violet-500/10 ring-2 ring-violet-400/30 shadow-xl shadow-violet-500/20 pulse-active',
  ok: 'border-emerald-400/40 bg-emerald-500/10 ring-1 ring-emerald-400/25 shadow-lg shadow-emerald-500/10',
  blocked:
    'border-rose-400/50 bg-rose-500/10 ring-2 ring-rose-400/30 shadow-xl shadow-rose-500/25',
  held: 'border-amber-400/40 bg-amber-500/10 ring-1 ring-amber-400/25',
}

export function PipelineNode({ data, selected }: NodeProps): React.ReactElement {
  const d = data as unknown as ScoutNodeData
  const { technical } = useTechnicalView()
  const Icon = d.icon
  const label = technical ? d.technicalLabel : d.friendlyLabel
  const desc = technical ? d.technicalDescription : d.friendlyDescription
  const showSelected = selected || d.selected

  // Adaptive sizing based on available width (graph-space px at zoom=1)
  const nodeWidth = d.nodeWidth ?? 220
  const isCompact = nodeWidth < 115
  const showDesc = nodeWidth >= 155

  return (
    <motion.button
      type="button"
      onClick={d.onSelect}
      whileHover={{ y: -2, scale: 1.015 }}
      transition={{ type: 'spring', stiffness: 280, damping: 22 }}
      className={`relative w-full rounded-2xl border text-left transition-all backdrop-blur-xl ${
        isCompact ? 'p-2.5' : 'p-3.5'
      } ${statusStyles[d.status]} ${
        showSelected ? `ring-2 ${hueRings[d.hue].split(' ')[1]}` : ''
      }`}
    >
      {/* Handles: Left (target) and Right (source) */}
      <Handle
        type="target"
        position={Position.Left}
        className="!h-2 !w-2 !border-0 !bg-white/30 opacity-0"
      />
      <Handle
        type="source"
        position={Position.Right}
        className="!h-2 !w-2 !border-0 !bg-white/30 opacity-0"
      />

      <div className={`flex items-start ${isCompact ? 'gap-1.5' : 'gap-2.5'}`}>
        <div
          className={`shrink-0 grid place-items-center rounded-xl ${hueIcon[d.hue]} ${
            isCompact ? 'h-7 w-7' : 'h-8 w-8'
          }`}
        >
          <Icon size={isCompact ? 13 : 15} />
        </div>
        <div className="min-w-0 flex-1">
          <div
            className={`truncate font-semibold tracking-tight text-white/95 ${
              isCompact ? 'text-[11px]' : 'text-[12.5px]'
            }`}
          >
            {label}
          </div>
          {showDesc && (
            <p className="mt-0.5 text-[10px] leading-relaxed text-white/50 line-clamp-2">
              {desc}
            </p>
          )}
        </div>
      </div>

      <div className="absolute right-1.5 top-1.5">
        <StatusBadge status={d.status} compact={isCompact} />
      </div>
    </motion.button>
  )
}

function StatusBadge({
  status,
  compact,
}: {
  status: PipelineNodeStatus
  compact: boolean
}): React.ReactElement | null {
  const sz = compact ? 10 : 12
  if (status === 'idle') return <Circle size={sz} className="text-white/20" />
  if (status === 'active') return <Loader2 size={sz} className="text-violet-300 animate-spin" />
  if (status === 'ok') return <CheckCircle2 size={sz + 1} className="text-emerald-300" />
  if (status === 'blocked') return <ShieldOff size={sz + 1} className="text-rose-300" />
  if (status === 'held') return <Loader2 size={sz} className="text-amber-300 animate-spin" />
  return null
}

'use client'

import { AnimatePresence, motion } from 'framer-motion'
import { CheckCircle2, Circle, Loader2, Sparkles } from 'lucide-react'
import { useTechnicalView } from '@/lib/hooks'
import { nodeConfig } from '@/lib/pipeline'
import type { PerAccountRun } from '@/lib/scoutRun'
import type { PipelineNodeKey, PipelineNodeStatus } from '@/lib/types'

interface Props {
  nodeKey: PipelineNodeKey
  run: PerAccountRun | null
}

const STATUS_LABEL: Record<PipelineNodeStatus, string> = {
  idle: 'Idle',
  active: 'Running…',
  ok: 'Completed',
  blocked: 'Blocked',
  held: 'On hold',
}

const STATUS_TONE: Record<PipelineNodeStatus, string> = {
  idle: 'text-white/40',
  active: 'text-violet-200',
  ok: 'text-emerald-300',
  blocked: 'text-rose-300',
  held: 'text-amber-300',
}

export function NodeDetail({ nodeKey, run }: Props): React.ReactElement {
  const { technical } = useTechnicalView()
  const cfg = nodeConfig(nodeKey)
  const state = run?.nodes[nodeKey]
  const status: PipelineNodeStatus = state?.status ?? 'idle'
  const Icon = cfg.icon

  const elapsed =
    state?.startedAt && state.finishedAt
      ? `${(state.finishedAt - state.startedAt) / 1000}s`
      : state?.startedAt && status === 'active'
        ? 'now'
        : null

  return (
    <div className="glass rounded-2xl p-5">
      <div className="flex items-start gap-4">
        <div className="grid h-12 w-12 place-items-center rounded-2xl bg-white/[0.04] ring-1 ring-white/10">
          <Icon size={20} className="text-white/80" />
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h3 className="text-base font-semibold tracking-tight text-white">
              {technical ? cfg.technicalLabel : cfg.friendlyLabel}
            </h3>
            <StatusPill status={status} />
            {elapsed && (
              <span className="text-[10px] text-white/40">· {elapsed}</span>
            )}
          </div>
          <p className="mt-1 text-sm text-white/60">
            {technical ? cfg.technicalDescription : cfg.friendlyDescription}
          </p>
        </div>
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={`${nodeKey}-${status}`}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.18 }}
          className="mt-5 border-t border-white/[0.06] pt-4"
        >
          {!run && (
            <p className="text-sm text-white/50">
              Pick accounts on the left and hit scout to watch this lane light up.
            </p>
          )}
          {run && status === 'idle' && (
            <p className="text-sm text-white/50">
              {technical
                ? 'Stage not reached yet for this run.'
                : 'Hasn’t happened yet for this account.'}
            </p>
          )}
          {run && status === 'active' && (
            <p className="text-sm text-violet-200/80">
              <Sparkles size={12} className="-mt-0.5 mr-1 inline" />
              Running this step now…
            </p>
          )}
          {run && status === 'ok' && (
            <p className="text-sm text-emerald-200/85">
              <CheckCircle2 size={12} className="-mt-0.5 mr-1 inline" />
              Done.
            </p>
          )}
          {run && status === 'blocked' && (
            <p className="text-sm text-rose-200/85">
              {run.blockedReason ?? 'A policy stopped this step.'}
            </p>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  )
}

function StatusPill({ status }: { status: PipelineNodeStatus }): React.ReactElement {
  const Icon =
    status === 'ok'
      ? CheckCircle2
      : status === 'blocked'
        ? Circle
        : status === 'active' || status === 'held'
          ? Loader2
          : Circle
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full bg-white/[0.04] px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider ${STATUS_TONE[status]}`}
    >
      <Icon size={9} className={status === 'active' || status === 'held' ? 'animate-spin' : ''} />
      {STATUS_LABEL[status]}
    </span>
  )
}

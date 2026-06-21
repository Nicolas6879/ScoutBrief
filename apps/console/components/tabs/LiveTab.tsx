'use client'

import { motion, AnimatePresence } from 'framer-motion'
import { Activity, AlignHorizontalDistributeCenter, CheckCircle2, ExternalLink, ShieldOff, Sparkles, Undo2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import type { PerAccountRun, ScoutBatchState } from '@/lib/scoutRun'
import type { PipelineNodeKey, PipelineNodeState } from '@/lib/types'
import { PIPELINE_NODES } from '@/lib/pipeline'
import type { PipelineLayout } from '@/components/pipeline/Pipeline'
import { BriefRenderer } from '../BriefRenderer'
import { DecisionLog } from '../DecisionLog'
import { NodeDetail } from '../NodeDetail'
import { Pipeline } from '../pipeline/Pipeline'
import { QueueStrip } from '../QueueStrip'

function idleNodes(): Record<PipelineNodeKey, PipelineNodeState> {
  return PIPELINE_NODES.reduce(
    (acc, n) => {
      acc[n.key] = { key: n.key, status: 'idle' }
      return acc
    },
    {} as Record<PipelineNodeKey, PipelineNodeState>,
  )
}

interface Props {
  batch: ScoutBatchState
  onSelectAccount: (accountId: string) => void
}

function activeNodeKey(
  states: Record<PipelineNodeKey, PipelineNodeState>,
): PipelineNodeKey | null {
  const active = PIPELINE_NODES.find((n) => states[n.key]?.status === 'active')
  if (active) return active.key
  const lastOk = [...PIPELINE_NODES].reverse().find(
    (n) => states[n.key]?.status === 'ok',
  )
  if (lastOk) return lastOk.key
  const blocked = PIPELINE_NODES.find((n) => states[n.key]?.status === 'blocked')
  return blocked?.key ?? null
}

export function LiveTab({ batch, onSelectAccount }: Props): React.ReactElement {
  const [selectedNode, setSelectedNode] = useState<PipelineNodeKey | null>(null)
  const [layout, setLayout] = useState<PipelineLayout>('arc')

  const currentRun = batch.current ? batch.perAccount[batch.current] : undefined
  const states = useMemo(
    () => currentRun?.nodes ?? idleNodes(),
    [currentRun],
  )
  const effectiveNode: PipelineNodeKey =
    selectedNode ?? activeNodeKey(states) ?? 'request'

  const hasBatch = batch.accounts.length > 0
  const hasRun = !!currentRun

  return (
    <motion.div
      key="live"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.2 }}
      className="space-y-5"
    >
      <div className="glass rounded-2xl p-5">
        {/* Panel header */}
        <div className="mb-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Sparkles size={14} className="text-violet-300" />
            <h2 className="text-sm font-semibold tracking-tight text-white/85">
              {currentRun ? `Scouting ${currentRun.accountName}` : 'Pipeline'}
            </h2>
            {currentRun && <RunBadge run={currentRun} />}
          </div>

          <div className="flex items-center gap-2">
            {!hasBatch && (
              <span className="text-[10px] uppercase tracking-[0.18em] text-white/35">
                Idle · waiting for scout
              </span>
            )}
            {/* Layout toggle */}
            <div className="flex items-center gap-0.5 rounded-lg border border-white/[0.07] bg-white/[0.03] p-0.5">
              <LayoutBtn
                active={layout === 'arc'}
                onClick={() => setLayout('arc')}
                title="Arc layout"
              >
                <Activity size={13} />
              </LayoutBtn>
              <LayoutBtn
                active={layout === 'horizontal'}
                onClick={() => setLayout('horizontal')}
                title="Horizontal layout"
              >
                <AlignHorizontalDistributeCenter size={13} />
              </LayoutBtn>
            </div>
          </div>
        </div>

        {hasBatch && (
          <div className="mb-4">
            <QueueStrip batch={batch} onSelect={onSelectAccount} />
          </div>
        )}

        <Pipeline
          states={states}
          selectedKey={selectedNode}
          onSelect={setSelectedNode}
          interactive
          layout={layout}
        />
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1.1fr_1fr]">
        <NodeDetail nodeKey={effectiveNode} run={currentRun ?? null} />
        <DecisionLog decisions={currentRun?.decisions ?? []} />
      </div>

      {!hasRun && (
        <div className="glass rounded-2xl p-10">
          <div className="grid place-items-center text-center">
            <h3 className="text-base font-semibold tracking-tight text-white/85">
              Pick accounts on the left and hit scout.
            </h3>
            <p className="mt-1 max-w-md text-sm text-white/55">
              Every check runs in front of you. Blockers are explained, refunds happen on-chain, and the brief lands in your history.
            </p>
          </div>
        </div>
      )}

      <AnimatePresence>
        {currentRun && currentRun.outcome === 'ok' && currentRun.briefMarkdown && (
          <motion.div
            key={`brief-${currentRun.runId}`}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }}
            transition={{ type: 'spring', stiffness: 240, damping: 26 }}
            className="glass rounded-2xl p-6"
          >
            <div className="mb-4 flex items-center gap-2">
              <CheckCircle2 size={16} className="text-emerald-300" />
              <h3 className="text-sm font-semibold tracking-tight text-white/85">
                {currentRun.accountName} brief
              </h3>
            </div>
            <BriefRenderer markdown={currentRun.briefMarkdown} />
            <div className="mt-5 flex flex-wrap gap-3 text-xs">
              {currentRun.releaseTx && (
                <ReceiptLink href={hashscanFromTx(currentRun.releaseTx)} label="Payment receipt" />
              )}
            </div>
          </motion.div>
        )}

        {currentRun &&
          (currentRun.outcome === 'blocked' || currentRun.outcome === 'refunded') && (
            <motion.div
              key={`blocked-${currentRun.runId}`}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="glass rounded-2xl p-6"
            >
              <div className="mb-2 flex items-center gap-2">
                {currentRun.outcome === 'refunded' ? (
                  <>
                    <Undo2 size={16} className="text-amber-300" />
                    <h3 className="text-sm font-semibold text-white/90">
                      Refunded · funds returned to your wallet
                    </h3>
                  </>
                ) : (
                  <>
                    <ShieldOff size={16} className="text-rose-300" />
                    <h3 className="text-sm font-semibold text-white/90">
                      Blocked before any cost
                    </h3>
                  </>
                )}
              </div>
              <p className="text-sm text-white/65">
                {currentRun.blockedReason ?? 'A policy stopped this run.'}
              </p>
              {currentRun.refundTx && (
                <div className="mt-4">
                  <ReceiptLink
                    href={hashscanFromTx(currentRun.refundTx)}
                    label="Refund receipt"
                  />
                </div>
              )}
            </motion.div>
          )}
      </AnimatePresence>
    </motion.div>
  )
}

// ---------- helpers ----------

function LayoutBtn({
  active,
  onClick,
  title,
  children,
}: {
  active: boolean
  onClick: () => void
  title: string
  children: React.ReactNode
}): React.ReactElement {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`relative rounded-md px-2 py-1 transition-colors ${
        active
          ? 'bg-white/[0.10] text-white shadow-sm'
          : 'text-white/40 hover:text-white/70'
      }`}
    >
      {children}
    </button>
  )
}

function RunBadge({ run }: { run: PerAccountRun }): React.ReactElement {
  if (run.outcome === 'running')
    return (
      <span className="rounded-full border border-violet-400/30 bg-violet-500/15 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-violet-200">
        running
      </span>
    )
  if (run.outcome === 'ok')
    return (
      <span className="rounded-full border border-emerald-400/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-emerald-200">
        delivered
      </span>
    )
  if (run.outcome === 'refunded')
    return (
      <span className="rounded-full border border-amber-400/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-amber-200">
        refunded
      </span>
    )
  return (
    <span className="rounded-full border border-rose-400/30 bg-rose-500/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-rose-200">
      blocked
    </span>
  )
}

function ReceiptLink({ href, label }: { href: string | null; label: string }): React.ReactElement | null {
  if (!href) return null
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 text-xs text-white/75 transition-colors hover:bg-white/[0.06] hover:text-white"
    >
      <ExternalLink size={11} />
      {label}
    </a>
  )
}

function hashscanFromTx(txOutput: string): string | null {
  const base = process.env.NEXT_PUBLIC_HASHSCAN_BASE ?? 'https://hashscan.io/testnet'
  if (txOutput.startsWith('http')) return txOutput
  const match = txOutput.match(/^(\d+\.\d+\.\d+)@(\d+)\.(\d+)$/)
  if (match) return `${base}/transaction/${match[1]}-${match[2]}-${match[3]}`
  return `${base}/transaction/${txOutput}`
}

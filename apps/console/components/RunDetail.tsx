'use client'

import { AnimatePresence, motion } from 'framer-motion'
import { CheckCircle2, Database, ExternalLink, Loader2, Maximize2, ShieldOff, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useRunDetail } from '@/lib/hooks'
import type { Decision, Run } from '@/lib/types'
import type { PipelineNodeKey, PipelineNodeState } from '@/lib/types'
import { PIPELINE_NODES } from '@/lib/pipeline'
import { BriefRenderer } from './BriefRenderer'
import { Pipeline } from './pipeline/Pipeline'

const NODE_ORDER: PipelineNodeKey[] = [
  'request',
  'counterparty',
  'charge',
  'spend',
  'research',
  'approval',
  'audit',
]

const STAGE_TO_NODE: Record<string, PipelineNodeKey> = {
  counterparty: 'counterparty',
  charge: 'charge',
  spend: 'spend',
  tavily: 'research',
  synth: 'research',
  release: 'approval',
  approval: 'approval',
  audit: 'audit',
}

function policyToNode(policy: string | null): PipelineNodeKey | null {
  if (!policy) return null
  if (policy.toLowerCase().includes('counterparty')) return 'counterparty'
  if (policy.toLowerCase().includes('spend')) return 'spend'
  if (policy.toLowerCase().includes('contextual') || policy.toLowerCase().includes('approval'))
    return 'approval'
  return null
}

function idleNodes(): Record<PipelineNodeKey, PipelineNodeState> {
  return PIPELINE_NODES.reduce(
    (acc, n) => {
      acc[n.key] = { key: n.key, status: 'idle' }
      return acc
    },
    {} as Record<PipelineNodeKey, PipelineNodeState>,
  )
}

function replayToNodes(run: Run, decisions: Decision[]): Record<PipelineNodeKey, PipelineNodeState> {
  const nodes = idleNodes()

  if (run.status === 'ok') {
    for (const key of NODE_ORDER) {
      nodes[key] = { key, status: 'ok' }
    }
    return nodes
  }

  if (decisions.length > 0 || run.status !== 'running') {
    nodes['request'] = { key: 'request', status: 'ok' }
  }

  for (const d of decisions) {
    const nodeKey = STAGE_TO_NODE[d.stage]
    if (nodeKey && d.status === 'ok') {
      nodes[nodeKey] = { key: nodeKey, status: 'ok' }
    }
  }

  const blocked = decisions.find((d) => d.status === 'blocked' || d.stage === 'blocked')
  if (blocked) {
    const blockedNode =
      STAGE_TO_NODE[blocked.stage] ??
      policyToNode(blocked.policy_name) ??
      policyToNode(run.blocked_policy)
    if (blockedNode) {
      nodes[blockedNode] = { key: blockedNode, status: 'blocked' }
    }
  } else if (run.blocked_policy) {
    const blockedNode = policyToNode(run.blocked_policy)
    if (blockedNode) {
      const idx = NODE_ORDER.indexOf(blockedNode)
      for (let i = 1; i < idx; i++) {
        const k = NODE_ORDER[i]
        if (k) nodes[k] = { key: k, status: 'ok' }
      }
      nodes[blockedNode] = { key: blockedNode, status: 'blocked' }
    }
  }

  return nodes
}

function hashscanHref(txOutput: string): string {
  const base = process.env.NEXT_PUBLIC_HASHSCAN_BASE ?? 'https://hashscan.io/testnet'
  if (txOutput.startsWith('http')) return txOutput
  const m = txOutput.match(/^(\d+\.\d+\.\d+)@(\d+)\.(\d+)$/)
  if (m) return `${base}/transaction/${m[1]}-${m[2]}-${m[3]}`
  return `${base}/transaction/${txOutput}`
}

function TxLink({ tx, label }: { tx: string | null; label: string }): React.ReactElement | null {
  if (!tx) return null
  return (
    <a
      href={hashscanHref(tx)}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 text-xs text-white/65 transition-colors hover:bg-white/[0.06] hover:text-white"
    >
      <ExternalLink size={11} />
      {label}
    </a>
  )
}

function HcsLink({ topic }: { topic: string | null }): React.ReactElement | null {
  if (!topic) return null
  const base = process.env.NEXT_PUBLIC_HASHSCAN_BASE ?? 'https://hashscan.io/testnet'
  return (
    <a
      href={`${base}/topic/${topic}`}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1.5 rounded-lg border border-cyan-400/20 bg-cyan-500/[0.06] px-3 py-1.5 text-xs text-cyan-300/80 transition-colors hover:bg-cyan-500/[0.12] hover:text-cyan-200"
    >
      <Database size={11} />
      HCS audit trail
    </a>
  )
}

// ---------- Pipeline expand modal ----------

function StatusPill({ status }: { status: string }): React.ReactElement {
  if (status === 'ok')
    return (
      <span className="rounded-full border border-emerald-400/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-emerald-200">
        completed
      </span>
    )
  if (status === 'blocked' || status === 'refunded')
    return (
      <span className="rounded-full border border-rose-400/30 bg-rose-500/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-rose-200">
        {status}
      </span>
    )
  return (
    <span className="rounded-full border border-white/[0.10] bg-white/[0.04] px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-white/55">
      {status}
    </span>
  )
}

interface ModalProps {
  nodes: Record<PipelineNodeKey, PipelineNodeState>
  run: Run
  onClose: () => void
}

function PipelineModal({ nodes, run, onClose }: ModalProps): React.ReactElement {
  const [selectedNode, setSelectedNode] = useState<PipelineNodeKey | null>(null)

  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(8,9,14,0.85)' }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="pointer-events-none absolute inset-0 backdrop-blur-sm" aria-hidden />

      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 16 }}
        transition={{ type: 'spring', stiffness: 280, damping: 26 }}
        className="relative z-10 flex max-h-[90vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-white/[0.10] bg-[#0d0e17] shadow-2xl"
      >
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-white/[0.06] px-6 py-4">
          <div className="flex items-center gap-2.5">
            <Maximize2 size={14} className="text-violet-300" />
            <span className="text-sm font-semibold text-white/90">
              Pipeline · full view
            </span>
            <StatusPill status={run.status} />
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-white/40 transition-colors hover:bg-white/[0.06] hover:text-white"
            title="Close (Esc)"
          >
            <X size={15} />
          </button>
        </div>

        {/* Pipeline — interactive so user can zoom/pan */}
        <div className="shrink-0 px-6 pt-5">
          <Pipeline
            states={nodes}
            selectedKey={selectedNode}
            onSelect={setSelectedNode}
            interactive
          />
        </div>

        {/* Brief */}
        {run.status === 'ok' && run.brief_markdown && (
          <div className="flex-1 overflow-y-auto px-6 pb-4 pt-4">
            <div className="rounded-xl border border-white/[0.06] bg-white/[0.015] p-5">
              <BriefRenderer markdown={run.brief_markdown} />
            </div>
          </div>
        )}

        {/* Tx links */}
        {(run.charge_tx || run.release_tx || run.refund_tx || run.audit_topic) && (
          <div className="flex shrink-0 flex-wrap gap-2 border-t border-white/[0.06] px-6 py-4">
            <TxLink tx={run.charge_tx} label="Charge receipt" />
            <TxLink tx={run.release_tx} label="Payment receipt" />
            <TxLink tx={run.refund_tx} label="Refund receipt" />
            <HcsLink topic={run.audit_topic} />
          </div>
        )}
      </motion.div>
    </motion.div>
  )
}

// ---------- Main RunDetail ----------

interface Props {
  runId: string
}

export function RunDetail({ runId }: Props): React.ReactElement {
  const { run, decisions, loading } = useRunDetail(runId)
  const [selectedNode, setSelectedNode] = useState<PipelineNodeKey | null>(null)
  const [modalOpen, setModalOpen] = useState(false)

  const nodes = run ? replayToNodes(run, decisions) : idleNodes()

  const costHbar = run?.cost_tinybars
    ? (run.cost_tinybars / 100_000_000).toFixed(4)
    : null

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-white/40">
        <Loader2 size={20} className="animate-spin" />
      </div>
    )
  }

  if (!run) {
    return (
      <div className="py-8 text-center text-sm text-white/40">
        Could not load run details.
      </div>
    )
  }

  return (
    <>
      <div className="space-y-4">
        {/* Frozen pipeline with expand button */}
        <div className="relative overflow-hidden rounded-xl border border-white/[0.06] bg-white/[0.015]">
          <Pipeline
            states={nodes}
            selectedKey={selectedNode}
            onSelect={setSelectedNode}
          />
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            title="Expand pipeline"
            className="absolute right-3 top-3 z-10 flex items-center gap-1.5 rounded-lg border border-white/[0.10] bg-[#0d0e17]/80 px-2.5 py-1.5 text-[11px] text-white/50 backdrop-blur-sm transition-colors hover:bg-white/[0.10] hover:text-white"
          >
            <Maximize2 size={11} />
            Expand
          </button>
        </div>

        {/* Status summary */}
        <div className="flex flex-wrap items-center gap-2">
          {run.status === 'ok' && (
            <span className="inline-flex items-center gap-1.5 text-xs text-emerald-300">
              <CheckCircle2 size={13} />
              Brief delivered
              {costHbar && <span className="text-white/40">· {costHbar} HBAR</span>}
            </span>
          )}
          {(run.status === 'blocked' || run.status === 'refunded') && (
            <span className="inline-flex items-center gap-1.5 text-xs text-rose-300">
              <ShieldOff size={13} />
              {run.blocked_reason ?? 'Blocked by policy'}
              {run.status === 'refunded' && (
                <span className="ml-1 text-amber-300">· Refunded</span>
              )}
            </span>
          )}
          {run.status === 'error' && (
            <span className="text-xs text-orange-300">Run ended in error</span>
          )}
        </div>

        {/* Tx links */}
        {(run.charge_tx || run.release_tx || run.refund_tx || run.audit_topic) && (
          <div className="flex flex-wrap gap-2">
            <TxLink tx={run.charge_tx} label="Charge receipt" />
            <TxLink tx={run.release_tx} label="Payment receipt" />
            <TxLink tx={run.refund_tx} label="Refund receipt" />
            <HcsLink topic={run.audit_topic} />
          </div>
        )}

        {/* Brief content */}
        {run.status === 'ok' && run.brief_markdown && (
          <div className="rounded-xl border border-white/[0.06] bg-white/[0.015] p-5">
            <BriefRenderer markdown={run.brief_markdown} />
          </div>
        )}
      </div>

      <AnimatePresence>
        {modalOpen && (
          <PipelineModal
            nodes={nodes}
            run={run}
            onClose={() => setModalOpen(false)}
          />
        )}
      </AnimatePresence>
    </>
  )
}

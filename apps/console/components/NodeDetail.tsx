'use client'

import { AnimatePresence, motion } from 'framer-motion'
import { CheckCircle2, Circle, Loader2, Sparkles } from 'lucide-react'
import { useBudget, useTechnicalView } from '@/lib/hooks'
import { nodeConfig } from '@/lib/pipeline'
import type { PerAccountRun } from '@/lib/scoutRun'
import type { Budget, PipelineNodeKey, PipelineNodeStatus } from '@/lib/types'
import { HashScanLink, HcsTopicLink } from './HashScanLink'

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

// The per-brief charge is a fixed amount on the agent (PER_BRIEF_HBAR).
const PER_BRIEF_HBAR = 0.05

function hbar(tinybars: number): string {
  return (tinybars / 100_000_000).toFixed(2)
}

function txHref(tx?: string): string | undefined {
  if (!tx) return undefined
  if (tx.startsWith('http')) return tx
  const base = process.env.NEXT_PUBLIC_HASHSCAN_BASE ?? 'https://hashscan.io/testnet'
  const m = tx.match(/^(\d+\.\d+\.\d+)@(\d+)\.(\d+)$/)
  if (m) return `${base}/transaction/${m[1]}-${m[2]}-${m[3]}`
  return `${base}/transaction/${tx}`
}

interface Fact {
  label: string
  value: string
  mono?: boolean
}

export function NodeDetail({ nodeKey, run }: Props): React.ReactElement {
  const { technical } = useTechnicalView()
  const { budget } = useBudget()
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

  const reached = status === 'ok' || status === 'active' || status === 'blocked' || status === 'held'
  const facts = run && reached ? nodeFacts(nodeKey, run, budget, technical) : []
  const links = run && reached ? nodeLinks(nodeKey, run) : null

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

          {facts.length > 0 && (
            <dl className="space-y-2">
              {facts.map((f) => (
                <div key={f.label} className="flex items-baseline justify-between gap-3">
                  <dt className="text-xs text-white/45">{f.label}</dt>
                  <dd
                    className={`text-right text-[13px] text-white/85 ${
                      f.mono ? 'font-mono text-[12px]' : ''
                    }`}
                  >
                    {f.value}
                  </dd>
                </div>
              ))}
            </dl>
          )}

          {run && status === 'blocked' && (
            <p className="mt-3 text-sm text-rose-200/85">
              {run.blockedReason ?? 'A policy stopped this step.'}
            </p>
          )}
          {run && status === 'active' && facts.length === 0 && (
            <p className="text-sm text-violet-200/80">
              <Sparkles size={12} className="-mt-0.5 mr-1 inline" />
              Running this step now…
            </p>
          )}

          {links && <div className="mt-4 flex flex-wrap gap-4">{links}</div>}
        </motion.div>
      </AnimatePresence>
    </div>
  )
}

function nodeFacts(
  nodeKey: PipelineNodeKey,
  run: PerAccountRun,
  budget: Budget | null,
  technical: boolean,
): Fact[] {
  switch (nodeKey) {
    case 'request':
      return [{ label: 'Scout depth', value: run.depth ?? '—' }]

    case 'counterparty':
      return [
        {
          label: technical ? 'Allowlisted endpoints' : 'Approved vendors',
          value: 'Tavily · Groq · Gemini',
        },
        { label: 'Allowlist check', value: 'passed' },
      ]

    case 'charge': {
      const facts: Fact[] = [
        { label: 'Held in escrow', value: `${PER_BRIEF_HBAR.toFixed(2)} HBAR` },
      ]
      if (technical) facts.push({ label: 'Audit hook', value: 'HcsAuditTrailHook' })
      return facts
    }

    case 'spend': {
      const facts: Fact[] = [{ label: 'This run', value: `${PER_BRIEF_HBAR.toFixed(2)} HBAR` }]
      if (budget) {
        facts.push({
          label: 'Per-brief cap',
          value: `${hbar(budget.per_brief_limit_tinybars)} HBAR`,
        })
        facts.push({
          label: 'Daily used',
          value: `${hbar(budget.daily_used_tinybars)} / ${hbar(budget.daily_limit_tinybars)} HBAR`,
        })
      }
      facts.push({
        label: 'Verdict',
        value: run.nodes.spend?.status === 'blocked' ? 'over cap' : '✓ within limits',
      })
      return facts
    }

    case 'research': {
      const facts: Fact[] = []
      if (run.sources)
        facts.push({
          label: technical ? 'Tavily results' : 'Sources found',
          value: `${run.sources.count} · ${run.sources.ms}ms`,
        })
      if (run.synth)
        facts.push({
          label: technical ? 'LLM synthesis' : 'Brief written',
          value: `${run.synth.provider} · ${run.synth.chars.toLocaleString()} chars · ${run.synth.ms}ms`,
        })
      return facts
    }

    case 'approval':
      return [
        {
          label: 'Settlement',
          value: run.refundTx ? 'refunded to operator' : 'released to operator',
        },
        { label: 'Amount', value: `${PER_BRIEF_HBAR.toFixed(2)} HBAR` },
      ]

    case 'audit': {
      const facts: Fact[] = []
      if (run.auditTopic) facts.push({ label: 'Audit topic', value: run.auditTopic, mono: true })
      facts.push({ label: 'Events recorded', value: String(run.auditRefs?.length ?? 0) })
      return facts
    }

    default:
      return []
  }
}

function nodeLinks(nodeKey: PipelineNodeKey, run: PerAccountRun): React.ReactNode {
  switch (nodeKey) {
    case 'charge':
      return <HashScanLink txOutput={txHref(run.chargeTx)} label="Charge receipt" />
    case 'approval':
      return run.refundTx ? (
        <HashScanLink txOutput={txHref(run.refundTx)} label="Refund receipt" />
      ) : (
        <HashScanLink txOutput={txHref(run.releaseTx)} label="Payment receipt" />
      )
    case 'audit':
      return <HcsTopicLink topicId={run.auditTopic} label="HCS audit trail" />
    default:
      return null
  }
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

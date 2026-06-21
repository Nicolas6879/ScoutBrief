'use client'

import { useCallback, useRef, useState } from 'react'
import { streamPost } from './sseClient'
import { PIPELINE_NODES } from './pipeline'
import type {
  BriefStep,
  PipelineNodeKey,
  PipelineNodeState,
  PipelineNodeStatus,
} from './types'

// ---------- Per-account run state ----------

export type RunOutcome = 'running' | 'ok' | 'blocked' | 'refunded' | 'error'

export interface DecisionEntry {
  id: number
  ts: number
  text: string
  tone: 'info' | 'ok' | 'blocked' | 'active'
  policyName?: string
  hookName?: string
  rawStage: string
}

export interface PerAccountRun {
  runId: string
  accountId: string
  accountName: string
  outcome: RunOutcome
  nodes: Record<PipelineNodeKey, PipelineNodeState>
  decisions: DecisionEntry[]
  briefMarkdown?: string
  blockedPolicy?: string
  blockedReason?: string
  chargeTx?: string
  releaseTx?: string
  refundTx?: string
  auditTopic?: string
}

export interface ScoutBatchState {
  batchId: string | null
  active: boolean
  accounts: { id: string; name: string }[]
  current: string | null // accountId currently running
  perAccount: Record<string, PerAccountRun>
}

function blankNodes(): Record<PipelineNodeKey, PipelineNodeState> {
  return PIPELINE_NODES.reduce(
    (acc, n) => {
      acc[n.key] = { key: n.key, status: 'idle' }
      return acc
    },
    {} as Record<PipelineNodeKey, PipelineNodeState>,
  )
}

const initialBatch: ScoutBatchState = {
  batchId: null,
  active: false,
  accounts: [],
  current: null,
  perAccount: {},
}

// ---------- Friendly copy ----------

function statusOf(node: PipelineNodeKey, run: PerAccountRun): PipelineNodeStatus {
  return run.nodes[node]?.status ?? 'idle'
}

function setNode(
  run: PerAccountRun,
  node: PipelineNodeKey,
  status: PipelineNodeStatus,
): void {
  const ts = Date.now()
  const prev = run.nodes[node]
  run.nodes[node] = {
    key: node,
    status,
    startedAt:
      status === 'active' && prev?.status !== 'active'
        ? ts
        : prev?.startedAt,
    finishedAt: status === 'ok' || status === 'blocked' ? ts : prev?.finishedAt,
  }
}

function pushDecision(
  run: PerAccountRun,
  entry: Omit<DecisionEntry, 'id' | 'ts'>,
): void {
  run.decisions.push({
    ...entry,
    id: run.decisions.length,
    ts: Date.now(),
  })
}

function applyStep(run: PerAccountRun, step: BriefStep): void {
  switch (step.stage) {
    case 'decision':
      setNode(run, 'request', 'ok')
      setNode(run, 'counterparty', 'active')
      pushDecision(run, {
        rawStage: 'decision',
        text: `Scout depth chosen: ${step.depth}`,
        tone: 'info',
      })
      break

    case 'charge':
      if (step.ok) {
        // A successful charge means the full Pre-Tool → Post-Param-Norm policy
        // chain already passed: CounterpartyAllowlistPolicy AND SpendLimitPolicy.
        // Mark all three settled and hand off to the web-research phase so a
        // later failure (e.g. Tavily) is attributed to the right node.
        setNode(run, 'counterparty', 'ok')
        setNode(run, 'charge', 'ok')
        setNode(run, 'spend', 'ok')
        setNode(run, 'research', 'active')
        pushDecision(run, {
          rawStage: 'charge',
          text: 'Vendors approved · funds held in escrow',
          tone: 'ok',
          policyName: 'CounterpartyAllowlistPolicy',
          hookName: 'HcsAuditTrailHook',
        })
      } else {
        // figure out which node took the block
        const blockedNode: PipelineNodeKey =
          step.reason?.toLowerCase().includes('spendlimit') ||
          step.reason?.toLowerCase().includes('per-brief cap') ||
          step.reason?.toLowerCase().includes('daily cap')
            ? 'spend'
            : 'counterparty'
        setNode(run, blockedNode, 'blocked')
        pushDecision(run, {
          rawStage: 'charge',
          text: `Blocked: ${friendly(step.reason)}`,
          tone: 'blocked',
          policyName: step.reason?.match(/(\w+Policy)/)?.[1],
        })
      }
      break

    case 'tavily':
      setNode(run, 'spend', 'ok')
      setNode(run, 'research', 'active')
      pushDecision(run, {
        rawStage: 'tavily',
        text: `Web search returned ${step.count} sources in ${step.ms}ms`,
        tone: 'active',
      })
      break

    case 'synth':
      // LLM finished writing — research is done, approval phase starts
      setNode(run, 'research', 'ok')
      setNode(run, 'approval', 'active')
      pushDecision(run, {
        rawStage: 'synth',
        text: `${step.provider} wrote ${step.chars} chars in ${step.ms}ms`,
        tone: 'ok',
      })
      break

    case 'release':
      if (step.ok) {
        setNode(run, 'approval', 'ok')
        setNode(run, 'audit', 'active')
        run.releaseTx = step.txOutput
        pushDecision(run, {
          rawStage: 'release',
          text: 'Settlement approved · funds released on-chain',
          tone: 'ok',
          policyName: 'ContextualApprovalPolicy',
        })
      } else {
        setNode(run, 'approval', 'blocked')
        pushDecision(run, {
          rawStage: 'release',
          text: `Release failed: ${friendly(step.reason)}`,
          tone: 'blocked',
          policyName: 'ContextualApprovalPolicy',
        })
      }
      break

    case 'refund':
      // The node that actually failed was already marked blocked by the
      // preceding 'error'/'blocked'/'release' step. The refund only adds the
      // on-chain return + audit; don't re-attribute the block to 'approval'.
      run.refundTx = step.txOutput
      setNode(run, 'audit', 'active')
      pushDecision(run, {
        rawStage: 'refund',
        text: 'Funds returned to your wallet',
        tone: 'blocked',
      })
      break

    case 'audit':
      // The very last audit message (decision_complete) marks the audit node done.
      // We optimistically mark it ok on every audit event; the runDone hook
      // can correct if needed.
      run.auditTopic = step.topic
      if (statusOf('audit', run) === 'active') {
        setNode(run, 'audit', 'ok')
      }
      pushDecision(run, {
        rawStage: 'audit',
        text: `Recorded on Hedera (${step.ref})`,
        tone: 'info',
        hookName: 'HcsAuditTrailHook',
      })
      break

    case 'blocked': {
      // Mark whatever was active as blocked.
      const active = PIPELINE_NODES.find(
        (n) => statusOf(n.key, run) === 'active',
      )?.key
      if (active) setNode(run, active, 'blocked')
      pushDecision(run, {
        rawStage: 'blocked',
        text: `Blocked: ${friendly(step.reason)}`,
        tone: 'blocked',
        policyName: step.policyName,
      })
      break
    }

    case 'error': {
      const active = PIPELINE_NODES.find(
        (n) => statusOf(n.key, run) === 'active',
      )?.key
      if (active) setNode(run, active, 'blocked')
      pushDecision(run, {
        rawStage: 'error',
        text: `Error: ${friendly(step.reason)}`,
        tone: 'blocked',
      })
      break
    }

    default:
      break
  }
}

function friendly(reason?: string): string {
  if (!reason) return 'no reason returned'
  const r = reason.toLowerCase()
  if (r.includes('per-brief cap')) return 'cost exceeded per-brief budget'
  if (r.includes('daily cap')) return 'daily budget would be exceeded'
  if (r.includes('not in allowlist')) return 'vendor not in allowlist'
  if (r.includes('recipient') && r.includes('limit'))
    return 'recipient hit daily limit'
  return reason.length > 140 ? reason.slice(0, 137) + '…' : reason
}

// ---------- Hook ----------

export interface UseScoutRun {
  state: ScoutBatchState
  run: (accountIds: string[]) => Promise<void>
  selectCurrent: (accountId: string) => void
  reset: () => void
}

export function useScoutRun(opts?: {
  onComplete?: () => void
  onCelebrate?: () => void
}): UseScoutRun {
  const [state, setState] = useState<ScoutBatchState>(initialBatch)
  const stateRef = useRef<ScoutBatchState>(initialBatch)
  stateRef.current = state

  const mutate = useCallback(
    (fn: (s: ScoutBatchState) => ScoutBatchState): void => {
      setState((prev) => {
        const next = fn(prev)
        stateRef.current = next
        return next
      })
    },
    [],
  )

  const reset = useCallback(() => {
    mutate(() => ({ ...initialBatch }))
  }, [mutate])

  const selectCurrent = useCallback(
    (accountId: string): void => {
      mutate((s) => (s.perAccount[accountId] ? { ...s, current: accountId } : s))
    },
    [mutate],
  )

  const run = useCallback(
    async (accountIds: string[]): Promise<void> => {
      if (accountIds.length === 0) return

      // Reset to running state
      mutate(() => ({
        batchId: null,
        active: true,
        accounts: [],
        current: null,
        perAccount: {},
      }))

      let anyOk = false

      await streamPost({
        path: '/scout/run',
        body: { accountIds },
        onError: (err) => {
          console.error('[scout/run] stream error', err)
        },
        onMessage: (msg) => {
          if (msg.event === 'batchStart') {
            const d = msg.data as {
              batchId: string
              accounts: { id: string; name: string }[]
            }
            mutate(() => ({
              batchId: d.batchId,
              active: true,
              accounts: d.accounts,
              current: d.accounts[0]?.id ?? null,
              perAccount: {},
            }))
            return
          }
          if (msg.event === 'runStart') {
            const d = msg.data as {
              batchId: string
              runId: string
              account: { id: string; name: string }
            }
            mutate((s) => ({
              ...s,
              current: d.account.id,
              perAccount: {
                ...s.perAccount,
                [d.account.id]: {
                  runId: d.runId,
                  accountId: d.account.id,
                  accountName: d.account.name,
                  outcome: 'running',
                  nodes: (() => {
                    const blank = blankNodes()
                    blank.request = { key: 'request', status: 'active' }
                    return blank
                  })(),
                  decisions: [],
                },
              },
            }))
            return
          }
          if (msg.event === 'step') {
            const d = msg.data as {
              accountId: string
              step: BriefStep
            }
            mutate((s) => {
              const run = s.perAccount[d.accountId]
              if (!run) return s
              const next = { ...run, decisions: [...run.decisions], nodes: { ...run.nodes } }
              applyStep(next, d.step)
              return {
                ...s,
                perAccount: { ...s.perAccount, [d.accountId]: next },
              }
            })
            return
          }
          if (msg.event === 'runDone') {
            const d = msg.data as {
              accountId: string
              ok: boolean
              briefMarkdown?: string
              policyName?: string
              reason?: string
            }
            mutate((s) => {
              const run = s.perAccount[d.accountId]
              if (!run) return s
              const next = { ...run, nodes: { ...run.nodes } }
              if (d.ok) {
                next.outcome = 'ok'
                next.briefMarkdown = d.briefMarkdown
                // Finalize any node still spinning — covers race between synth→release→runDone
                for (const k of Object.keys(next.nodes) as PipelineNodeKey[]) {
                  const st = next.nodes[k]?.status
                  if (st === 'active' || st === 'held') setNode(next, k, 'ok')
                }
                anyOk = true
              } else if (run.refundTx) {
                next.outcome = 'refunded'
                next.blockedPolicy = d.policyName
                next.blockedReason = d.reason
                for (const k of Object.keys(next.nodes) as PipelineNodeKey[]) {
                  if (next.nodes[k]?.status === 'active') setNode(next, k, 'blocked')
                }
              } else {
                next.outcome = 'blocked'
                next.blockedPolicy = d.policyName
                next.blockedReason = d.reason
                for (const k of Object.keys(next.nodes) as PipelineNodeKey[]) {
                  if (next.nodes[k]?.status === 'active') setNode(next, k, 'blocked')
                }
              }
              return {
                ...s,
                perAccount: { ...s.perAccount, [d.accountId]: next },
              }
            })
            return
          }
          if (msg.event === 'runError') {
            const d = msg.data as { accountId: string; reason: string }
            mutate((s) => {
              const run = s.perAccount[d.accountId]
              if (!run) return s
              const next = { ...run, decisions: [...run.decisions], nodes: { ...run.nodes } }
              next.outcome = 'error'
              next.blockedReason = d.reason
              pushDecision(next, {
                rawStage: 'error',
                text: `Stream error: ${d.reason.slice(0, 120)}`,
                tone: 'blocked',
              })
              return {
                ...s,
                perAccount: { ...s.perAccount, [d.accountId]: next },
              }
            })
            return
          }
          if (msg.event === 'batchDone') {
            mutate((s) => ({ ...s, active: false }))
            opts?.onComplete?.()
            if (anyOk) opts?.onCelebrate?.()
            return
          }
        },
      })
    },
    [mutate, opts],
  )

  return { state, run, selectCurrent, reset }
}

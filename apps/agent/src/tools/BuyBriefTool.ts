/**
 * BuyBriefTool — orchestrates a single account scout end-to-end.
 *
 * Flow:
 *   1. Autonomous decision: pick brief depth (lite/standard/deep) from topic ambiguity
 *   2. CHARGE: transfer 0.05 HBAR operator → escrow via kit (4-stage lifecycle fires)
 *   3. TAVILY: search the topic with the chosen depth
 *   4. LLM: synthesize markdown via Groq (Gemini fallback)
 *   5. RELEASE (success) OR REFUND (failure): transfer back from escrow
 *   6. Audit each step into HCS audit topic
 *
 * Returns a structured BriefResult with the synthesized brief markdown.
 * The dashboard surfaces it inline — no email side-channel.
 */
import { randomUUID } from 'node:crypto'
import { tavilySearch } from '../services/tavily.js'
import { synthesizeBrief } from '../services/llmRouter.js'
import { writeAuditEvent } from '../services/hcsAudit.js'
import { transferHbarViaKit } from '../agent.js'
import { escrowRefund, escrowRelease, type EscrowTransferResult } from '../hedera/escrow.js'
import {
  getLocalRolling24hSpend,
  logDecision,
  finalizeRun,
  touchAccount,
} from '@scoutbrief/shared'
import crypto from 'node:crypto'

const PER_BRIEF_HBAR = 0.05 // 5,000,000 tinybars — under the 50M per-brief cap

export interface BriefInput {
  topic: string
  accountName?: string
  accountId?: string
  runId?: string
  batchId?: string
  requestId?: string
}

export type BriefStep =
  | { stage: 'decision'; depth: 'lite' | 'standard' | 'deep'; reason: string }
  | { stage: 'charge'; ok: boolean; txOutput?: string; reason?: string }
  | { stage: 'tavily'; count: number; ms: number }
  | { stage: 'synth'; provider: 'groq' | 'gemini'; chars: number; ms: number }
  | { stage: 'release'; ok: boolean; txOutput?: string; reason?: string }
  | { stage: 'refund'; ok: boolean; txOutput?: string; reason?: string }
  | { stage: 'audit'; topic: string; ref: string }
  | { stage: 'blocked'; policyName?: string; reason: string }
  | { stage: 'error'; reason: string }

export interface BriefResult {
  requestId: string
  runId?: string
  accountId?: string
  ok: boolean
  steps: BriefStep[]
  briefMarkdown?: string
  policyName?: string
  reason?: string
}

export interface BuyBriefOptions {
  /** Optional callback for streaming step events (used by SSE endpoint). */
  onStep?: (step: BriefStep) => void
}

const PER_BRIEF_TINYBARS = Math.round(PER_BRIEF_HBAR * 100_000_000)

interface DecisionPersistInput {
  runId: string
  accountId: string
}

function persistDecision(
  ctx: DecisionPersistInput | null,
  step: BriefStep,
): void {
  if (!ctx) return
  const id = randomUUID()
  try {
    switch (step.stage) {
      case 'decision':
        logDecision({
          id,
          runId: ctx.runId,
          accountId: ctx.accountId,
          stage: 'decision',
          status: 'info',
          detail: { depth: step.depth, reason: step.reason },
        })
        break
      case 'charge':
        logDecision({
          id,
          runId: ctx.runId,
          accountId: ctx.accountId,
          stage: 'charge',
          status: step.ok ? 'ok' : 'blocked',
          policyName: 'CounterpartyAllowlistPolicy',
          hookName: 'HcsAuditTrailHook',
          detail: { ok: step.ok, reason: step.reason, txOutput: step.txOutput?.slice(0, 200) },
          txId: extractTxId(step.txOutput),
        })
        break
      case 'tavily':
        logDecision({
          id,
          runId: ctx.runId,
          accountId: ctx.accountId,
          stage: 'tavily',
          status: 'ok',
          detail: { count: step.count, ms: step.ms },
        })
        break
      case 'synth':
        logDecision({
          id,
          runId: ctx.runId,
          accountId: ctx.accountId,
          stage: 'synth',
          status: 'ok',
          detail: { provider: step.provider, chars: step.chars, ms: step.ms },
        })
        break
      case 'release':
        logDecision({
          id,
          runId: ctx.runId,
          accountId: ctx.accountId,
          stage: 'release',
          status: step.ok ? 'ok' : 'blocked',
          policyName: 'ContextualApprovalPolicy',
          detail: { ok: step.ok, reason: step.reason, txOutput: step.txOutput },
          txId: extractTxId(step.txOutput),
        })
        break
      case 'refund':
        logDecision({
          id,
          runId: ctx.runId,
          accountId: ctx.accountId,
          stage: 'refund',
          status: 'ok',
          detail: { ok: step.ok, reason: step.reason, txOutput: step.txOutput },
          txId: extractTxId(step.txOutput),
        })
        break
      case 'audit':
        logDecision({
          id,
          runId: ctx.runId,
          accountId: ctx.accountId,
          stage: 'audit',
          status: 'info',
          hookName: 'HcsAuditTrailHook',
          detail: { topic: step.topic, ref: step.ref },
          hcsRef: step.ref,
        })
        break
      case 'blocked':
        logDecision({
          id,
          runId: ctx.runId,
          accountId: ctx.accountId,
          stage: 'blocked',
          status: 'blocked',
          policyName: step.policyName ?? null,
          detail: { reason: step.reason },
        })
        break
      case 'error':
        logDecision({
          id,
          runId: ctx.runId,
          accountId: ctx.accountId,
          stage: 'error',
          status: 'blocked',
          detail: { reason: step.reason },
        })
        break
    }
  } catch (err) {
    console.error('[persistDecision] failed:', err)
  }
}

function extractTxId(txOutput?: string): string | null {
  if (!txOutput) return null
  const direct = txOutput.match(/\d+\.\d+\.\d+@\d+\.\d+/)
  if (direct && direct[0]) return direct[0]
  const fromUrl = txOutput.match(/transaction\/([^/?#]+)/)
  if (fromUrl && fromUrl[1]) return fromUrl[1]
  return null
}

export async function buyBrief(input: BriefInput, opts: BuyBriefOptions = {}): Promise<BriefResult> {
  const requestId = input.requestId ?? randomUUID()
  const steps: BriefStep[] = []
  const persistCtx: DecisionPersistInput | null =
    input.runId && input.accountId
      ? { runId: input.runId, accountId: input.accountId }
      : null
  const emit = (s: BriefStep): void => {
    steps.push(s)
    opts.onStep?.(s)
    persistDecision(persistCtx, s)
  }
  const operatorIdRaw = process.env.HEDERA_OPERATOR_ID
  const escrowIdRaw = process.env.HEDERA_ESCROW_ID
  if (!operatorIdRaw || !escrowIdRaw) throw new Error('Hedera env missing')
  const operatorId: string = operatorIdRaw
  const escrowId: string = escrowIdRaw

  // Collect every audit write here so we can await them all before returning.
  // Each entry resolves once HCS reaches consensus on the message; we don't
  // block the user-visible critical path on them — we only block return.
  const auditPromises: Promise<unknown>[] = []
  const queueAudit = (p: Promise<string>, label: string): void => {
    auditPromises.push(
      p
        .then((ref) => emit({ stage: 'audit', topic: process.env.HCS_AUDIT_TOPIC!, ref }))
        .catch((err) => console.error(`[buyBrief] audit (${label}) failed:`, err)),
    )
  }

  const accountTag = input.accountName ?? input.topic
  const accountHash = sha(accountTag)

  // 1. Autonomous decision: depth
  const depth = decideDepth(input.topic)
  emit({
    stage: 'decision',
    depth,
    reason: `topic ambiguity → ${depth}; budget conservative`,
  })

  // Intent logged at the start — fire async, awaited at the end.
  queueAudit(
    writeAuditEvent({
      eventType: 'intent_logged',
      requestId,
      params: {
        topic: input.topic,
        depth,
        account_hash: accountHash,
        account_id: input.accountId ?? null,
        run_id: input.runId ?? null,
        batch_id: input.batchId ?? null,
      },
      decisionTrace: `depth=${depth}`,
    }),
    'intent',
  )

  // 2. CHARGE — fires the full V4 policy chain on transfer_hbar_tool
  const charge = await transferHbarViaKit({
    fromAccountId: operatorId,
    toAccountId: escrowId,
    hbar: PER_BRIEF_HBAR,
    memo: `scoutbrief:charge:${requestId}`,
  })
  emit({
    stage: 'charge',
    ok: charge.ok,
    txOutput: charge.rawOutput.slice(0, 400),
    reason: charge.reason,
  })
  if (!charge.ok) {
    emit({
      stage: 'blocked',
      policyName: charge.policyName,
      reason: charge.reason ?? 'charge denied',
    })
    if (persistCtx) {
      finalizeRun({
        id: persistCtx.runId,
        status: 'blocked',
        blockedPolicy: charge.policyName ?? null,
        blockedReason: charge.reason ?? 'charge denied',
        costTinybars: 0,
      })
      touchAccount(persistCtx.accountId, 'blocked')
    }
    return {
      requestId,
      runId: input.runId,
      accountId: input.accountId,
      ok: false,
      steps,
      policyName: charge.policyName,
      reason: charge.reason,
    }
  }

  // 3. TAVILY
  let tavilyResults: Awaited<ReturnType<typeof tavilySearch>>
  try {
    tavilyResults = await tavilySearch({ query: input.topic, depth })
    emit({ stage: 'tavily', count: tavilyResults.results.length, ms: tavilyResults.ms })
  } catch (err) {
    return await fail(err, 'tavily failed')
  }

  // 4. LLM SYNTH
  let brief: Awaited<ReturnType<typeof synthesizeBrief>>
  try {
    brief = await synthesizeBrief({
      topic: input.topic,
      depth,
      sources: tavilyResults.results.map((r) => ({
        title: r.title,
        url: r.url,
        content: r.content,
      })),
    })
    emit({ stage: 'synth', provider: brief.provider, chars: brief.text.length, ms: brief.ms })
  } catch (err) {
    return await fail(err, 'synth failed')
  }

  // 5. RELEASE escrow → operator (real on-chain HBAR transfer, signed by escrow key)
  const release = await escrowRelease({
    toAccountId: operatorId,
    hbar: PER_BRIEF_HBAR,
    memo: `scoutbrief:release:${requestId}`,
  })
  emit({
    stage: 'release',
    ok: release.ok,
    txOutput: release.hashScanUrl ?? release.txId ?? '',
    reason: release.error,
  })
  // Audit the release tx separately so HCS records every on-chain action
  // (the kit's built-in hook only logs charges; release/refund sign with the
  // escrow key and bypass the kit's lifecycle).
  if (release.ok && release.txId) {
    queueAudit(
      writeAuditEvent({
        eventType: 'release_executed',
        requestId,
        params: {
          tinybars: Math.round(PER_BRIEF_HBAR * 100_000_000),
          recipient: operatorId,
        },
        txIds: [release.txId],
      }),
      'release',
    )
  }

  // 6. Final audit event
  queueAudit(
    writeAuditEvent({
      eventType: 'decision_complete',
      requestId,
      params: {
        topic: input.topic,
        depth,
        account_hash: accountHash,
        account_id: input.accountId ?? null,
        provider: brief.provider,
        brief_chars: brief.text.length,
        local_24h_spend_tinybars: getLocalRolling24hSpend(),
      },
    }),
    'final',
  )

  // Block return until every audit has reached HCS consensus. This guarantees
  // the topic always shows the full {intent, charge, release, complete} chain
  // before we surface the result to the caller (or close the process).
  await Promise.allSettled(auditPromises)

  if (persistCtx) {
    const chargeTx = extractTxId(steps.find((s) => s.stage === 'charge')?.txOutput)
    const releaseTx = extractTxId(steps.find((s) => s.stage === 'release')?.txOutput)
    const auditStep = steps.find((s) => s.stage === 'audit')
    finalizeRun({
      id: persistCtx.runId,
      status: 'ok',
      costTinybars: PER_BRIEF_TINYBARS,
      briefMarkdown: brief.text,
      chargeTx,
      releaseTx,
      auditTopic: auditStep?.topic ?? null,
      auditConsensus: auditStep?.ref ?? null,
    })
    touchAccount(persistCtx.accountId, 'ok')
  }

  return {
    requestId,
    runId: input.runId,
    accountId: input.accountId,
    ok: true,
    steps,
    briefMarkdown: brief.text,
  }

  /** Internal failure handler: refund the charge, return structured result. */
  async function fail(err: unknown, label: string): Promise<BriefResult> {
    const reason = err instanceof Error ? err.message : String(err)
    emit({ stage: 'error', reason: `${label}: ${reason}` })

    // Best-effort refund (we still have escrow funds from the charge)
    const refund: EscrowTransferResult = await escrowRefund({
      toAccountId: operatorId,
      hbar: PER_BRIEF_HBAR,
      memo: `scoutbrief:refund:${requestId}`,
    })
    emit({
      stage: 'refund',
      ok: refund.ok,
      txOutput: refund.hashScanUrl ?? refund.txId ?? '',
      reason: refund.error,
    })

    queueAudit(
      writeAuditEvent({
        eventType: 'refund_issued',
        requestId,
        params: {
          topic: input.topic,
          label,
          error: reason.slice(0, 240),
          tinybars: Math.round(PER_BRIEF_HBAR * 100_000_000),
        },
        txIds: refund.txId ? [refund.txId] : undefined,
      }),
      'refund',
    )

    await Promise.allSettled(auditPromises)

    if (persistCtx) {
      const refundTx = extractTxId(steps.find((s) => s.stage === 'refund')?.txOutput)
      const chargeTx = extractTxId(steps.find((s) => s.stage === 'charge')?.txOutput)
      finalizeRun({
        id: persistCtx.runId,
        status: refundTx ? 'refunded' : 'error',
        blockedReason: reason.slice(0, 240),
        costTinybars: 0,
        chargeTx,
        refundTx,
      })
      touchAccount(persistCtx.accountId, refundTx ? 'refunded' : 'blocked')
    }

    return {
      requestId,
      runId: input.runId,
      accountId: input.accountId,
      ok: false,
      steps,
      reason,
    }
  }
}

/**
 * Autonomous depth decision based on topic ambiguity.
 * Heuristic:
 *   - <= 1 word: lite (likely well-known)
 *   - 2-3 words: standard
 *   - longer with qualifiers: deep
 */
function decideDepth(topic: string): 'lite' | 'standard' | 'deep' {
  const tokens = topic.trim().split(/\s+/).filter(Boolean)
  if (tokens.length <= 1) return 'lite'
  if (tokens.length <= 3) return 'standard'
  return 'deep'
}

function sha(input: string): string {
  return crypto.createHash('sha256').update(input).digest('hex')
}

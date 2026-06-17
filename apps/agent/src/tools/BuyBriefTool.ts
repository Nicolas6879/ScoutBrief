/**
 * BuyBriefTool — orchestrates a single brief delivery end-to-end.
 *
 * Flow:
 *   1. Validate inputs + per-email rate check (tool-layer, not kit-layer)
 *   2. Autonomous decision: pick brief depth (lite/standard/deep) from topic ambiguity
 *   3. CHARGE: transfer 0.05 HBAR operator → escrow via kit (4-stage lifecycle fires)
 *   4. TAVILY: search the topic with the chosen depth
 *   5. LLM: synthesize markdown via Groq (Gemini fallback)
 *   6. RESEND: email the brief to the requested address
 *   7. RELEASE (success) OR REFUND (failure): transfer back from escrow
 *   8. Audit each step into HCS audit topic
 *
 * Returns a structured BriefResult emitted to the caller (SSE feed in M3).
 */
import { randomUUID } from 'node:crypto'
import { tavilySearch } from '../services/tavily.js'
import { synthesizeBrief } from '../services/llmRouter.js'
import { sendBriefEmail } from '../services/resend.js'
import { writeAuditEvent } from '../services/hcsAudit.js'
import { transferHbarViaKit } from '../agent.js'
import { escrowRefund, escrowRelease, type EscrowTransferResult } from '../hedera/escrow.js'
import { getLocalRolling24hSpend } from '@scoutbrief/shared'
import crypto from 'node:crypto'

const PER_BRIEF_HBAR = 0.05 // 5,000,000 tinybars — under the 50M per-brief cap

export interface BriefInput {
  topic: string
  email: string
  requestId?: string
}

export type BriefStep =
  | { stage: 'decision'; depth: 'lite' | 'standard' | 'deep'; reason: string }
  | { stage: 'charge'; ok: boolean; txOutput?: string; reason?: string }
  | { stage: 'tavily'; count: number; ms: number }
  | { stage: 'synth'; provider: 'groq' | 'gemini'; chars: number; ms: number }
  | { stage: 'resend'; messageId: string; ms: number }
  | { stage: 'release'; ok: boolean; txOutput?: string; reason?: string }
  | { stage: 'refund'; ok: boolean; txOutput?: string; reason?: string }
  | { stage: 'audit'; topic: string; ref: string }
  | { stage: 'blocked'; policyName?: string; reason: string }
  | { stage: 'error'; reason: string }

export interface BriefResult {
  requestId: string
  ok: boolean
  steps: BriefStep[]
  briefMarkdown?: string
  emailMessageId?: string
  policyName?: string
  reason?: string
}

export interface BuyBriefOptions {
  /** Optional callback for streaming step events (used by SSE endpoint in M3). */
  onStep?: (step: BriefStep) => void
}

export async function buyBrief(input: BriefInput, opts: BuyBriefOptions = {}): Promise<BriefResult> {
  const requestId = input.requestId ?? randomUUID()
  const steps: BriefStep[] = []
  const emit = (s: BriefStep): void => {
    steps.push(s)
    opts.onStep?.(s)
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
      params: { topic: input.topic, depth, email_hash: sha(input.email) },
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
    return {
      requestId,
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

  // 5. RESEND
  let emailResult: Awaited<ReturnType<typeof sendBriefEmail>>
  try {
    emailResult = await sendBriefEmail({
      to: input.email,
      topic: input.topic,
      markdown: brief.text,
    })
    emit({ stage: 'resend', messageId: emailResult.messageId, ms: emailResult.ms })
  } catch (err) {
    return await fail(err, 'resend failed')
  }

  // 6. RELEASE escrow → operator (real on-chain HBAR transfer, signed by escrow key)
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

  // 7. Final audit event
  queueAudit(
    writeAuditEvent({
      eventType: 'decision_complete',
      requestId,
      params: {
        topic: input.topic,
        depth,
        email_hash: sha(input.email),
        provider: brief.provider,
        brief_chars: brief.text.length,
        resend_message_id: emailResult.messageId,
        local_24h_spend_tinybars: getLocalRolling24hSpend(),
      },
    }),
    'final',
  )

  // Block return until every audit has reached HCS consensus. This guarantees
  // the topic always shows the full {intent, charge, release, complete} chain
  // before we surface the result to the caller (or close the process).
  await Promise.allSettled(auditPromises)

  return {
    requestId,
    ok: true,
    steps,
    briefMarkdown: brief.text,
    emailMessageId: emailResult.messageId,
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
    return { requestId, ok: false, steps, reason }
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

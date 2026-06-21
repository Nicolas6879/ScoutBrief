/**
 * Stage 6 (Post-Core-Action, BLOCKING): contextual approval / settlement hold.
 *
 * Brief category: "contextual approval logic enforced at runtime"
 *
 * Side-effect: creates a SETTLEMENT HOLD row in SQLite for transfers FROM
 * escrow to the operator (i.e., releases). The hold expires after
 * SETTLEMENT_HOLD_MINUTES and is resolved by either:
 *   - Downstream success signal → release proceeds
 *   - Downstream failure / timeout → refund the buyer instead
 *   - Timer expires without signal → default to release (optimistic)
 *
 * The policy itself never BLOCKS in the normal path; "approval" is enforced
 * asynchronously via the hold state machine. Exception: refuses to allow
 * a transfer whose recipient is not the operator (defense in depth — the
 * counterparty policy already enforces this at pre-tool, this is belt + suspenders).
 */
import { AbstractPolicy } from '@hashgraph/hedera-agent-kit'
import type { PostCoreActionParams } from '@hashgraph/hedera-agent-kit'
import { createHold } from '@scoutbrief/shared'
import { randomUUID } from 'node:crypto'

export class ContextualApprovalPolicy extends AbstractPolicy {
  name = 'ContextualApprovalPolicy'
  description = 'Schedules a settlement hold for releases; resolved via webhook or timer.'
  relevantTools: string[]

  private readonly settlementHoldMinutes: number
  private readonly escrowAccountId: string
  private readonly trustedReleaseRecipients: Set<string>

  constructor(opts?: {
    relevantTools?: string[]
    settlementHoldMinutes?: number
    escrowAccountId?: string
    trustedReleaseRecipients?: string[]
  }) {
    super()
    this.relevantTools = opts?.relevantTools ?? ['transfer_hbar_tool']
    this.settlementHoldMinutes = opts?.settlementHoldMinutes ??
      Number(process.env.SETTLEMENT_HOLD_MINUTES ?? 10)
    this.escrowAccountId = opts?.escrowAccountId ?? process.env.HEDERA_ESCROW_ID ?? ''
    const fromEnv = [process.env.HEDERA_OPERATOR_ID].filter((v): v is string => !!v)
    this.trustedReleaseRecipients = new Set(opts?.trustedReleaseRecipients ?? fromEnv)
  }

  protected override async shouldBlockPostCoreAction(
    params: PostCoreActionParams,
    method: string,
  ): Promise<boolean> {
    if (!this.relevantTools.includes(method)) return false

    const transfers = extractTransfers(params.normalisedParams ?? params.rawParams)
    if (transfers.length === 0) return false

    // Identify if this is a RELEASE (escrow → trusted recipient) — we only hold those.
    const escrowOutgoing = transfers.find(
      (t) => t.accountId === this.escrowAccountId && t.tinybars < 0,
    )
    if (!escrowOutgoing) {
      // Not a release from escrow; let it pass (charges INTO escrow are unrestricted).
      return false
    }
    const recipient = transfers.find(
      (t) => t.accountId !== this.escrowAccountId && t.tinybars > 0,
    )
    if (!recipient) return false

    // Defense in depth: refuse if recipient isn't in our trusted set.
    if (!this.trustedReleaseRecipients.has(recipient.accountId)) {
      console.warn(
        `[${this.name}] BLOCK: release recipient ${recipient.accountId} not trusted`,
      )
      return true
    }

    // Record the hold; release/refund decision is resolved by the orchestrator
    // (success → release, failure → refund) or expires to release after timeout.
    const nonce = randomUUID()
    try {
      createHold({
        nonce,
        requestId: params.context.accountId ?? 'unknown',
        buyer: this.escrowAccountId,
        tinybars: recipient.tinybars,
        releaseTo: recipient.accountId,
        holdMs: this.settlementHoldMinutes * 60_000,
      })
    } catch (err) {
      console.error(`[${this.name}] createHold failed:`, err)
      // Don't block on local DB failure; the transfer is already approved
      // for release by the time we're at post-core.
    }
    return false
  }
}

interface TransferRow {
  accountId: string
  tinybars: number
}

function extractTransfers(params: unknown): TransferRow[] {
  if (!params || typeof params !== 'object') return []
  const p = params as Record<string, unknown>
  // Normalised first (already in tinybars with sign)
  const normalised = (p.hbarTransfers ?? p.hbar_transfers) as unknown
  if (Array.isArray(normalised)) {
    const rows: TransferRow[] = []
    for (const t of normalised) {
      if (!t || typeof t !== 'object') continue
      const rec = t as Record<string, unknown>
      const accountId = String(rec.accountId ?? rec.account_id ?? '')
      const amount = rec.amount ?? rec.value
      const num = typeof amount === 'number' ? amount : Number(amount)
      if (!accountId || !Number.isFinite(num)) continue
      rows.push({ accountId, tinybars: num })
    }
    return rows
  }
  // Raw schema: only recipients in transfers + sourceAccountId for sender.
  const raw = p.transfers as unknown
  if (Array.isArray(raw)) {
    const rows: TransferRow[] = []
    let totalRecipientTinybars = 0
    for (const t of raw) {
      if (!t || typeof t !== 'object') continue
      const rec = t as Record<string, unknown>
      const accountId = String(rec.accountId ?? rec.account_id ?? '')
      const amount = rec.amount ?? rec.value
      const num = typeof amount === 'number' ? amount : Number(amount)
      if (!accountId || !Number.isFinite(num)) continue
      const tinybars = Math.round(num * 100_000_000)
      rows.push({ accountId, tinybars })
      if (tinybars > 0) totalRecipientTinybars += tinybars
    }
    const sourceId = String(p.sourceAccountId ?? p.source_account_id ?? '')
    if (sourceId && totalRecipientTinybars > 0) {
      rows.push({ accountId: sourceId, tinybars: -totalRecipientTinybars })
    }
    return rows
  }
  return []
}

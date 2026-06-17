/**
 * Stage 2 (Pre-Tool, BLOCKING): counterparty allowlist + per-recipient cap.
 *
 * Brief category: "allowed counterparties"
 *
 * Blocks HBAR transfers whose recipient is NOT in our allowlist (escrow + operator),
 * and rate-limits transfers TO the operator (anti-spam — at most N per day per recipient).
 *
 * The "endpoint allowlist" semantics that apply to Tavily/Resend live in the
 * BuyBriefTool itself: the tool only calls those two endpoints, so the
 * counterparty restriction at the HBAR layer enforces "agent can only move money
 * to/from accounts we trust."
 */
import { AbstractPolicy } from '@hashgraph/hedera-agent-kit'
import type {
  PreToolExecutionParams,
  PostParamsNormalizationParams,
} from '@hashgraph/hedera-agent-kit'
import { getRecipientCountLast24h, logRecipient } from '@scoutbrief/shared'
import crypto from 'node:crypto'

export class CounterpartyAllowlistPolicy extends AbstractPolicy {
  name = 'CounterpartyAllowlistPolicy'
  description = 'Blocks HBAR transfers to non-allowlisted accounts and enforces per-recipient daily caps.'
  relevantTools: string[]

  private readonly allowedAccounts: Set<string>
  private readonly perRecipientDailyLimit: number

  constructor(opts?: {
    relevantTools?: string[]
    allowedAccounts?: string[]
    perRecipientDailyLimit?: number
  }) {
    super()
    this.relevantTools = opts?.relevantTools ?? ['transfer_hbar_tool']
    const fromEnv = [
      process.env.HEDERA_OPERATOR_ID,
      process.env.HEDERA_ESCROW_ID,
    ].filter((v): v is string => !!v)
    this.allowedAccounts = new Set(opts?.allowedAccounts ?? fromEnv)
    this.perRecipientDailyLimit = opts?.perRecipientDailyLimit ??
      Number(process.env.PER_RECIPIENT_DAILY_LIMIT ?? 3)
  }

  protected override async shouldBlockPreToolExecution(
    params: PreToolExecutionParams,
    method: string,
  ): Promise<boolean> {
    if (!this.relevantTools.includes(method)) return false

    const recipients = extractRecipients(params.rawParams)
    if (recipients.length === 0) {
      console.warn(`[${this.name}] No recipients extracted from params for ${method}`)
      return false
    }

    for (const recipient of recipients) {
      if (!this.allowedAccounts.has(recipient)) {
        console.warn(
          `[${this.name}] BLOCK: recipient ${recipient} not in allowlist [${[...this.allowedAccounts].join(', ')}]`,
        )
        return true
      }

      // Anti-spam: at most N transfers per recipient per 24h, hashed for log privacy
      const recipientHash = crypto.createHash('sha256').update(recipient).digest('hex')
      const count = getRecipientCountLast24h(recipientHash)
      if (count >= this.perRecipientDailyLimit) {
        console.warn(
          `[${this.name}] BLOCK: recipient ${recipient} hit daily limit (${count}/${this.perRecipientDailyLimit})`,
        )
        return true
      }
      // Log the recipient (only after PASSING the check so we don't penalize blocked attempts)
      logRecipient(recipientHash, params.context.accountId ?? 'unknown')
    }
    return false
  }

  /**
   * Default no-op for post-param-norm; kept here to make the policy's three
   * stages explicit when reading.
   */
  protected override async shouldBlockPostParamsNormalization(
    _params: PostParamsNormalizationParams,
    _method: string,
  ): Promise<boolean> {
    return false
  }
}

/**
 * The HBAR transfer tool's raw params at Pre-Tool stage:
 *   { transfers: [{ accountId, amount }, ...], sourceAccountId? }
 * Where transfers contains RECIPIENTS ONLY (positive HBAR amounts).
 *
 * Defensive: handles alternate field names from normalised payloads, where the
 * post-param-norm stage may produce `hbarTransfers: [...both sides...]`.
 */
function extractRecipients(rawParams: unknown): string[] {
  if (!rawParams || typeof rawParams !== 'object') return []
  const p = rawParams as Record<string, unknown>
  const transfers = (p.transfers ?? p.hbarTransfers ?? p.hbar_transfers) as unknown
  if (!Array.isArray(transfers)) return []
  return transfers
    .filter((t): t is Record<string, unknown> => !!t && typeof t === 'object')
    .filter((t) => {
      // Recipients are positive amounts; if no amount info, treat as recipient.
      const amount = t.amount ?? t.value
      if (amount === undefined) return true
      const num = typeof amount === 'number' ? amount : Number(amount)
      return Number.isFinite(num) && num > 0
    })
    .map((t) => String(t.accountId ?? t.account_id ?? ''))
    .filter((s) => s.length > 0)
}

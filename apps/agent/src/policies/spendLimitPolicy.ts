/**
 * Stage 4 (Post-Parameter-Normalization, BLOCKING): spend limit enforcement.
 *
 * Brief category: "spend limits"
 *
 * Re-fetches the live escrow HBAR balance via Mirror Node at execution time
 * (the canonical V4 doc pattern for protecting against state changes between
 * planning and execution), and blocks the transfer if either:
 *   1. This single transfer exceeds the per-brief cap, OR
 *   2. The rolling 24h spend + this transfer exceeds the daily cap.
 *
 * Fail-safe: if Mirror Node is unreachable, we BLOCK rather than allow — we
 * cannot guarantee safety without fresh data.
 */
import { randomUUID } from 'node:crypto'
import { AbstractPolicy } from '@hashgraph/hedera-agent-kit'
import type { PostParamsNormalizationParams } from '@hashgraph/hedera-agent-kit'
import { getLocalRolling24hSpend, logSpend } from '@scoutbrief/shared'

interface MirrorNodeTransfer {
  account: string
  amount: number // tinybars; negative = outgoing from this account
}

interface MirrorNodeTxResponse {
  transactions?: Array<{
    consensus_timestamp: string
    transfers?: MirrorNodeTransfer[]
  }>
}

export class SpendLimitPolicy extends AbstractPolicy {
  name = 'SpendLimitPolicy'
  description = 'Enforces per-brief and rolling 24h HBAR spend caps. Re-fetches live state via Mirror Node.'
  relevantTools: string[]

  private readonly perBriefCapTinybars: number
  private readonly dailyCapTinybars: number
  private readonly escrowAccountId: string
  private readonly mirrorNodeBase: string

  // Tiny in-memory cache to avoid Mirror Node rate limiting between
  // close-in-time calls. 30s TTL is short enough to catch real drift,
  // long enough to absorb a charge+release pair from one brief.
  private cache: { fetchedAt: number; rolling24h: number } | null = null
  private readonly cacheTtlMs = 30_000

  constructor(opts?: {
    relevantTools?: string[]
    perBriefCapTinybars?: number
    dailyCapTinybars?: number
    escrowAccountId?: string
    mirrorNodeBase?: string
  }) {
    super()
    this.relevantTools = opts?.relevantTools ?? ['transfer_hbar_tool']
    this.perBriefCapTinybars = opts?.perBriefCapTinybars ??
      Number(process.env.PER_BRIEF_CAP_TINYBARS ?? 50_000_000)
    this.dailyCapTinybars = opts?.dailyCapTinybars ??
      Number(process.env.DAILY_CAP_TINYBARS ?? 1_000_000_000)
    this.escrowAccountId = opts?.escrowAccountId ?? process.env.HEDERA_ESCROW_ID ?? ''
    this.mirrorNodeBase = opts?.mirrorNodeBase ??
      process.env.MIRROR_NODE_REST ??
      'https://testnet.mirrornode.hedera.com/api/v1'
  }

  protected override async shouldBlockPostParamsNormalization(
    params: PostParamsNormalizationParams,
    method: string,
  ): Promise<boolean> {
    if (!this.relevantTools.includes(method)) return false
    const transferTinybars = extractOutgoingTinybars(params.normalisedParams ?? params.rawParams)
    if (transferTinybars <= 0) return false

    // Check 1: per-brief cap
    if (transferTinybars > this.perBriefCapTinybars) {
      console.warn(
        `[${this.name}] BLOCK per-brief: ${transferTinybars} > ${this.perBriefCapTinybars} tinybars`,
      )
      return true
    }

    // Check 2: rolling 24h cap. Mirror Node provides ground truth; local SQLite
    // is just a faster local mirror used as fallback.
    let rolling24h: number
    try {
      rolling24h = await this.getRolling24hOutgoing()
    } catch (err) {
      console.error(`[${this.name}] Mirror Node unreachable, failing SAFE (block)`, err)
      return true
    }

    const projected = rolling24h + transferTinybars
    if (projected > this.dailyCapTinybars) {
      console.warn(
        `[${this.name}] BLOCK 24h: ${projected} > ${this.dailyCapTinybars} tinybars`,
      )
      return true
    }

    // Log spend with a UNIQUE id per brief so the rolling daily total accumulates.
    // (Keying on the operator accountId collapsed every brief onto one row via
    // INSERT OR REPLACE, freezing daily_used at a single brief's cost.) Prefer the
    // requestId embedded in the transfer memo; fall back to a random id.
    const paramsBlob = JSON.stringify(params.normalisedParams ?? params.rawParams ?? {})
    const spendId = paramsBlob.match(/scoutbrief:charge:([\w-]+)/)?.[1] ?? randomUUID()
    logSpend({
      requestId: spendId,
      tinybars: transferTinybars,
      stage: 'planned',
    })
    return false
  }

  /**
   * Sum negative HBAR transfers FROM the escrow account in the last 24h.
   * Uses Mirror Node REST + a small in-memory cache.
   */
  private async getRolling24hOutgoing(): Promise<number> {
    if (this.cache && Date.now() - this.cache.fetchedAt < this.cacheTtlMs) {
      return this.cache.rolling24h
    }
    if (!this.escrowAccountId) {
      // No escrow configured: fall back to local SQLite estimate. Acceptable
      // because the daily cap is a safety net, not the primary enforcement
      // (per-brief cap already enforced above).
      return getLocalRolling24hSpend()
    }

    // Mirror Node timestamps are in `seconds.nanos` format (consensus timestamps).
    const sinceSeconds = Math.floor((Date.now() - 24 * 60 * 60 * 1000) / 1000)
    const url = `${this.mirrorNodeBase}/transactions?account.id=${encodeURIComponent(this.escrowAccountId)}&timestamp=gte:${sinceSeconds}.000000000&limit=100&order=desc`
    const resp = await fetch(url, { headers: { Accept: 'application/json' } })
    if (!resp.ok) throw new Error(`Mirror Node ${resp.status}`)
    const data = (await resp.json()) as MirrorNodeTxResponse
    const txs = data.transactions ?? []
    let outgoing = 0
    for (const tx of txs) {
      for (const t of tx.transfers ?? []) {
        if (t.account === this.escrowAccountId && t.amount < 0) {
          outgoing += -t.amount
        }
      }
    }
    this.cache = { fetchedAt: Date.now(), rolling24h: outgoing }
    return outgoing
  }
}

/**
 * Convert an amount value (Hbar instance, number HBAR, number tinybars, or BigNumber)
 * into signed tinybars. Returns NaN if the shape is unrecognized.
 *
 * - Plain number → assumed HBAR (from raw user input)
 * - Hbar instance → use .toTinybars().toNumber()
 * - bigint → tinybars
 * - object with .toNumber() → call it (BigNumber)
 */
function amountToTinybars(amount: unknown, assumeHbar = false): number {
  if (amount == null) return NaN
  if (typeof amount === 'number') {
    return assumeHbar ? Math.round(amount * 100_000_000) : amount
  }
  if (typeof amount === 'bigint') return Number(amount)
  if (typeof amount === 'object') {
    const obj = amount as Record<string, unknown>
    const tb = obj.toTinybars as unknown
    if (typeof tb === 'function') {
      const result = (tb as () => unknown).call(amount)
      if (typeof result === 'number') return result
      if (typeof result === 'bigint') return Number(result)
      if (result && typeof result === 'object') {
        const r = result as Record<string, unknown>
        if (typeof r.toNumber === 'function') return (r.toNumber as () => number).call(result)
        if (typeof r.toString === 'function') {
          const n = Number((r.toString as () => string).call(result))
          if (Number.isFinite(n)) return n
        }
      }
    }
    const toNum = obj.toNumber as unknown
    if (typeof toNum === 'function') {
      const n = (toNum as () => number).call(amount)
      if (Number.isFinite(n)) return assumeHbar ? Math.round(n * 100_000_000) : n
    }
  }
  return NaN
}

/**
 * Sum the outgoing HBAR transfers, returning tinybars.
 *
 * Two possible shapes:
 *   - Raw kit schema: { transfers: [{accountId, amount(HBAR positive)}, ...] }
 *   - Normalised:     { hbarTransfers: [{accountId, amount(Hbar instance, signed)}, ...] }
 */
function extractOutgoingTinybars(params: unknown): number {
  if (!params || typeof params !== 'object') return 0
  const p = params as Record<string, unknown>

  const normalised = (p.hbarTransfers ?? p.hbar_transfers) as unknown
  if (Array.isArray(normalised)) {
    let outgoing = 0
    for (const t of normalised) {
      if (!t || typeof t !== 'object') continue
      const amount = (t as Record<string, unknown>).amount ?? (t as Record<string, unknown>).value
      const tb = amountToTinybars(amount, false)
      if (Number.isFinite(tb) && tb < 0) outgoing += -tb
    }
    return outgoing
  }

  const raw = p.transfers as unknown
  if (Array.isArray(raw)) {
    let outgoing = 0
    for (const t of raw) {
      if (!t || typeof t !== 'object') continue
      const amount = (t as Record<string, unknown>).amount ?? (t as Record<string, unknown>).value
      const tb = amountToTinybars(amount, true)
      if (Number.isFinite(tb) && tb > 0) outgoing += tb
    }
    return outgoing
  }
  return 0
}

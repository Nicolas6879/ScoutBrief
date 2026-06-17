/**
 * Escrow transfer helpers — release & refund.
 *
 * The kit's transfer_hbar_tool signs with the operator's client key, so we
 * cannot use it for "escrow → X" transfers (the escrow has its own ED25519
 * keypair that must co-sign). These helpers do the explicit freezeWith + sign
 * pattern using the escrow's DER-encoded private key.
 *
 * Note: release/refund do NOT pass through the V4 policy chain. The brief's
 * gating happens on the CHARGE step (operator → escrow), which is the gate
 * users actually need to be protected against. Once funds reach escrow, the
 * settlement direction (release vs refund) is an internal accounting move
 * determined by post-core outcomes.
 */
import {
  AccountId,
  Hbar,
  HbarUnit,
  PrivateKey,
  TransferTransaction,
} from '@hiero-ledger/sdk'
import { getHederaClient } from './client.js'

let cachedEscrowKey: PrivateKey | null = null
function getEscrowKey(): PrivateKey {
  if (cachedEscrowKey) return cachedEscrowKey
  const der = process.env.HEDERA_ESCROW_KEY
  if (!der) throw new Error('HEDERA_ESCROW_KEY missing')
  cachedEscrowKey = PrivateKey.fromStringDer(der)
  return cachedEscrowKey
}

export interface EscrowTransferResult {
  ok: boolean
  txId?: string
  hashScanUrl?: string
  status?: string
  error?: string
}

function txIdToHashScanUrl(txId: string): string {
  const match = txId.match(/^(\d+\.\d+\.\d+)@(\d+)\.(\d+)$/)
  if (!match) return `https://hashscan.io/testnet/transaction/${txId}`
  return `https://hashscan.io/testnet/transaction/${match[1]}-${match[2]}-${match[3]}`
}

/**
 * Move HBAR FROM escrow TO `toAccountId`. Signed by both operator (fee payer
 * via client) and escrow (debiter, via explicit sign).
 */
async function escrowTransfer(
  toAccountId: string,
  tinybars: number,
  memo: string,
): Promise<EscrowTransferResult> {
  const escrowIdStr = process.env.HEDERA_ESCROW_ID
  if (!escrowIdStr) return { ok: false, error: 'HEDERA_ESCROW_ID missing' }

  const client = getHederaClient()
  const escrowId = AccountId.fromString(escrowIdStr)
  const toId = AccountId.fromString(toAccountId)
  const escrowKey = getEscrowKey()

  try {
    const tx = await new TransferTransaction()
      .addHbarTransfer(escrowId, Hbar.fromTinybars(-tinybars))
      .addHbarTransfer(toId, Hbar.fromTinybars(tinybars))
      .setTransactionMemo(memo)
      .freezeWith(client)
    const signed = await tx.sign(escrowKey)
    const submitted = await signed.execute(client)
    const receipt = await submitted.getReceipt(client)
    const txId = submitted.transactionId.toString()
    const status = receipt.status.toString()
    if (status !== 'SUCCESS') {
      return { ok: false, txId, status, error: `Receipt status: ${status}` }
    }
    return { ok: true, txId, status, hashScanUrl: txIdToHashScanUrl(txId) }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

/**
 * Release escrow funds to the seller (operator for our demo).
 * Used after a successful brief delivery.
 */
export async function escrowRelease(args: {
  toAccountId: string
  hbar: number
  memo?: string
}): Promise<EscrowTransferResult> {
  const tinybars = Math.round(args.hbar * 100_000_000)
  return escrowTransfer(args.toAccountId, tinybars, args.memo ?? 'scoutbrief:release')
}

/**
 * Refund escrow funds to the buyer (operator for our demo).
 * Used when a policy blocks or a downstream service fails.
 */
export async function escrowRefund(args: {
  toAccountId: string
  hbar: number
  memo?: string
}): Promise<EscrowTransferResult> {
  const tinybars = Math.round(args.hbar * 100_000_000)
  return escrowTransfer(args.toAccountId, tinybars, args.memo ?? 'scoutbrief:refund')
}

export function tinybarsToHbar(tb: number): number {
  return Number(Hbar.fromTinybars(tb).to(HbarUnit.Hbar))
}

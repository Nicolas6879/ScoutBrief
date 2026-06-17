/**
 * Facilitator-side Hedera client + transfer helpers.
 *
 * Three flows:
 *   1. charge(): operator (acting as buyer) → escrow
 *   2. release(): escrow → seller account (for demo, settles back to operator)
 *   3. refund(): escrow → original buyer
 *
 * Each returns a real on-chain TransferTransaction visible on HashScan.
 */
import {
  AccountId,
  Client,
  Hbar,
  HbarUnit,
  PrivateKey,
  TransferTransaction,
} from '@hashgraph/sdk'

let cachedClient: Client | null = null
let cachedEscrowKey: PrivateKey | null = null

export interface OperatorContext {
  client: Client
  operatorId: AccountId
  operatorKey: PrivateKey
  escrowId: AccountId
  escrowKey: PrivateKey
}

export function getContext(): OperatorContext {
  if (cachedClient && cachedEscrowKey) {
    return {
      client: cachedClient,
      operatorId: cachedClient.operatorAccountId!,
      operatorKey: PrivateKey.fromStringDer(process.env.HEDERA_OPERATOR_KEY!),
      escrowId: AccountId.fromString(process.env.HEDERA_ESCROW_ID!),
      escrowKey: cachedEscrowKey,
    }
  }

  const operatorIdStr = process.env.HEDERA_OPERATOR_ID
  const operatorKeyDer = process.env.HEDERA_OPERATOR_KEY
  const escrowIdStr = process.env.HEDERA_ESCROW_ID
  const escrowKeyDer = process.env.HEDERA_ESCROW_KEY

  if (!operatorIdStr || !operatorKeyDer || !escrowIdStr || !escrowKeyDer) {
    throw new Error(
      'Missing Hedera env: HEDERA_OPERATOR_ID, HEDERA_OPERATOR_KEY, HEDERA_ESCROW_ID, HEDERA_ESCROW_KEY',
    )
  }

  const operatorKey = PrivateKey.fromStringDer(operatorKeyDer)
  const escrowKey = PrivateKey.fromStringDer(escrowKeyDer)
  const operatorId = AccountId.fromString(operatorIdStr)
  const escrowId = AccountId.fromString(escrowIdStr)

  const client = Client.forTestnet()
  client.setOperator(operatorId, operatorKey)
  client.setDefaultMaxTransactionFee(new Hbar(2))
  client.setDefaultMaxQueryPayment(new Hbar(1))

  cachedClient = client
  cachedEscrowKey = escrowKey

  return { client, operatorId, operatorKey, escrowId, escrowKey }
}

export interface TransferReceipt {
  txId: string
  status: string
  hashScanUrl: string
}

function txIdToHashScanUrl(txId: string): string {
  // Transaction ID format: 0.0.X@seconds.nanos
  // HashScan URL format:   0.0.X-seconds-nanos
  const match = txId.match(/^(\d+\.\d+\.\d+)@(\d+)\.(\d+)$/)
  if (!match) return `https://hashscan.io/testnet/transaction/${txId}`
  return `https://hashscan.io/testnet/transaction/${match[1]}-${match[2]}-${match[3]}`
}

/**
 * charge: buyer → escrow. Operator funds the transfer (acts as buyer in demo).
 * Returns a confirmed on-chain transaction receipt.
 */
export async function charge(args: {
  tinybars: number
  memo?: string
}): Promise<TransferReceipt> {
  const { client, operatorId, escrowId } = getContext()
  const tx = await new TransferTransaction()
    .addHbarTransfer(operatorId, Hbar.fromTinybars(-args.tinybars))
    .addHbarTransfer(escrowId, Hbar.fromTinybars(args.tinybars))
    .setTransactionMemo(args.memo ?? 'scoutbrief:charge')
    .execute(client)
  const receipt = await tx.getReceipt(client)
  const txId = tx.transactionId.toString()
  return {
    txId,
    status: receipt.status.toString(),
    hashScanUrl: txIdToHashScanUrl(txId),
  }
}

/**
 * release: escrow → seller (defaults to operator in demo).
 * Requires escrow private key signature.
 */
export async function release(args: {
  tinybars: number
  to?: string
  memo?: string
}): Promise<TransferReceipt> {
  const { client, operatorId, escrowId, escrowKey } = getContext()
  const toId = args.to ? AccountId.fromString(args.to) : operatorId
  const tx = await new TransferTransaction()
    .addHbarTransfer(escrowId, Hbar.fromTinybars(-args.tinybars))
    .addHbarTransfer(toId, Hbar.fromTinybars(args.tinybars))
    .setTransactionMemo(args.memo ?? 'scoutbrief:release')
    .freezeWith(client)
  const signed = await tx.sign(escrowKey)
  const submitted = await signed.execute(client)
  const receipt = await submitted.getReceipt(client)
  const txId = submitted.transactionId.toString()
  return {
    txId,
    status: receipt.status.toString(),
    hashScanUrl: txIdToHashScanUrl(txId),
  }
}

/**
 * refund: escrow → original buyer. Requires escrow private key signature.
 */
export async function refund(args: {
  tinybars: number
  to: string
  memo?: string
}): Promise<TransferReceipt> {
  const { client, escrowId, escrowKey } = getContext()
  const buyerId = AccountId.fromString(args.to)
  const tx = await new TransferTransaction()
    .addHbarTransfer(escrowId, Hbar.fromTinybars(-args.tinybars))
    .addHbarTransfer(buyerId, Hbar.fromTinybars(args.tinybars))
    .setTransactionMemo(args.memo ?? 'scoutbrief:refund')
    .freezeWith(client)
  const signed = await tx.sign(escrowKey)
  const submitted = await signed.execute(client)
  const receipt = await submitted.getReceipt(client)
  const txId = submitted.transactionId.toString()
  return {
    txId,
    status: receipt.status.toString(),
    hashScanUrl: txIdToHashScanUrl(txId),
  }
}

export function closeContext(): void {
  if (cachedClient) {
    cachedClient.close()
    cachedClient = null
    cachedEscrowKey = null
  }
}

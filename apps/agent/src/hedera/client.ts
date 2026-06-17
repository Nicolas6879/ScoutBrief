/**
 * Single Hedera testnet client used by the agent. Operator credentials from .env.
 * The same client is given to the kit's policy chain so it can perform Mirror
 * Node lookups + transaction submission.
 */
import { Client, PrivateKey } from '@hiero-ledger/sdk'

let cached: Client | null = null

export function getHederaClient(): Client {
  if (cached) return cached
  const operatorId = process.env.HEDERA_OPERATOR_ID
  const operatorKey = process.env.HEDERA_OPERATOR_KEY
  if (!operatorId || !operatorKey) {
    throw new Error('HEDERA_OPERATOR_ID and HEDERA_OPERATOR_KEY must be set')
  }
  const c = Client.forTestnet()
  c.setOperator(operatorId, PrivateKey.fromStringDer(operatorKey))
  cached = c
  return c
}

export function closeHederaClient(): void {
  if (cached) {
    cached.close()
    cached = null
  }
}

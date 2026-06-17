import { z } from 'zod'

// x402 payment envelope schema for Hedera HBAR transfers
export const X402EnvelopeSchema = z.object({
  version: z.literal(1),
  scheme: z.literal('exact'),
  network: z.literal('hedera-testnet'),
  payTo: z.string(), // escrow account ID
  amount: z.string(), // tinybars as string (avoid float precision)
  currency: z.literal('HBAR'),
  nonce: z.string().uuid(),
  expiresAt: z.number(), // unix ms
  partiallySignedTx: z.string(), // base64 encoded
  buyer: z.string(), // buyer account ID
})
export type X402Envelope = z.infer<typeof X402EnvelopeSchema>

export const X402ReceiptSchema = z.object({
  nonce: z.string().uuid(),
  txId: z.string(),
  status: z.enum(['confirmed', 'refunded', 'pending']),
  timestamp: z.number(),
})
export type X402Receipt = z.infer<typeof X402ReceiptSchema>

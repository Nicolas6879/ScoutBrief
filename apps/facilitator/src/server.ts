/**
 * x402 facilitator HTTP server for ScoutBrief.
 *
 * Vertical-integrated x402: in the demo, the agent backend acts as buyer/server/facilitator
 * (judges don't connect wallets). All payments are REAL on-chain HBAR TransferTransactions.
 *
 * Endpoints:
 *   POST /x402/pay      — buyer → escrow (verifies nonce, returns tx id)
 *   POST /x402/release  — escrow → seller (after work succeeds)
 *   POST /x402/refund   — escrow → buyer (when a policy blocks or work fails)
 *   GET  /health        — uptime check
 */
import 'dotenv/config'
import express, { type Request, type Response } from 'express'
import rateLimit from 'express-rate-limit'
import { z } from 'zod'
import { tryClaimNonce } from '@scoutbrief/shared'
import { charge, refund, release } from './hedera.js'

const app = express()
app.use(express.json({ limit: '128kb' }))

const limiter = rateLimit({
  windowMs: 60_000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
})
app.use('/x402/', limiter)

app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'scoutbrief-facilitator',
    operator: process.env.HEDERA_OPERATOR_ID,
    escrow: process.env.HEDERA_ESCROW_ID,
  })
})

const PayBody = z.object({
  nonce: z.string().uuid(),
  buyer: z.string(), // 0.0.X
  tinybars: z.number().int().positive(),
  memo: z.string().optional(),
})

app.post('/x402/pay', async (req: Request, res: Response) => {
  const parsed = PayBody.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: 'invalid_body', detail: parsed.error.flatten() })
  }
  const { nonce, buyer, tinybars, memo } = parsed.data

  const claim = tryClaimNonce({ nonce, buyer, tinybars })
  if (!claim.ok) {
    return res.status(409).json({ error: 'nonce_replay', nonce })
  }

  try {
    const receipt = await charge({ tinybars, memo })
    return res.json({ ok: true, nonce, receipt })
  } catch (err) {
    return res.status(500).json({
      error: 'charge_failed',
      detail: err instanceof Error ? err.message : String(err),
    })
  }
})

const ReleaseBody = z.object({
  nonce: z.string().uuid(),
  tinybars: z.number().int().positive(),
  to: z.string().optional(),
  memo: z.string().optional(),
})

app.post('/x402/release', async (req: Request, res: Response) => {
  const parsed = ReleaseBody.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: 'invalid_body', detail: parsed.error.flatten() })
  }
  try {
    const receipt = await release({
      tinybars: parsed.data.tinybars,
      to: parsed.data.to,
      memo: parsed.data.memo,
    })
    return res.json({ ok: true, nonce: parsed.data.nonce, receipt })
  } catch (err) {
    return res.status(500).json({
      error: 'release_failed',
      detail: err instanceof Error ? err.message : String(err),
    })
  }
})

const RefundBody = z.object({
  nonce: z.string().uuid(),
  tinybars: z.number().int().positive(),
  to: z.string(), // buyer to refund
  memo: z.string().optional(),
})

app.post('/x402/refund', async (req: Request, res: Response) => {
  const parsed = RefundBody.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: 'invalid_body', detail: parsed.error.flatten() })
  }
  try {
    const receipt = await refund({
      tinybars: parsed.data.tinybars,
      to: parsed.data.to,
      memo: parsed.data.memo,
    })
    return res.json({ ok: true, nonce: parsed.data.nonce, receipt })
  } catch (err) {
    return res.status(500).json({
      error: 'refund_failed',
      detail: err instanceof Error ? err.message : String(err),
    })
  }
})

const port = Number(process.env.FACILITATOR_PORT ?? 3002)
app.listen(port, () => {
  console.log(`[facilitator] listening on :${port}`)
  console.log(`  operator: ${process.env.HEDERA_OPERATOR_ID}`)
  console.log(`  escrow:   ${process.env.HEDERA_ESCROW_ID}`)
})

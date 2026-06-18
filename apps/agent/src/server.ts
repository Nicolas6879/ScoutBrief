/**
 * Agent HTTP server.
 *
 * Endpoints:
 *   GET  /health         — uptime probe
 *   GET  /manifest       — agent manifest.json (indexable for the Hedera ecosystem)
 *   POST /agent/brief    — invoke the BuyBriefTool synchronously, return final result
 *   POST /agent/stream   — invoke with SSE streaming of policy chain events (M3)
 *
 * Both /agent endpoints accept { topic: string, email: string } and run the
 * full V4 policy chain on the underlying HBAR charge.
 */
import 'dotenv/config'
import express, { type Request, type Response } from 'express'
import rateLimit from 'express-rate-limit'
import { z } from 'zod'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { BriefRequestSchema } from '@scoutbrief/shared'
import { buyBrief, type BriefStep } from './tools/BuyBriefTool.js'

const app = express()
app.use(express.json({ limit: '64kb' }))

// CORS — permissive for dev + production demo URL.
// Console runs on :3000 locally and on Vercel in production; both need to call
// this agent server. We don't expose secrets to clients, so a wide allowlist
// is acceptable; we still throttle via express-rate-limit below.
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept')
  if (req.method === 'OPTIONS') {
    res.sendStatus(204)
    return
  }
  next()
})

const briefLimiter = rateLimit({
  windowMs: 60_000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
})

app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'scoutbrief-agent',
    operator: process.env.HEDERA_OPERATOR_ID,
    escrow: process.env.HEDERA_ESCROW_ID,
    audit_topic: process.env.HCS_AUDIT_TOPIC,
    policy_topic: process.env.HCS_POLICY_MANIFEST_TOPIC,
  })
})

app.get('/manifest', (_req, res) => {
  try {
    const path = resolve(process.cwd(), 'manifest.json')
    const raw = readFileSync(path, 'utf8')
    res.type('application/json').send(raw)
  } catch (err) {
    res.status(500).json({ error: 'manifest_not_found', detail: String(err) })
  }
})

app.post('/agent/brief', briefLimiter, async (req: Request, res: Response) => {
  const parsed = BriefRequestSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: 'invalid_body', detail: parsed.error.flatten() })
  }
  try {
    const result = await buyBrief(parsed.data)
    return res.json(result)
  } catch (err) {
    return res.status(500).json({
      error: 'agent_failure',
      detail: err instanceof Error ? err.message : String(err),
    })
  }
})

const StreamBody = BriefRequestSchema.merge(z.object({}).strict().passthrough())

app.post('/agent/stream', briefLimiter, async (req: Request, res: Response) => {
  const parsed = StreamBody.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: 'invalid_body', detail: parsed.error.flatten() })
  }

  // SSE setup
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  })
  res.flushHeaders()

  const sendEvent = (event: string, data: unknown): void => {
    res.write(`event: ${event}\n`)
    res.write(`data: ${JSON.stringify(data)}\n\n`)
  }

  const onStep = (step: BriefStep): void => {
    sendEvent('step', step)
  }

  try {
    const result = await buyBrief(parsed.data, { onStep })
    sendEvent('done', {
      ok: result.ok,
      requestId: result.requestId,
      emailMessageId: result.emailMessageId,
      briefChars: result.briefMarkdown?.length,
      briefMarkdown: result.briefMarkdown,
      policyName: result.policyName,
      reason: result.reason,
    })
  } catch (err) {
    sendEvent('error', { reason: err instanceof Error ? err.message : String(err) })
  } finally {
    res.end()
  }
})

const port = Number(process.env.AGENT_PORT ?? 3001)
app.listen(port, () => {
  console.log(`[agent] listening on :${port}`)
  console.log(`  operator:     ${process.env.HEDERA_OPERATOR_ID}`)
  console.log(`  escrow:       ${process.env.HEDERA_ESCROW_ID}`)
  console.log(`  audit topic:  ${process.env.HCS_AUDIT_TOPIC}`)
  console.log(`  policy topic: ${process.env.HCS_POLICY_MANIFEST_TOPIC}`)
})

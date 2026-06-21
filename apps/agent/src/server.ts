/**
 * Agent HTTP server.
 *
 * Endpoints:
 *   GET  /health             — uptime probe
 *   GET  /manifest           — agent manifest.json (indexable for the Hedera ecosystem)
 *   GET  /budget             — daily-used / daily-cap / per-brief-cap (for UI gauge)
 *   GET  /accounts           — list watchlist accounts
 *   POST /accounts           — { name } add account
 *   DELETE /accounts/:id     — remove account
 *   GET  /runs               — list past runs (paginated)
 *   GET  /runs/:id           — single run + decisions + brief
 *   GET  /decisions          — chronological decision feed (filterable)
 *   POST /scout/run          — run scout on { accountIds } with SSE streaming
 *   POST /agent/brief        — single sync brief (legacy, kept for parity)
 *   POST /agent/stream       — single SSE brief (legacy, kept for parity)
 */
import 'dotenv/config'
import express, { type Request, type Response } from 'express'
import rateLimit from 'express-rate-limit'
import { z } from 'zod'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import {
  BriefRequestSchema,
  createAccount,
  listAccounts,
  getAccount,
  getAccountByName,
  deleteAccount,
  listRuns,
  getRun,
  listDecisions,
  listDecisionsForRun,
  createRun,
  getLocalRolling24hSpend,
} from '@scoutbrief/shared'
import { buyBrief, type BriefStep } from './tools/BuyBriefTool.js'

const app = express()
app.use(express.json({ limit: '64kb' }))

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept')
  if (req.method === 'OPTIONS') {
    res.sendStatus(204)
    return
  }
  next()
})

const briefLimiter = rateLimit({
  windowMs: 60_000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
})

// ---------------------------------------------------------------------------
// Health + manifest
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Budget gauge
// ---------------------------------------------------------------------------

app.get('/budget', (_req, res) => {
  const dailyUsed = getLocalRolling24hSpend()
  const dailyLimit = Number(process.env.DAILY_CAP_TINYBARS ?? 1_000_000_000)
  const perBriefLimit = Number(process.env.PER_BRIEF_CAP_TINYBARS ?? 50_000_000)
  res.json({
    daily_used_tinybars: dailyUsed,
    daily_limit_tinybars: dailyLimit,
    per_brief_limit_tinybars: perBriefLimit,
    pct_used: dailyLimit > 0 ? dailyUsed / dailyLimit : 0,
  })
})

// ---------------------------------------------------------------------------
// Watchlist accounts
// ---------------------------------------------------------------------------

const CreateAccountBody = z.object({
  name: z.string().trim().min(1).max(120),
})

app.get('/accounts', (_req, res) => {
  res.json({ accounts: listAccounts() })
})

app.post('/accounts', (req: Request, res: Response) => {
  const parsed = CreateAccountBody.safeParse(req.body)
  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: 'invalid_body', detail: parsed.error.flatten() })
  }
  const existing = getAccountByName(parsed.data.name)
  if (existing) {
    return res.status(409).json({ error: 'duplicate', account: existing })
  }
  try {
    const account = createAccount({ id: randomUUID(), name: parsed.data.name })
    return res.status(201).json({ account })
  } catch (err) {
    return res.status(500).json({
      error: 'create_failed',
      detail: err instanceof Error ? err.message : String(err),
    })
  }
})

app.delete('/accounts/:id', (req: Request, res: Response) => {
  const id = req.params.id
  if (!id) return res.status(400).json({ error: 'missing_id' })
  const ok = deleteAccount(id)
  if (!ok) return res.status(404).json({ error: 'not_found' })
  return res.json({ ok: true })
})

// ---------------------------------------------------------------------------
// Runs + decisions read endpoints
// ---------------------------------------------------------------------------

app.get('/runs', (req: Request, res: Response) => {
  const limit = Math.min(Number(req.query.limit ?? 50), 200)
  const offset = Math.max(Number(req.query.offset ?? 0), 0)
  res.json({ runs: listRuns({ limit, offset }) })
})

app.get('/runs/:id', (req: Request, res: Response) => {
  const id = req.params.id
  if (!id) return res.status(400).json({ error: 'missing_id' })
  const run = getRun(id)
  if (!run) return res.status(404).json({ error: 'not_found' })
  const decisions = listDecisionsForRun(run.id)
  return res.json({ run, decisions })
})

app.get('/decisions', (req: Request, res: Response) => {
  const accountId = typeof req.query.account === 'string' ? req.query.account : undefined
  const runId = typeof req.query.run === 'string' ? req.query.run : undefined
  const status =
    req.query.status === 'ok' ||
    req.query.status === 'blocked' ||
    req.query.status === 'active' ||
    req.query.status === 'info'
      ? req.query.status
      : undefined
  const since = req.query.since ? Number(req.query.since) : undefined
  const limit = req.query.limit ? Math.min(Number(req.query.limit), 1000) : 200
  res.json({
    decisions: listDecisions({ accountId, runId, status, since, limit }),
  })
})

// ---------------------------------------------------------------------------
// Scout batch run (SSE)
// ---------------------------------------------------------------------------

const ScoutRunBody = z.object({
  accountIds: z.array(z.string().min(1)).min(1).max(20),
})

app.post('/scout/run', briefLimiter, async (req: Request, res: Response) => {
  const parsed = ScoutRunBody.safeParse(req.body)
  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: 'invalid_body', detail: parsed.error.flatten() })
  }

  const accounts = parsed.data.accountIds
    .map((id) => getAccount(id))
    .filter((a): a is NonNullable<ReturnType<typeof getAccount>> => !!a)

  if (accounts.length === 0) {
    return res.status(404).json({ error: 'no_valid_accounts' })
  }

  // SSE setup
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  })
  res.flushHeaders()

  const send = (event: string, data: unknown): void => {
    res.write(`event: ${event}\n`)
    res.write(`data: ${JSON.stringify(data)}\n\n`)
  }

  const batchId = randomUUID()
  send('batchStart', {
    batchId,
    accounts: accounts.map((a) => ({ id: a.id, name: a.name })),
  })

  for (const account of accounts) {
    const runId = randomUUID()
    createRun({
      id: runId,
      accountId: account.id,
      accountName: account.name,
      batchId,
    })
    send('runStart', {
      batchId,
      runId,
      account: { id: account.id, name: account.name },
    })

    const onStep = (step: BriefStep): void => {
      send('step', { batchId, runId, accountId: account.id, step })
    }

    try {
      const result = await buyBrief(
        {
          topic: account.name,
          accountName: account.name,
          accountId: account.id,
          runId,
          batchId,
        },
        { onStep },
      )
      send('runDone', {
        batchId,
        runId,
        accountId: account.id,
        ok: result.ok,
        briefChars: result.briefMarkdown?.length,
        briefMarkdown: result.briefMarkdown,
        policyName: result.policyName,
        reason: result.reason,
      })
    } catch (err) {
      send('runError', {
        batchId,
        runId,
        accountId: account.id,
        reason: err instanceof Error ? err.message : String(err),
      })
    }
  }

  send('batchDone', { batchId })
  res.end()
})

// ---------------------------------------------------------------------------
// Legacy single-brief endpoints (kept for parity with existing tooling)
// ---------------------------------------------------------------------------

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

app.post('/agent/stream', briefLimiter, async (req: Request, res: Response) => {
  const parsed = BriefRequestSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: 'invalid_body', detail: parsed.error.flatten() })
  }

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
      runId: result.runId,
      accountId: result.accountId,
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

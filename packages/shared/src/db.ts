/**
 * Shared SQLite layer for ScoutBrief.
 *
 * Uses node:sqlite (built into Node 22+). Single DB file shared by agent and facilitator
 * via WAL mode (multiple readers + single writer). Path is configurable via SQLITE_PATH;
 * defaults to ./data/scoutbrief.db locally and /data/scoutbrief.db on Fly.io persistent volume.
 *
 * Idempotent: `initSchema()` creates tables only if missing. Safe to call on every process start.
 */
import { DatabaseSync } from 'node:sqlite'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

let db: DatabaseSync | null = null

export function getDb(): DatabaseSync {
  if (db) return db
  const path = process.env.SQLITE_PATH ?? './data/scoutbrief.db'
  try {
    mkdirSync(dirname(path), { recursive: true })
  } catch {
    // ignore if exists
  }
  db = new DatabaseSync(path)
  // WAL mode: many readers + one writer; safer across processes
  db.exec('PRAGMA journal_mode = WAL;')
  db.exec('PRAGMA synchronous = NORMAL;')
  db.exec('PRAGMA foreign_keys = ON;')
  initSchema(db)
  return db
}

export function closeDb(): void {
  if (db) {
    db.close()
    db = null
  }
}

function initSchema(d: DatabaseSync): void {
  // x402 nonces — replay protection. TTL via expires_at.
  d.exec(`
    CREATE TABLE IF NOT EXISTS x402_nonces (
      nonce       TEXT PRIMARY KEY,
      buyer       TEXT NOT NULL,
      tinybars    INTEGER NOT NULL,
      created_at  INTEGER NOT NULL,
      expires_at  INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_nonces_expires ON x402_nonces(expires_at);
  `)

  // Per-recipient counter for counterpartyAllowlistPolicy anti-spam
  d.exec(`
    CREATE TABLE IF NOT EXISTS recipient_log (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      email_hash    TEXT NOT NULL,
      request_id    TEXT NOT NULL,
      created_at    INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_recipient_email_time ON recipient_log(email_hash, created_at);
  `)

  // Per-request spend tracking (mirrors HCS audit topic for fast local queries)
  d.exec(`
    CREATE TABLE IF NOT EXISTS spend_log (
      request_id    TEXT PRIMARY KEY,
      tinybars      INTEGER NOT NULL,
      stage         TEXT NOT NULL,
      tx_id         TEXT,
      created_at    INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_spend_created ON spend_log(created_at);
  `)

  // Settlement holds (Stage 6) waiting for release-vs-refund decision
  d.exec(`
    CREATE TABLE IF NOT EXISTS policy_holds (
      nonce         TEXT PRIMARY KEY,
      request_id    TEXT NOT NULL,
      buyer         TEXT NOT NULL,
      tinybars      INTEGER NOT NULL,
      release_to    TEXT NOT NULL,
      status        TEXT NOT NULL CHECK(status IN ('held','released','refunded')),
      hold_until    INTEGER NOT NULL,
      created_at    INTEGER NOT NULL,
      resolved_at   INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_holds_status_until ON policy_holds(status, hold_until);
  `)

  // Watchlist accounts (single-user dashboard, anonymous session)
  d.exec(`
    CREATE TABLE IF NOT EXISTS accounts (
      id           TEXT PRIMARY KEY,
      name         TEXT NOT NULL UNIQUE,
      created_at   INTEGER NOT NULL,
      last_run_at  INTEGER,
      last_status  TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_accounts_created ON accounts(created_at DESC);
  `)

  // Each scout run (1 account → 1 run; a batch groups N runs)
  d.exec(`
    CREATE TABLE IF NOT EXISTS runs (
      id              TEXT PRIMARY KEY,
      account_id      TEXT NOT NULL,
      account_name    TEXT NOT NULL,
      batch_id        TEXT NOT NULL,
      started_at      INTEGER NOT NULL,
      finished_at     INTEGER,
      status          TEXT NOT NULL,
      blocked_policy  TEXT,
      blocked_reason  TEXT,
      cost_tinybars   INTEGER,
      brief_markdown  TEXT,
      charge_tx       TEXT,
      release_tx      TEXT,
      refund_tx       TEXT,
      audit_topic     TEXT,
      audit_consensus TEXT,
      FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_runs_started ON runs(started_at DESC);
    CREATE INDEX IF NOT EXISTS idx_runs_account ON runs(account_id, started_at DESC);
    CREATE INDEX IF NOT EXISTS idx_runs_batch ON runs(batch_id);
  `)

  // Granular decision log (1 step in a run = 1 row)
  d.exec(`
    CREATE TABLE IF NOT EXISTS decisions (
      id            TEXT PRIMARY KEY,
      run_id        TEXT NOT NULL,
      account_id    TEXT NOT NULL,
      ts            INTEGER NOT NULL,
      stage         TEXT NOT NULL,
      policy_name   TEXT,
      hook_name     TEXT,
      status        TEXT NOT NULL,
      detail        TEXT,
      tx_id         TEXT,
      hcs_ref       TEXT,
      FOREIGN KEY (run_id) REFERENCES runs(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_decisions_ts ON decisions(ts DESC);
    CREATE INDEX IF NOT EXISTS idx_decisions_run ON decisions(run_id, ts ASC);
    CREATE INDEX IF NOT EXISTS idx_decisions_account ON decisions(account_id, ts DESC);
    CREATE INDEX IF NOT EXISTS idx_decisions_status ON decisions(status, ts DESC);
  `)
}

// ============================================================================
// Helpers — x402 nonces
// ============================================================================

export interface NonceRow {
  nonce: string
  buyer: string
  tinybars: number
  created_at: number
  expires_at: number
}

export function tryClaimNonce(args: {
  nonce: string
  buyer: string
  tinybars: number
  ttlMs?: number
}): { ok: true } | { ok: false; reason: 'replay' } {
  const d = getDb()
  const now = Date.now()
  const ttl = args.ttlMs ?? 60_000
  // Atomic INSERT OR IGNORE — primary key collision means replay
  const stmt = d.prepare(
    `INSERT OR IGNORE INTO x402_nonces (nonce, buyer, tinybars, created_at, expires_at)
     VALUES (?, ?, ?, ?, ?)`,
  )
  const result = stmt.run(args.nonce, args.buyer, args.tinybars, now, now + ttl)
  if (result.changes === 0) return { ok: false, reason: 'replay' }
  return { ok: true }
}

export function purgeExpiredNonces(): number {
  const d = getDb()
  const result = d.prepare(`DELETE FROM x402_nonces WHERE expires_at < ?`).run(Date.now())
  return Number(result.changes)
}

// ============================================================================
// Helpers — recipient cap
// ============================================================================

export function logRecipient(emailHash: string, requestId: string): void {
  const d = getDb()
  d.prepare(
    `INSERT INTO recipient_log (email_hash, request_id, created_at) VALUES (?, ?, ?)`,
  ).run(emailHash, requestId, Date.now())
}

export function getRecipientCountLast24h(emailHash: string): number {
  const d = getDb()
  const cutoff = Date.now() - 24 * 60 * 60 * 1000
  const row = d
    .prepare(`SELECT COUNT(*) as cnt FROM recipient_log WHERE email_hash = ? AND created_at > ?`)
    .get(emailHash, cutoff) as { cnt: number } | undefined
  return row?.cnt ?? 0
}

// ============================================================================
// Helpers — spend log
// ============================================================================

export function logSpend(args: {
  requestId: string
  tinybars: number
  stage: string
  txId?: string
}): void {
  const d = getDb()
  d.prepare(
    `INSERT OR REPLACE INTO spend_log (request_id, tinybars, stage, tx_id, created_at)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(args.requestId, args.tinybars, args.stage, args.txId ?? null, Date.now())
}

export function getLocalRolling24hSpend(): number {
  const d = getDb()
  const cutoff = Date.now() - 24 * 60 * 60 * 1000
  const row = d
    .prepare(`SELECT COALESCE(SUM(tinybars), 0) as total FROM spend_log WHERE created_at > ?`)
    .get(cutoff) as { total: number } | undefined
  return row?.total ?? 0
}

// ============================================================================
// Helpers — policy holds (Stage 6)
// ============================================================================

export interface HoldRow {
  nonce: string
  request_id: string
  buyer: string
  tinybars: number
  release_to: string
  status: 'held' | 'released' | 'refunded'
  hold_until: number
  created_at: number
  resolved_at: number | null
}

export function createHold(args: {
  nonce: string
  requestId: string
  buyer: string
  tinybars: number
  releaseTo: string
  holdMs: number
}): void {
  const d = getDb()
  const now = Date.now()
  d.prepare(
    `INSERT INTO policy_holds (nonce, request_id, buyer, tinybars, release_to, status, hold_until, created_at)
     VALUES (?, ?, ?, ?, ?, 'held', ?, ?)`,
  ).run(
    args.nonce,
    args.requestId,
    args.buyer,
    args.tinybars,
    args.releaseTo,
    now + args.holdMs,
    now,
  )
}

export function resolveHold(args: {
  nonce: string
  status: 'released' | 'refunded'
}): boolean {
  const d = getDb()
  const result = d
    .prepare(
      `UPDATE policy_holds SET status = ?, resolved_at = ? WHERE nonce = ? AND status = 'held'`,
    )
    .run(args.status, Date.now(), args.nonce)
  return result.changes > 0
}

export function getExpiredHolds(): HoldRow[] {
  const d = getDb()
  return d
    .prepare(
      `SELECT * FROM policy_holds WHERE status = 'held' AND hold_until <= ? ORDER BY hold_until ASC`,
    )
    .all(Date.now()) as unknown as HoldRow[]
}

// ============================================================================
// Helpers — watchlist accounts
// ============================================================================

export interface AccountRow {
  id: string
  name: string
  created_at: number
  last_run_at: number | null
  last_status: 'ok' | 'blocked' | 'refunded' | null
}

export function createAccount(args: { id: string; name: string }): AccountRow {
  const d = getDb()
  const now = Date.now()
  d.prepare(
    `INSERT INTO accounts (id, name, created_at, last_run_at, last_status)
     VALUES (?, ?, ?, NULL, NULL)`,
  ).run(args.id, args.name, now)
  return {
    id: args.id,
    name: args.name,
    created_at: now,
    last_run_at: null,
    last_status: null,
  }
}

export function listAccounts(): AccountRow[] {
  const d = getDb()
  return d
    .prepare(`SELECT * FROM accounts ORDER BY created_at DESC`)
    .all() as unknown as AccountRow[]
}

export function getAccount(id: string): AccountRow | null {
  const d = getDb()
  const row = d
    .prepare(`SELECT * FROM accounts WHERE id = ?`)
    .get(id) as unknown as AccountRow | undefined
  return row ?? null
}

export function getAccountByName(name: string): AccountRow | null {
  const d = getDb()
  const row = d
    .prepare(`SELECT * FROM accounts WHERE name = ?`)
    .get(name) as unknown as AccountRow | undefined
  return row ?? null
}

export function deleteAccount(id: string): boolean {
  const d = getDb()
  const result = d.prepare(`DELETE FROM accounts WHERE id = ?`).run(id)
  return result.changes > 0
}

export function touchAccount(
  id: string,
  status: 'ok' | 'blocked' | 'refunded',
): void {
  const d = getDb()
  d.prepare(
    `UPDATE accounts SET last_run_at = ?, last_status = ? WHERE id = ?`,
  ).run(Date.now(), status, id)
}

// ============================================================================
// Helpers — runs
// ============================================================================

export type RunStatus = 'running' | 'ok' | 'blocked' | 'refunded' | 'error'

export interface RunRow {
  id: string
  account_id: string
  account_name: string
  batch_id: string
  started_at: number
  finished_at: number | null
  status: RunStatus
  blocked_policy: string | null
  blocked_reason: string | null
  cost_tinybars: number | null
  brief_markdown: string | null
  charge_tx: string | null
  release_tx: string | null
  refund_tx: string | null
  audit_topic: string | null
  audit_consensus: string | null
}

export function createRun(args: {
  id: string
  accountId: string
  accountName: string
  batchId: string
}): void {
  const d = getDb()
  d.prepare(
    `INSERT INTO runs (id, account_id, account_name, batch_id, started_at, status)
     VALUES (?, ?, ?, ?, ?, 'running')`,
  ).run(args.id, args.accountId, args.accountName, args.batchId, Date.now())
}

export function finalizeRun(args: {
  id: string
  status: RunStatus
  blockedPolicy?: string | null
  blockedReason?: string | null
  costTinybars?: number | null
  briefMarkdown?: string | null
  chargeTx?: string | null
  releaseTx?: string | null
  refundTx?: string | null
  auditTopic?: string | null
  auditConsensus?: string | null
}): void {
  const d = getDb()
  d.prepare(
    `UPDATE runs SET
        finished_at     = ?,
        status          = ?,
        blocked_policy  = ?,
        blocked_reason  = ?,
        cost_tinybars   = ?,
        brief_markdown  = ?,
        charge_tx       = ?,
        release_tx      = ?,
        refund_tx       = ?,
        audit_topic     = ?,
        audit_consensus = ?
      WHERE id = ?`,
  ).run(
    Date.now(),
    args.status,
    args.blockedPolicy ?? null,
    args.blockedReason ?? null,
    args.costTinybars ?? null,
    args.briefMarkdown ?? null,
    args.chargeTx ?? null,
    args.releaseTx ?? null,
    args.refundTx ?? null,
    args.auditTopic ?? null,
    args.auditConsensus ?? null,
    args.id,
  )
}

export function listRuns(args?: { limit?: number; offset?: number }): RunRow[] {
  const d = getDb()
  const limit = args?.limit ?? 50
  const offset = args?.offset ?? 0
  return d
    .prepare(`SELECT * FROM runs ORDER BY started_at DESC LIMIT ? OFFSET ?`)
    .all(limit, offset) as unknown as RunRow[]
}

export function getRun(id: string): RunRow | null {
  const d = getDb()
  const row = d
    .prepare(`SELECT * FROM runs WHERE id = ?`)
    .get(id) as unknown as RunRow | undefined
  return row ?? null
}

// ============================================================================
// Helpers — decisions (granular step log)
// ============================================================================

export type DecisionStatus = 'ok' | 'blocked' | 'active' | 'info'

export interface DecisionRow {
  id: string
  run_id: string
  account_id: string
  ts: number
  stage: string
  policy_name: string | null
  hook_name: string | null
  status: DecisionStatus
  detail: string | null
  tx_id: string | null
  hcs_ref: string | null
}

export function logDecision(args: {
  id: string
  runId: string
  accountId: string
  stage: string
  status: DecisionStatus
  policyName?: string | null
  hookName?: string | null
  detail?: unknown
  txId?: string | null
  hcsRef?: string | null
}): void {
  const d = getDb()
  const detailJson =
    args.detail === undefined || args.detail === null
      ? null
      : typeof args.detail === 'string'
        ? args.detail
        : JSON.stringify(args.detail)
  d.prepare(
    `INSERT INTO decisions
       (id, run_id, account_id, ts, stage, policy_name, hook_name, status, detail, tx_id, hcs_ref)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    args.id,
    args.runId,
    args.accountId,
    Date.now(),
    args.stage,
    args.policyName ?? null,
    args.hookName ?? null,
    args.status,
    detailJson,
    args.txId ?? null,
    args.hcsRef ?? null,
  )
}

export function listDecisions(filters?: {
  accountId?: string
  runId?: string
  status?: DecisionStatus
  since?: number
  limit?: number
}): DecisionRow[] {
  const d = getDb()
  const limit = filters?.limit ?? 200
  const where: string[] = []
  const params: unknown[] = []
  if (filters?.accountId) {
    where.push('account_id = ?')
    params.push(filters.accountId)
  }
  if (filters?.runId) {
    where.push('run_id = ?')
    params.push(filters.runId)
  }
  if (filters?.status) {
    where.push('status = ?')
    params.push(filters.status)
  }
  if (filters?.since) {
    where.push('ts >= ?')
    params.push(filters.since)
  }
  const sql = `SELECT * FROM decisions ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY ts DESC LIMIT ?`
  params.push(limit)
  return d.prepare(sql).all(...(params as (string | number | null)[])) as unknown as DecisionRow[]
}

export function listDecisionsForRun(runId: string): DecisionRow[] {
  const d = getDb()
  return d
    .prepare(`SELECT * FROM decisions WHERE run_id = ? ORDER BY ts ASC`)
    .all(runId) as unknown as DecisionRow[]
}

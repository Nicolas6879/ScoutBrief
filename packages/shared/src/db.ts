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

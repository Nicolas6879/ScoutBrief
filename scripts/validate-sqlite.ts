#!/usr/bin/env tsx
/**
 * M1.5: Validate node:sqlite + shared DB layer works end-to-end.
 */
import 'dotenv/config'
import { randomUUID } from 'node:crypto'
import {
  closeDb,
  createHold,
  getDb,
  getExpiredHolds,
  getLocalRolling24hSpend,
  getRecipientCountLast24h,
  logRecipient,
  logSpend,
  purgeExpiredNonces,
  resolveHold,
  tryClaimNonce,
} from '@scoutbrief/shared'

async function main(): Promise<void> {
  // Use temp DB so this doesn't pollute dev state
  process.env.SQLITE_PATH = './data/test-validate.db'

  console.log('=== M1.5 SQLite Validation ===\n')

  // Smoke test: open DB + schema
  const d = getDb()
  console.log('✓ DB opened + schema initialized')

  // Nonce replay protection
  const n1 = randomUUID()
  const c1 = tryClaimNonce({ nonce: n1, buyer: '0.0.x', tinybars: 1_000_000 })
  const c2 = tryClaimNonce({ nonce: n1, buyer: '0.0.x', tinybars: 1_000_000 })
  if (!c1.ok || c2.ok) throw new Error('Nonce replay protection broken')
  console.log('✓ Nonce replay protection works')

  // Recipient cap
  const emailHash = 'sha256-test'
  logRecipient(emailHash, randomUUID())
  logRecipient(emailHash, randomUUID())
  const cnt = getRecipientCountLast24h(emailHash)
  if (cnt !== 2) throw new Error(`Recipient count wrong: ${cnt}`)
  console.log(`✓ Recipient cap works (${cnt} logged in last 24h)`)

  // Spend log
  logSpend({ requestId: randomUUID(), tinybars: 50_000_000, stage: 'release', txId: '0.0.x@1.2' })
  const total = getLocalRolling24hSpend()
  if (total !== 50_000_000) throw new Error(`Spend total wrong: ${total}`)
  console.log(`✓ Spend log works (${total} tinybars in last 24h)`)

  // Policy holds
  const nonceH = randomUUID()
  createHold({
    nonce: nonceH,
    requestId: randomUUID(),
    buyer: '0.0.buyer',
    tinybars: 50_000_000,
    releaseTo: '0.0.seller',
    holdMs: -1000, // already expired for testing
  })
  const expired = getExpiredHolds()
  if (expired.length === 0) throw new Error('Hold not found in expired')
  console.log(`✓ Expired-hold detection works (${expired.length} ready to resolve)`)

  const resolved = resolveHold({ nonce: nonceH, status: 'released' })
  if (!resolved) throw new Error('resolveHold failed')
  const expiredAfter = getExpiredHolds()
  if (expiredAfter.length !== 0) throw new Error('Hold still in expired list after resolve')
  console.log('✓ Hold resolution works')

  // Purge
  const purged = purgeExpiredNonces()
  console.log(`✓ Purge expired nonces (${purged} purged)`)

  closeDb()

  // Cleanup
  await import('node:fs').then((fs) => {
    try {
      fs.unlinkSync('./data/test-validate.db')
      fs.unlinkSync('./data/test-validate.db-shm')
      fs.unlinkSync('./data/test-validate.db-wal')
    } catch {
      // ignore
    }
  })

  console.log('\n=== M1.5 PASSED ===')
}

main().catch((err) => {
  console.error('\nFATAL:', err)
  process.exit(1)
})

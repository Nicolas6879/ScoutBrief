#!/usr/bin/env tsx
/**
 * Integration test: Hedera Agent Kit V4 policy chain end-to-end.
 *
 * Three real transfer attempts:
 *   1. PASS — operator → escrow, amount under cap (counterparty in allowlist, spend OK)
 *   2. BLOCK by counterpartyAllowlistPolicy — sends to a random non-allowlisted account
 *   3. BLOCK by spendLimitPolicy — exceeds per-brief cap
 *
 * Each case prints a summary and (when applicable) the HashScan link to the
 * tx that landed on-chain.
 */
import 'dotenv/config'
// Override per-recipient cap so test 1 + test 3 (both → escrow) don't trip the counterparty policy.
// This isolates the spend-limit assertion in test 3.
process.env.PER_RECIPIENT_DAILY_LIMIT = '100'
import { closeHederaClient } from '../apps/agent/src/hedera/client.js'
import { transferHbarViaKit } from '../apps/agent/src/agent.js'
import { getDb } from '@scoutbrief/shared'

// Wipe the recipient_log + spend_log so prior test runs don't influence this one
const db = getDb()
db.exec('DELETE FROM recipient_log; DELETE FROM spend_log;')

const OPERATOR = process.env.HEDERA_OPERATOR_ID!
const ESCROW = process.env.HEDERA_ESCROW_ID!
const RANDOM_NON_ALLOWLISTED = '0.0.999999' // not in allowlist

async function main(): Promise<void> {
  console.log('=== M2 Policy Chain Integration Test ===\n')
  console.log(`Operator: ${OPERATOR}`)
  console.log(`Escrow:   ${ESCROW}`)
  console.log(`Per-brief cap: ${process.env.PER_BRIEF_CAP_TINYBARS ?? '50000000'} tinybars`)
  console.log()

  // ---- Test 1: HAPPY PATH ----
  console.log('[1/3] PASS — operator → escrow, 0.05 HBAR (under per-brief cap)...')
  const t1 = await transferHbarViaKit({
    fromAccountId: OPERATOR,
    toAccountId: ESCROW,
    hbar: 0.05,
    memo: 'm2.test pass',
  })
  if (!t1.ok) {
    console.error(`    ✗ Expected PASS, got BLOCK: ${t1.reason}`)
    process.exit(1)
  }
  console.log(`    ✓ PASSED. Raw output (excerpt): ${t1.rawOutput.slice(0, 160)}\n`)

  // ---- Test 2: COUNTERPARTY BLOCK ----
  console.log(`[2/3] BLOCK by counterparty — operator → ${RANDOM_NON_ALLOWLISTED}...`)
  const t2 = await transferHbarViaKit({
    fromAccountId: OPERATOR,
    toAccountId: RANDOM_NON_ALLOWLISTED,
    hbar: 0.01,
    memo: 'm2.test counterparty block',
  })
  if (t2.ok) {
    console.error(`    ✗ Expected BLOCK, but transfer succeeded: ${t2.rawOutput.slice(0, 160)}`)
    process.exit(1)
  }
  console.log(`    ✓ BLOCKED as expected. Reason (excerpt): ${t2.reason?.slice(0, 200)}\n`)

  // ---- Test 3: SPEND CAP BLOCK ----
  // Per-brief cap is 0.5 HBAR (50M tinybars). Attempt 1.0 HBAR to trigger block.
  console.log('[3/3] BLOCK by spend cap — operator → escrow, 1.0 HBAR (over cap)...')
  const t3 = await transferHbarViaKit({
    fromAccountId: OPERATOR,
    toAccountId: ESCROW,
    hbar: 1.0,
    memo: 'm2.test spend block',
  })
  if (t3.ok) {
    console.error(`    ✗ Expected BLOCK, transfer succeeded: ${t3.rawOutput.slice(0, 160)}`)
    process.exit(1)
  }
  console.log(`    ✓ BLOCKED as expected. Reason (excerpt): ${t3.reason?.slice(0, 200)}\n`)

  closeHederaClient()
  console.log('=== M2 policy chain integration PASSED ===')
}

main().catch((err) => {
  console.error('\nFATAL:', err)
  process.exit(1)
})

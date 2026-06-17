#!/usr/bin/env tsx
/**
 * M1.3 RED CHECKPOINT: end-to-end facilitator smoke test.
 *
 * Starts the facilitator in-process, issues a real /x402/pay (operator → escrow)
 * and a real /x402/release (escrow → operator). Both should produce HashScan-visible
 * txs. Verifies replay protection by reusing a nonce.
 *
 * Requires the testnet setup (M1.1) to be complete (escrow account funded).
 */
import 'dotenv/config'
import { randomUUID } from 'node:crypto'
import { charge, closeContext, refund, release } from '../apps/facilitator/src/hedera.js'
import { tryClaimNonce } from '@scoutbrief/shared'

const TEST_TINYBARS = 10_000_000 // 0.1 HBAR

async function main(): Promise<void> {
  console.log('=== M1.3 Facilitator E2E Validation ===\n')

  const nonce = randomUUID()

  // 1. Nonce claim should succeed
  const claim1 = tryClaimNonce({
    nonce,
    buyer: process.env.HEDERA_OPERATOR_ID!,
    tinybars: TEST_TINYBARS,
  })
  if (!claim1.ok) throw new Error('First nonce claim should succeed')
  console.log(`✓ Nonce claimed: ${nonce}`)

  // 2. Nonce replay should fail
  const claim2 = tryClaimNonce({
    nonce,
    buyer: process.env.HEDERA_OPERATOR_ID!,
    tinybars: TEST_TINYBARS,
  })
  if (claim2.ok) throw new Error('Nonce replay should be rejected')
  console.log('✓ Nonce replay rejected')

  // 3. Real charge: operator → escrow
  console.log(`\n[1/2] Charge ${TEST_TINYBARS} tinybars (operator → escrow)...`)
  const chargeReceipt = await charge({ tinybars: TEST_TINYBARS, memo: 'm1.3 validation charge' })
  console.log(`    ✓ tx: ${chargeReceipt.txId}`)
  console.log(`    ✓ status: ${chargeReceipt.status}`)
  console.log(`    ✓ HashScan: ${chargeReceipt.hashScanUrl}`)

  // 4. Real release: escrow → operator (returns the money for the demo)
  console.log(`\n[2/2] Release ${TEST_TINYBARS} tinybars (escrow → operator)...`)
  const releaseReceipt = await release({
    tinybars: TEST_TINYBARS,
    memo: 'm1.3 validation release',
  })
  console.log(`    ✓ tx: ${releaseReceipt.txId}`)
  console.log(`    ✓ status: ${releaseReceipt.status}`)
  console.log(`    ✓ HashScan: ${releaseReceipt.hashScanUrl}`)

  closeContext()
  console.log('\n=== M1.3 PASSED — escrow round-trip visible on HashScan ===')
}

main().catch((err) => {
  console.error('\nFATAL:', err)
  process.exit(1)
})

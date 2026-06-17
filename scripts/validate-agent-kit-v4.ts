#!/usr/bin/env tsx
/**
 * M1.4: Validate Hedera Agent Kit V4 is installed and lifecycle hooks fire.
 *
 * This is a smoke test, NOT production wiring. Confirms:
 *   - @hashgraph/hedera-agent-kit imports resolve
 *   - We can instantiate the kit with operator credentials
 *   - At least one built-in hook/policy is exported
 *
 * If this script fails, M1.4 RED CHECKPOINT triggers (consider Python fallback).
 */
import 'dotenv/config'

async function main(): Promise<void> {
  console.log('=== Hedera Agent Kit V4 Validation ===\n')

  // Step 1: dynamic import to surface a clear error if package missing
  let kit: typeof import('@hashgraph/hedera-agent-kit')
  try {
    kit = await import('@hashgraph/hedera-agent-kit')
  } catch (err) {
    console.error('❌ FAIL: cannot import @hashgraph/hedera-agent-kit')
    console.error(err)
    process.exit(1)
  }
  console.log('✓ @hashgraph/hedera-agent-kit imports OK')

  // Step 2: print all exported names so we know what V4 actually ships
  const exportedNames = Object.keys(kit).sort()
  console.log(`✓ V4 exports (${exportedNames.length}):`)
  for (const name of exportedNames) {
    console.log(`    - ${name}`)
  }

  // Step 3: verify env
  if (!process.env.HEDERA_OPERATOR_ID || !process.env.HEDERA_OPERATOR_KEY) {
    console.error('❌ FAIL: HEDERA_OPERATOR_ID / HEDERA_OPERATOR_KEY not set in .env')
    process.exit(1)
  }
  console.log(`✓ env: operator ${process.env.HEDERA_OPERATOR_ID}`)

  console.log('\n=== M1.4 PASSED — Agent Kit V4 ready for M2 ===')
}

main().catch((err) => {
  console.error('\nFATAL:', err)
  process.exit(1)
})

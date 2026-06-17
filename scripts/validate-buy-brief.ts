#!/usr/bin/env tsx
/**
 * M2 E2E: buyBrief full pipeline.
 *
 * Runs the entire BuyBriefTool flow once:
 *   decision → charge (real HBAR) → Tavily → LLM synth → Resend → release/refund → audit
 *
 * Prints every step as it streams and the final result. The on-chain artifacts
 * (charge tx + release tx) should be visible on HashScan.
 */
import 'dotenv/config'
import { buyBrief } from '../apps/agent/src/tools/BuyBriefTool.js'
import { closeHederaClient } from '../apps/agent/src/hedera/client.js'
import { closeHcsClient } from '../apps/agent/src/services/hcsAudit.js'
import { closeDb } from '@scoutbrief/shared'

async function main(): Promise<void> {
  console.log('=== M2 E2E: BuyBriefTool ===\n')

  const result = await buyBrief(
    {
      topic: process.env.TEST_TOPIC ?? 'Anthropic',
      email: process.env.RESEND_TEST_TO ?? 'juan2210050@correo.uis.edu.co',
    },
    {
      onStep: (step) => {
        const tag = `[${step.stage}]`
        if (step.stage === 'decision') console.log(tag, step.depth, '—', step.reason)
        else if (step.stage === 'charge' || step.stage === 'release' || step.stage === 'refund')
          console.log(tag, step.ok ? 'OK' : 'FAIL', step.reason ? `(${step.reason.slice(0, 100)})` : '')
        else if (step.stage === 'tavily') console.log(tag, `${step.count} results in ${step.ms}ms`)
        else if (step.stage === 'synth')
          console.log(tag, `${step.provider} ${step.chars} chars in ${step.ms}ms`)
        else if (step.stage === 'resend') console.log(tag, `msg=${step.messageId} in ${step.ms}ms`)
        else if (step.stage === 'audit') console.log(tag, `hcs ref=${step.ref}`)
        else if (step.stage === 'blocked')
          console.log(tag, `policy=${step.policyName} reason=${step.reason.slice(0, 120)}`)
        else if (step.stage === 'error') console.log(tag, step.reason.slice(0, 200))
      },
    },
  )

  console.log('\n--- FINAL ---')
  console.log('requestId:    ', result.requestId)
  console.log('ok:           ', result.ok)
  if (result.policyName) console.log('blockedBy:    ', result.policyName)
  if (result.emailMessageId) console.log('emailMsg:     ', result.emailMessageId)
  if (result.briefMarkdown) console.log('briefChars:   ', result.briefMarkdown.length)
  if (!result.ok && result.reason) console.log('reason:       ', result.reason.slice(0, 240))

  closeHederaClient()
  closeHcsClient()
  closeDb()
  process.exit(result.ok ? 0 : 1)
}

main().catch((err) => {
  console.error('\nFATAL:', err)
  process.exit(1)
})

#!/usr/bin/env tsx
/**
 * Smoke test for external service wrappers: Groq, Tavily, Resend.
 *
 * Tests the happy path (Groq primary). Gemini fallback is exercised
 * end-to-end during M5 by temporarily corrupting GROQ_API_KEY.
 *
 * Skips the actual Resend send unless --send is passed.
 */
import 'dotenv/config'
import { synthesizeBrief, synthesize } from '../apps/agent/src/services/llmRouter.js'
import { tavilySearch } from '../apps/agent/src/services/tavily.js'
import { sendBriefEmail } from '../apps/agent/src/services/resend.js'

async function main(): Promise<void> {
  console.log('=== M2 Services Smoke Test ===\n')

  // 1. Groq round-trip
  console.log('[1/4] Groq primary...')
  const groqResult = await synthesize({
    systemPrompt: 'You are a concise assistant.',
    userPrompt: 'Reply with one short sentence about Hedera.',
  })
  console.log(`    ✓ provider=${groqResult.provider} in ${groqResult.ms}ms`)
  console.log(`    response: ${groqResult.text.slice(0, 100)}...\n`)

  // 2. Tavily
  console.log('[2/4] Tavily search...')
  const tavilyResult = await tavilySearch({ query: 'Anthropic Claude', depth: 'lite' })
  console.log(`    ✓ ${tavilyResult.results.length} results in ${tavilyResult.ms}ms`)
  console.log(`    top: ${tavilyResult.results[0]?.title.slice(0, 80)}\n`)

  // 3. Brief synthesis (Tavily → LLM)
  console.log('[3/4] Brief synthesis pipeline...')
  const brief = await synthesizeBrief({
    topic: 'Anthropic',
    depth: 'lite',
    sources: tavilyResult.results.slice(0, 3).map((r) => ({
      title: r.title,
      url: r.url,
      content: r.content,
    })),
  })
  console.log(`    ✓ ${brief.provider} produced ${brief.text.length} chars in ${brief.ms}ms`)
  console.log(`    preview:\n${brief.text.slice(0, 240)}\n...\n`)

  // 4. Resend (optional)
  if (process.argv.includes('--send')) {
    console.log('[4/4] Resend send (--send flag)...')
    const toEmail = process.env.RESEND_TEST_TO || 'juan2210050@correo.uis.edu.co'
    const r = await sendBriefEmail({ to: toEmail, topic: 'Anthropic', markdown: brief.text })
    console.log(`    ✓ Sent to ${toEmail}, id=${r.messageId}, ${r.ms}ms`)
  } else {
    console.log('[4/4] Resend send: SKIPPED (pass --send to test real delivery)')
  }

  console.log('\n=== M2 services smoke PASSED ===')
}

main().catch((err) => {
  console.error('\nFATAL:', err)
  process.exit(1)
})

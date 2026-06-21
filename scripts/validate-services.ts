#!/usr/bin/env tsx
/**
 * Smoke test for external service wrappers: Groq + Tavily.
 *
 * Tests the happy path (Groq primary). Gemini fallback is exercised
 * end-to-end by temporarily corrupting GROQ_API_KEY.
 */
import 'dotenv/config'
import { synthesizeBrief, synthesize } from '../apps/agent/src/services/llmRouter.js'
import { tavilySearch } from '../apps/agent/src/services/tavily.js'

async function main(): Promise<void> {
  console.log('=== Services Smoke Test ===\n')

  // 1. Groq round-trip
  console.log('[1/3] Groq primary...')
  const groqResult = await synthesize({
    systemPrompt: 'You are a concise assistant.',
    userPrompt: 'Reply with one short sentence about Hedera.',
  })
  console.log(`    ✓ provider=${groqResult.provider} in ${groqResult.ms}ms`)
  console.log(`    response: ${groqResult.text.slice(0, 100)}...\n`)

  // 2. Tavily
  console.log('[2/3] Tavily search...')
  const tavilyResult = await tavilySearch({ query: 'Anthropic Claude', depth: 'lite' })
  console.log(`    ✓ ${tavilyResult.results.length} results in ${tavilyResult.ms}ms`)
  console.log(`    top: ${tavilyResult.results[0]?.title.slice(0, 80)}\n`)

  // 3. Brief synthesis (Tavily → LLM)
  console.log('[3/3] Brief synthesis pipeline...')
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

  console.log('\n=== services smoke PASSED ===')
}

main().catch((err) => {
  console.error('\nFATAL:', err)
  process.exit(1)
})

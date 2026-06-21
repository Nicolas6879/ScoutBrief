#!/usr/bin/env tsx
/**
 * Computes sha256 hashes of canonical API endpoint URLs.
 * Used by counterpartyAllowlistPolicy to detect endpoint substitution attacks.
 *
 * Run: pnpm hash:endpoints
 * Then append output to .env.
 */
import { createHash } from 'crypto'

const ENDPOINTS = {
  TAVILY_ENDPOINT_HASH: 'https://api.tavily.com/search',
  GROQ_ENDPOINT_HASH: 'https://api.groq.com/openai/v1/chat/completions',
  GEMINI_ENDPOINT_HASH:
    'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent',
} as const

console.log('=== Endpoint hashes (sha256) ===\n')
for (const [envKey, url] of Object.entries(ENDPOINTS)) {
  const hash = createHash('sha256').update(url).digest('hex')
  console.log(`${envKey}=${hash}`)
}
console.log('\nAppend these lines to .env')

/**
 * LLM router: Groq primary + Google Gemini fallback.
 *
 * On Groq rate-limit / 5xx / network error, automatically retries with Gemini
 * Flash. Both are free-tier providers (no spend at risk during demo).
 *
 * Exposes a single function `synthesize()` returning the markdown brief.
 */
import { ChatGroq } from '@langchain/groq'
import { ChatGoogleGenerativeAI } from '@langchain/google-genai'
import { HumanMessage, SystemMessage } from '@langchain/core/messages'

const GROQ_MODEL = process.env.GROQ_MODEL ?? 'llama-3.3-70b-versatile'
const GEMINI_MODEL = process.env.GEMINI_MODEL ?? 'gemini-2.0-flash-lite'

let groq: ChatGroq | null = null
let gemini: ChatGoogleGenerativeAI | null = null

function getGroq(): ChatGroq {
  if (groq) return groq
  if (!process.env.GROQ_API_KEY) throw new Error('GROQ_API_KEY missing')
  groq = new ChatGroq({
    apiKey: process.env.GROQ_API_KEY,
    model: GROQ_MODEL,
    maxTokens: 800,
    temperature: 0.2,
  })
  return groq
}

function getGemini(): ChatGoogleGenerativeAI {
  if (gemini) return gemini
  if (!process.env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY missing')
  gemini = new ChatGoogleGenerativeAI({
    apiKey: process.env.GEMINI_API_KEY,
    model: GEMINI_MODEL,
    maxOutputTokens: 800,
    temperature: 0.2,
  })
  return gemini
}

export type LlmProvider = 'groq' | 'gemini'

export interface SynthesisResult {
  provider: LlmProvider
  text: string
  ms: number
}

interface SynthesizeArgs {
  systemPrompt: string
  userPrompt: string
}

export async function synthesize(args: SynthesizeArgs): Promise<SynthesisResult> {
  const messages = [new SystemMessage(args.systemPrompt), new HumanMessage(args.userPrompt)]

  // Try Groq first
  const groqStart = Date.now()
  try {
    const groqClient = getGroq()
    const result = await groqClient.invoke(messages)
    return {
      provider: 'groq',
      text: typeof result.content === 'string' ? result.content : JSON.stringify(result.content),
      ms: Date.now() - groqStart,
    }
  } catch (groqErr) {
    console.warn(
      '[llmRouter] Groq failed, falling back to Gemini:',
      groqErr instanceof Error ? groqErr.message : groqErr,
    )
  }

  // Fall back to Gemini
  const geminiStart = Date.now()
  try {
    const geminiClient = getGemini()
    const result = await geminiClient.invoke(messages)
    return {
      provider: 'gemini',
      text: typeof result.content === 'string' ? result.content : JSON.stringify(result.content),
      ms: Date.now() - geminiStart,
    }
  } catch (geminiErr) {
    throw new Error(
      `Both LLM providers failed. Last error: ${geminiErr instanceof Error ? geminiErr.message : String(geminiErr)}`,
    )
  }
}

/**
 * Synthesize an intelligence brief markdown for a given topic.
 * `sources` is an array of search results (title + content snippets) from Tavily.
 */
export async function synthesizeBrief(args: {
  topic: string
  depth: 'lite' | 'standard' | 'deep'
  sources: Array<{ title: string; url: string; content: string }>
}): Promise<SynthesisResult> {
  const sourcesText = args.sources
    .map((s, i) => `[${i + 1}] ${s.title}\n${s.url}\n${s.content.slice(0, 600)}`)
    .join('\n\n')

  const depthHint =
    args.depth === 'lite'
      ? 'Keep the brief concise (~300 words).'
      : args.depth === 'standard'
        ? 'Standard depth (~500 words).'
        : 'Deep dive (~800 words) with detailed analysis.'

  return synthesize({
    systemPrompt: [
      'You are ScoutBrief, an intelligence analyst writing 1-page company briefs for VC analysts.',
      'Write in clean Markdown. Use H2/H3 headers. Cite sources inline as [1], [2], etc.',
      'Sections: Overview, Funding & Investors, Product, Market & Competitors, Risks & Open Questions.',
      depthHint,
    ].join(' '),
    userPrompt: [
      `Topic: ${args.topic}`,
      '',
      'Sources:',
      sourcesText,
      '',
      'Write the brief now.',
    ].join('\n'),
  })
}

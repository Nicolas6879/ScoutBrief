/**
 * Tavily search client. Free tier: 1000 searches/month.
 *
 * Returns ranked results with titles/URLs/content snippets used by LLM synth.
 */
export interface TavilySource {
  title: string
  url: string
  content: string
  score: number
}

export interface TavilySearchResult {
  query: string
  answer?: string
  results: TavilySource[]
  ms: number
}

export async function tavilySearch(args: {
  query: string
  depth: 'lite' | 'standard' | 'deep'
}): Promise<TavilySearchResult> {
  if (!process.env.TAVILY_API_KEY) throw new Error('TAVILY_API_KEY missing')

  const maxResults = args.depth === 'lite' ? 3 : args.depth === 'standard' ? 5 : 8
  const searchDepth = args.depth === 'lite' ? 'basic' : 'advanced'

  const start = Date.now()
  const resp = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.TAVILY_API_KEY}`,
    },
    body: JSON.stringify({
      query: args.query,
      search_depth: searchDepth,
      max_results: maxResults,
      include_answer: true,
    }),
  })

  if (!resp.ok) {
    const body = await resp.text()
    throw new Error(`Tavily ${resp.status}: ${body.slice(0, 200)}`)
  }
  const data = (await resp.json()) as {
    query: string
    answer?: string
    results: Array<{ title: string; url: string; content: string; score: number }>
  }

  return {
    query: data.query,
    answer: data.answer,
    results: data.results,
    ms: Date.now() - start,
  }
}

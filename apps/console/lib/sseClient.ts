/**
 * Minimal SSE-over-POST reader.
 * EventSource only supports GET, so we use fetch + ReadableStream to read
 * SSE-formatted lines from a POST request body.
 */

export type SSEMessage = {
  event: string
  data: unknown
}

interface RunOptions {
  path: string
  body: unknown
  signal?: AbortSignal
  onMessage: (msg: SSEMessage) => void
  onError?: (err: Error) => void
}

export async function streamPost(opts: RunOptions): Promise<void> {
  const base = process.env.NEXT_PUBLIC_AGENT_API_URL ?? ''
  const url = `${base}${opts.path}`

  let response: Response
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
      body: JSON.stringify(opts.body),
      signal: opts.signal,
    })
  } catch (err) {
    opts.onError?.(err instanceof Error ? err : new Error(String(err)))
    return
  }

  if (!response.ok || !response.body) {
    opts.onError?.(new Error(`HTTP ${response.status}`))
    return
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })

      let sep = buffer.indexOf('\n\n')
      while (sep !== -1) {
        const rawEvent = buffer.slice(0, sep)
        buffer = buffer.slice(sep + 2)
        const parsed = parseSSE(rawEvent)
        if (parsed) opts.onMessage(parsed)
        sep = buffer.indexOf('\n\n')
      }
    }
  } catch (err) {
    opts.onError?.(err instanceof Error ? err : new Error(String(err)))
  } finally {
    reader.releaseLock()
  }
}

function parseSSE(raw: string): SSEMessage | null {
  const lines = raw.split('\n')
  let event = 'message'
  let dataRaw = ''
  for (const line of lines) {
    if (line.startsWith('event:')) event = line.slice(6).trim()
    else if (line.startsWith('data:')) dataRaw += line.slice(5).trim()
  }
  if (!dataRaw) return null
  try {
    return { event, data: JSON.parse(dataRaw) }
  } catch {
    return { event, data: dataRaw }
  }
}

'use client'

/**
 * Minimal Markdown → React renderer for the inline brief preview.
 * Handles: H1/H2/H3, paragraphs, bullet lists, and inline citation markers [n].
 * Citations [1], [2], etc. are stylized as small inline badges.
 *
 * Kept dependency-free so the console workspace stays tiny.
 */
export function BriefRenderer({ markdown }: { markdown: string }): React.ReactElement {
  const blocks = parseBlocks(markdown)
  return (
    <article className="prose-scout">
      {blocks.map((b, i) => (
        <BlockEl key={i} block={b} />
      ))}
    </article>
  )
}

type Block =
  | { kind: 'h1' | 'h2' | 'h3'; text: string }
  | { kind: 'p'; text: string }
  | { kind: 'ul'; items: string[] }

function parseBlocks(md: string): Block[] {
  const lines = md.split('\n')
  const blocks: Block[] = []
  let buffer: string[] = []
  let mode: 'p' | 'ul' | null = null

  const flush = (): void => {
    if (mode === 'p' && buffer.length) {
      blocks.push({ kind: 'p', text: buffer.join(' ') })
    } else if (mode === 'ul' && buffer.length) {
      blocks.push({ kind: 'ul', items: [...buffer] })
    }
    buffer = []
    mode = null
  }

  for (const raw of lines) {
    const line = raw.trim()
    if (!line) {
      flush()
      continue
    }
    if (line.startsWith('### ')) {
      flush()
      blocks.push({ kind: 'h3', text: line.slice(4) })
      continue
    }
    if (line.startsWith('## ')) {
      flush()
      blocks.push({ kind: 'h2', text: line.slice(3) })
      continue
    }
    if (line.startsWith('# ')) {
      flush()
      blocks.push({ kind: 'h1', text: line.slice(2) })
      continue
    }
    if (line.startsWith('- ') || line.startsWith('* ')) {
      if (mode !== 'ul') flush()
      mode = 'ul'
      buffer.push(line.slice(2))
      continue
    }
    if (mode !== 'p') flush()
    mode = 'p'
    buffer.push(line)
  }
  flush()
  return blocks
}

function BlockEl({ block }: { block: Block }): React.ReactElement {
  switch (block.kind) {
    case 'h1':
      return (
        <h1 className="text-2xl font-semibold tracking-tight mt-5 mb-2">{block.text}</h1>
      )
    case 'h2':
      return (
        <h2 className="text-lg font-semibold tracking-tight mt-5 mb-2 text-[color:var(--color-accent)]">
          {block.text}
        </h2>
      )
    case 'h3':
      return <h3 className="text-base font-semibold mt-4 mb-2">{block.text}</h3>
    case 'p':
      return <p className="text-sm leading-6 my-2 text-[color:var(--color-text)]/90">{inline(block.text)}</p>
    case 'ul':
      return (
        <ul className="list-disc pl-5 my-2 space-y-1 text-sm">
          {block.items.map((it, i) => (
            <li key={i}>{inline(it)}</li>
          ))}
        </ul>
      )
  }
}

/** Render inline elements: citation markers [n] and bold **x**. */
function inline(text: string): React.ReactNode[] {
  const pieces: React.ReactNode[] = []
  let rest = text
  let i = 0
  while (rest.length > 0) {
    const citation = rest.match(/^\[(\d+)\]/)
    if (citation) {
      pieces.push(
        <sup
          key={i++}
          className="ml-0.5 inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded-sm bg-[color:var(--color-accent)]/20 border border-[color:var(--color-accent)]/30 text-[color:var(--color-accent)] text-[9px] leading-none font-mono"
        >
          {citation[1]}
        </sup>,
      )
      rest = rest.slice(citation[0].length)
      continue
    }
    const bold = rest.match(/^\*\*([^*]+)\*\*/)
    if (bold) {
      pieces.push(
        <strong key={i++} className="font-semibold">
          {bold[1]}
        </strong>,
      )
      rest = rest.slice(bold[0].length)
      continue
    }
    // Take everything up to the next [ or **
    const next = rest.search(/\[\d+\]|\*\*/)
    if (next === -1) {
      pieces.push(<span key={i++}>{rest}</span>)
      break
    }
    pieces.push(<span key={i++}>{rest.slice(0, next)}</span>)
    rest = rest.slice(next)
  }
  return pieces
}

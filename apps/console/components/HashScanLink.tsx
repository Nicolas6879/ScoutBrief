'use client'

export function HashScanLink({
  txOutput,
  label = 'HashScan',
}: {
  txOutput?: string
  label?: string
}): React.ReactElement | null {
  if (!txOutput) return null
  // The agent backend emits either a full URL or a tx id; we render both.
  const url =
    txOutput.startsWith('http')
      ? txOutput
      : `${process.env.NEXT_PUBLIC_HASHSCAN_BASE ?? 'https://hashscan.io/testnet'}/transaction/${encodeURIComponent(txOutput)}`
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 text-xs text-[color:var(--color-accent)] hover:underline"
    >
      ↗ {label}
    </a>
  )
}

export function HcsTopicLink({
  topicId,
  seq,
  label = 'HCS',
}: {
  topicId?: string
  seq?: string
  label?: string
}): React.ReactElement | null {
  if (!topicId) return null
  const base = process.env.NEXT_PUBLIC_HASHSCAN_BASE ?? 'https://hashscan.io/testnet'
  const url = `${base}/topic/${encodeURIComponent(topicId)}`
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 text-xs text-[color:var(--color-accent)] hover:underline"
    >
      ↗ {label}
      {seq ? ` #${seq}` : ''}
    </a>
  )
}

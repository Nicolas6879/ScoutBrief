'use client'

import { AnimatePresence, motion } from 'framer-motion'
import { CheckCircle2, ChevronDown, History, RotateCcw, ShieldOff, Zap } from 'lucide-react'
import { useState } from 'react'
import { useRunHistory } from '@/lib/hooks'
import type { Run, RunStatus } from '@/lib/types'
import { RunDetail } from '../RunDetail'

// ---------- helpers ----------

function relativeTime(ts: number): string {
  const diffMs = Date.now() - ts
  const diffMin = Math.floor(diffMs / 60_000)
  if (diffMin < 1) return 'just now'
  if (diffMin < 60) return `${diffMin}m ago`
  const diffH = Math.floor(diffMin / 60)
  if (diffH < 24) return `${diffH}h ago`
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function dayBucket(ts: number): string {
  const d = new Date(ts)
  const now = new Date()
  const sod = (dt: Date): number =>
    new Date(dt.getFullYear(), dt.getMonth(), dt.getDate()).getTime()
  const diff = sod(now) - sod(d)
  if (diff === 0) return 'Today'
  if (diff === 86_400_000) return 'Yesterday'
  if (diff < 7 * 86_400_000) return 'This week'
  return 'Earlier'
}

const BUCKET_ORDER = ['Today', 'Yesterday', 'This week', 'Earlier']

function groupByDay(runs: Run[]): { bucket: string; runs: Run[] }[] {
  const map = new Map<string, Run[]>()
  for (const r of runs) {
    const b = dayBucket(r.started_at)
    if (!map.has(b)) map.set(b, [])
    map.get(b)!.push(r)
  }
  return BUCKET_ORDER.filter((b) => map.has(b)).map((b) => ({
    bucket: b,
    runs: map.get(b)!,
  }))
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('')
}

function costHbar(tinybars: number | null): string | null {
  if (!tinybars) return null
  return `${(tinybars / 100_000_000).toFixed(4)} ℏ`
}

// ---------- StatusBadge ----------

const STATUS_META: Record<
  RunStatus,
  { label: string; classes: string; icon: React.ReactNode }
> = {
  ok: {
    label: 'Delivered',
    classes: 'border-emerald-400/25 bg-emerald-500/10 text-emerald-200',
    icon: <CheckCircle2 size={10} />,
  },
  blocked: {
    label: 'Blocked',
    classes: 'border-rose-400/25 bg-rose-500/10 text-rose-200',
    icon: <ShieldOff size={10} />,
  },
  refunded: {
    label: 'Refunded',
    classes: 'border-amber-400/25 bg-amber-500/10 text-amber-200',
    icon: <RotateCcw size={10} />,
  },
  running: {
    label: 'Running',
    classes: 'border-violet-400/25 bg-violet-500/10 text-violet-200',
    icon: <Zap size={10} />,
  },
  error: {
    label: 'Error',
    classes: 'border-orange-400/25 bg-orange-500/10 text-orange-200',
    icon: <ShieldOff size={10} />,
  },
}

function StatusBadge({ status }: { status: RunStatus }): React.ReactElement {
  const m = STATUS_META[status]
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider ${m.classes}`}
    >
      {m.icon}
      {m.label}
    </span>
  )
}

// ---------- Skeleton ----------

function HistorySkeleton(): React.ReactElement {
  return (
    <div className="space-y-3">
      {[1, 2, 3].map((i) => (
        <div
          key={i}
          className="animate-pulse rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4"
        >
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-white/[0.06]" />
            <div className="flex-1 space-y-2">
              <div className="h-3.5 w-32 rounded bg-white/[0.06]" />
              <div className="h-3 w-48 rounded bg-white/[0.04]" />
            </div>
            <div className="h-5 w-16 rounded-full bg-white/[0.06]" />
          </div>
        </div>
      ))}
    </div>
  )
}

// ---------- HistoryCard ----------

interface CardProps {
  run: Run
  expanded: boolean
  onToggle: () => void
}

function HistoryCard({ run, expanded, onToggle }: CardProps): React.ReactElement {
  const abbr = initials(run.account_name)
  const cost = costHbar(run.cost_tinybars)
  const preview = run.brief_markdown
    ? run.brief_markdown.replace(/^#+ /gm, '').split('\n').find((l) => l.trim().length > 30) ?? null
    : null

  const hueMap: Record<string, string> = {
    ok: 'from-emerald-500/20 to-teal-500/10',
    blocked: 'from-rose-500/20 to-pink-500/10',
    refunded: 'from-amber-500/20 to-yellow-500/10',
    running: 'from-violet-500/20 to-fuchsia-500/10',
    error: 'from-orange-500/20 to-red-500/10',
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.02] transition-colors hover:bg-white/[0.035]">
      {/* Card header — always visible */}
      <button
        type="button"
        onClick={onToggle}
        className="w-full p-4 text-left"
      >
        <div className="flex items-center gap-3">
          {/* Avatar */}
          <div
            className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br ${hueMap[run.status] ?? hueMap.running} ring-1 ring-white/10 text-sm font-semibold tracking-tight text-white/85`}
          >
            {abbr}
          </div>

          {/* Name + meta */}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="truncate font-semibold tracking-tight text-white/90">
                {run.account_name}
              </span>
              <StatusBadge status={run.status} />
            </div>
            <div className="mt-0.5 flex items-center gap-2 text-[11px] text-white/40">
              <span>{relativeTime(run.started_at)}</span>
              {cost && (
                <>
                  <span>·</span>
                  <span>{cost}</span>
                </>
              )}
              {preview && (
                <>
                  <span>·</span>
                  <span className="truncate max-w-[260px]">{preview}</span>
                </>
              )}
            </div>
          </div>

          {/* Chevron */}
          <motion.div
            animate={{ rotate: expanded ? 180 : 0 }}
            transition={{ duration: 0.2 }}
            className="shrink-0 text-white/35"
          >
            <ChevronDown size={16} />
          </motion.div>
        </div>
      </button>

      {/* Expandable detail */}
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            key="detail"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.25, 0, 0, 1] }}
            className="overflow-hidden"
          >
            <div className="border-t border-white/[0.06] px-4 pb-5 pt-4">
              <RunDetail runId={run.id} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ---------- HistoryTab ----------

export function HistoryTab(): React.ReactElement {
  const { runs, loading, refresh } = useRunHistory(80)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const grouped = groupByDay(runs)

  return (
    <motion.div
      key="history"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.2 }}
      className="space-y-6"
    >
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-white/65">
          <History size={14} />
          <span className="text-sm font-medium">
            {loading ? 'Loading…' : runs.length === 0 ? 'No scouts yet' : `${runs.length} scout${runs.length === 1 ? '' : 's'}`}
          </span>
        </div>
        <button
          type="button"
          onClick={() => void refresh()}
          className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-1.5 text-xs text-white/50 transition-colors hover:bg-white/[0.05] hover:text-white/80"
        >
          Refresh
        </button>
      </div>

      {/* Loading skeleton */}
      {loading && <HistorySkeleton />}

      {/* Empty state */}
      {!loading && runs.length === 0 && (
        <div className="glass rounded-2xl p-12">
          <div className="grid place-items-center text-center">
            <div className="grid h-16 w-16 place-items-center rounded-2xl bg-white/[0.05] ring-1 ring-white/10">
              <History size={26} className="text-white/50" />
            </div>
            <h2 className="mt-4 text-base font-semibold tracking-tight text-white/80">
              No scouts yet
            </h2>
            <p className="mt-1.5 max-w-xs text-sm text-white/45">
              Run your first scout from the sidebar. Completed briefs and blocked checks will appear here.
            </p>
          </div>
        </div>
      )}

      {/* Grouped run list */}
      {!loading &&
        grouped.map(({ bucket, runs: bucketRuns }) => (
          <div key={bucket} className="space-y-2">
            <h3 className="text-[10px] font-semibold uppercase tracking-[0.15em] text-white/35">
              {bucket}
            </h3>
            {bucketRuns.map((run) => (
              <HistoryCard
                key={run.id}
                run={run}
                expanded={expandedId === run.id}
                onToggle={() =>
                  setExpandedId((prev) => (prev === run.id ? null : run.id))
                }
              />
            ))}
          </div>
        ))}
    </motion.div>
  )
}

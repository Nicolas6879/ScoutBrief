'use client'

import { AnimatePresence, motion } from 'framer-motion'
import {
  CheckCircle2,
  ChevronDown,
  Compass,
  Database,
  ExternalLink,
  Filter,
  ShieldOff,
} from 'lucide-react'
import { useState } from 'react'
import { useAuditFeed, useTechnicalView, useWatchlist } from '@/lib/hooks'
import type { Decision, DecisionStatus } from '@/lib/types'

// ---------- helpers ----------

function relativeTime(ts: number): string {
  const diffMs = Date.now() - ts
  const diffMin = Math.floor(diffMs / 60_000)
  if (diffMin < 1) return 'just now'
  if (diffMin < 60) return `${diffMin}m ago`
  const diffH = Math.floor(diffMin / 60)
  if (diffH < 24) return `${diffH}h ago`
  return new Date(ts).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

const STAGE_FRIENDLY: Record<string, string> = {
  decision: 'Depth selected',
  counterparty: 'Vendor check',
  charge: 'Initial charge',
  spend: 'Budget check',
  tavily: 'Web research',
  synth: 'Brief generated',
  release: 'Funds released',
  approval: 'Final approval',
  audit: 'Hedera audit',
  blocked: 'Request blocked',
  refund: 'Refund issued',
  error: 'Error',
}

function stageFriendly(stage: string): string {
  return STAGE_FRIENDLY[stage] ?? stage
}

function hashscanHref(tx: string): string {
  const base = process.env.NEXT_PUBLIC_HASHSCAN_BASE ?? 'https://hashscan.io/testnet'
  if (tx.startsWith('http')) return tx
  const m = tx.match(/^(\d+\.\d+\.\d+)@(\d+)\.(\d+)$/)
  if (m) return `${base}/transaction/${m[1]}-${m[2]}-${m[3]}`
  return `${base}/transaction/${tx}`
}

// ---------- dot colour by status ----------

const DOT_CLASS: Record<DecisionStatus, string> = {
  ok: 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.5)]',
  blocked: 'bg-rose-400 shadow-[0_0_8px_rgba(251,113,133,0.5)]',
  active: 'bg-violet-400 shadow-[0_0_8px_rgba(167,139,250,0.5)]',
  info: 'bg-white/30',
}

const LINE_CLASS: Record<DecisionStatus, string> = {
  ok: 'border-emerald-400/20',
  blocked: 'border-rose-400/20',
  active: 'border-violet-400/20',
  info: 'border-white/[0.06]',
}

// ---------- AuditEntry ----------

interface EntryProps {
  decision: Decision
  accountName: string | null
  isLast: boolean
  technical: boolean
}

function AuditEntry({ decision: d, accountName, isLast, technical }: EntryProps): React.ReactElement {
  const [open, setOpen] = useState(false)

  const detail = (() => {
    if (!d.detail) return null
    try {
      return JSON.parse(d.detail) as Record<string, unknown>
    } catch {
      return null
    }
  })()

  return (
    <div className="flex gap-3">
      {/* Timeline spine */}
      <div className="flex flex-col items-center pt-0.5">
        <div className={`h-2.5 w-2.5 shrink-0 rounded-full ${DOT_CLASS[d.status]}`} />
        {!isLast && (
          <div className={`mt-1 w-px flex-1 border-l border-dashed ${LINE_CLASS[d.status]}`} />
        )}
      </div>

      {/* Entry body */}
      <div className="min-w-0 flex-1 pb-5">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="w-full text-left"
        >
          <div className="flex items-start gap-2">
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                {/* Stage label */}
                <span className="text-sm font-medium tracking-tight text-white/85">
                  {technical ? d.stage : stageFriendly(d.stage)}
                </span>
                {/* Account chip */}
                {(accountName ?? d.account_id) && (
                  <span className="rounded-md border border-white/[0.06] bg-white/[0.03] px-1.5 py-0.5 text-[10px] text-white/45">
                    {accountName ?? d.account_id.slice(0, 8)}
                  </span>
                )}
                {/* Status */}
                {d.status === 'blocked' && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-medium text-rose-300">
                    <ShieldOff size={9} />
                    Blocked
                  </span>
                )}
                {d.status === 'ok' && (
                  <span className="inline-flex items-center gap-1 text-[10px] text-emerald-300/75">
                    <CheckCircle2 size={9} />
                    Passed
                  </span>
                )}
              </div>
              <div className="mt-0.5 flex items-center gap-2 text-[11px] text-white/35">
                <span>{relativeTime(d.ts)}</span>
                {technical && (d.policy_name ?? d.hook_name) && (
                  <>
                    <span>·</span>
                    <span className="font-mono">{d.policy_name ?? d.hook_name}</span>
                  </>
                )}
              </div>
            </div>
            <motion.div
              animate={{ rotate: open ? 180 : 0 }}
              transition={{ duration: 0.18 }}
              className="mt-0.5 shrink-0 text-white/25"
            >
              <ChevronDown size={14} />
            </motion.div>
          </div>
        </button>

        {/* Expanded detail */}
        <AnimatePresence initial={false}>
          {open && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2, ease: [0.25, 0, 0, 1] }}
              className="overflow-hidden"
            >
              <div className="mt-3 space-y-3">
                {/* Detail JSON */}
                {detail && (
                  <div className="rounded-lg border border-white/[0.06] bg-black/20 p-3 font-mono text-[11px] leading-relaxed text-white/60">
                    {Object.entries(detail).map(([k, v]) => (
                      <div key={k} className="flex gap-2">
                        <span className="text-white/35">{k}:</span>
                        <span>{String(v)}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Run ID */}
                {technical && (
                  <div className="text-[10px] font-mono text-white/30">
                    run: {d.run_id}
                  </div>
                )}

                {/* Links */}
                <div className="flex flex-wrap gap-2">
                  {d.tx_id && (
                    <a
                      href={hashscanHref(d.tx_id)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-md border border-white/[0.07] bg-white/[0.03] px-2.5 py-1 text-[11px] text-white/55 transition-colors hover:bg-white/[0.06] hover:text-white"
                    >
                      <ExternalLink size={10} />
                      Tx on HashScan
                    </a>
                  )}
                  {d.hcs_ref && (
                    <a
                      href={(() => {
                        const base = process.env.NEXT_PUBLIC_HASHSCAN_BASE ?? 'https://hashscan.io/testnet'
                        return `${base}/topic/${d.hcs_ref}`
                      })()}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-md border border-cyan-400/15 bg-cyan-500/[0.05] px-2.5 py-1 text-[11px] text-cyan-300/70 transition-colors hover:bg-cyan-500/[0.1] hover:text-cyan-200"
                    >
                      <Database size={10} />
                      HCS record
                    </a>
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}

// ---------- Filter chips ----------

type FilterPreset = 'all' | 'blocked' | 'today' | 'week'

const PRESETS: { key: FilterPreset; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'blocked', label: 'Blocked only' },
  { key: 'today', label: 'Today' },
  { key: 'week', label: 'This week' },
]

function FilterChips({
  active,
  onChange,
}: {
  active: FilterPreset
  onChange: (p: FilterPreset) => void
}): React.ReactElement {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Filter size={13} className="text-white/35" />
      {PRESETS.map((p) => (
        <button
          key={p.key}
          type="button"
          onClick={() => onChange(p.key)}
          className={`relative rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
            active === p.key
              ? 'border-violet-400/40 bg-violet-500/15 text-violet-200'
              : 'border-white/[0.07] bg-white/[0.02] text-white/45 hover:bg-white/[0.04] hover:text-white/70'
          }`}
        >
          {p.key === active && (
            <motion.span
              layoutId="audit-filter-pill"
              className="absolute inset-0 rounded-full border border-violet-400/40 bg-violet-500/10"
            />
          )}
          <span className="relative">{p.label}</span>
        </button>
      ))}
    </div>
  )
}

// ---------- Skeleton ----------

function AuditSkeleton(): React.ReactElement {
  return (
    <div className="space-y-0">
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="flex gap-3">
          <div className="flex flex-col items-center pt-0.5">
            <div className="h-2.5 w-2.5 rounded-full bg-white/[0.07] animate-pulse" />
            {i < 4 && <div className="mt-1 w-px flex-1 bg-white/[0.04]" />}
          </div>
          <div className="min-w-0 flex-1 pb-5">
            <div className="animate-pulse space-y-1.5">
              <div className="h-3.5 w-40 rounded bg-white/[0.06]" />
              <div className="h-3 w-24 rounded bg-white/[0.04]" />
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

// ---------- AuditTab ----------

function presetToFilters(p: FilterPreset): import('@/lib/api').DecisionFilters {
  if (p === 'blocked') return { status: 'blocked', limit: 200 }
  if (p === 'today') {
    const sod = new Date()
    sod.setHours(0, 0, 0, 0)
    return { since: sod.getTime(), limit: 200 }
  }
  if (p === 'week') return { since: Date.now() - 7 * 86_400_000, limit: 200 }
  return { limit: 200 }
}

export function AuditTab(): React.ReactElement {
  const [preset, setPreset] = useState<FilterPreset>('all')
  const { decisions, loading, refresh } = useAuditFeed(presetToFilters(preset))
  const { accounts } = useWatchlist()
  const { technical } = useTechnicalView()

  const accountMap = new Map(accounts.map((a) => [a.id, a.name]))

  return (
    <motion.div
      key="audit"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.2 }}
      className="space-y-5"
    >
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <FilterChips active={preset} onChange={setPreset} />
        <div className="flex items-center gap-3">
          {!loading && (
            <span className="text-[11px] text-white/35">
              {decisions.length} event{decisions.length === 1 ? '' : 's'}
            </span>
          )}
          <button
            type="button"
            onClick={() => void refresh()}
            className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-1.5 text-xs text-white/50 transition-colors hover:bg-white/[0.05] hover:text-white/80"
          >
            Refresh
          </button>
        </div>
      </div>

      {/* Timeline */}
      <div className="glass rounded-2xl p-5">
        {loading && <AuditSkeleton />}

        {!loading && decisions.length === 0 && (
          <div className="grid place-items-center py-12 text-center">
            <div className="grid h-14 w-14 place-items-center rounded-2xl bg-white/[0.04] ring-1 ring-white/[0.08]">
              <Compass size={22} className="text-white/45" />
            </div>
            <h3 className="mt-4 text-sm font-semibold text-white/70">
              {preset === 'blocked'
                ? 'No blocks recorded'
                : preset === 'today'
                  ? 'No activity today'
                  : preset === 'week'
                    ? 'No activity this week'
                    : 'No audit events yet'}
            </h3>
            <p className="mt-1 max-w-xs text-xs text-white/40">
              {preset === 'all'
                ? 'Run a scout from the sidebar and every decision will appear here in real time.'
                : 'Try the "All" filter or run a new scout.'}
            </p>
          </div>
        )}

        {!loading && decisions.length > 0 && (
          <div>
            {decisions.map((d, i) => (
              <AuditEntry
                key={d.id}
                decision={d}
                accountName={accountMap.get(d.account_id) ?? null}
                isLast={i === decisions.length - 1}
                technical={technical}
              />
            ))}
          </div>
        )}
      </div>
    </motion.div>
  )
}

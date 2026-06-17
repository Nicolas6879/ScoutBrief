'use client'

import type { LaneEvent, LaneKey } from '@/lib/types'

const LANES: { key: LaneKey; title: string; subtitle: string }[] = [
  { key: 'pre-tool', title: 'Pre-Tool', subtitle: 'CounterpartyAllowlistPolicy · auditLogHook' },
  {
    key: 'post-param-norm',
    title: 'Post-Param-Norm',
    subtitle: 'SpendLimitPolicy',
  },
  { key: 'post-core', title: 'Post-Core', subtitle: 'ContextualApprovalPolicy' },
  { key: 'post-tool', title: 'Post-Tool', subtitle: 'HcsAuditTrailHook · settlement' },
]

export function PolicyLanes({ events }: { events: LaneEvent[] }): React.ReactElement {
  const latest: Record<LaneKey, LaneEvent | undefined> = {
    'pre-tool': undefined,
    'post-param-norm': undefined,
    'post-core': undefined,
    'post-tool': undefined,
  }
  for (const ev of events) latest[ev.lane] = ev

  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
      {LANES.map((l) => {
        const ev = latest[l.key]
        const status = ev?.status ?? 'idle'
        const colorClass =
          status === 'ok'
            ? 'bg-[color:var(--color-ok)]/15 border-[color:var(--color-ok)]/40 text-[color:var(--color-ok)]'
            : status === 'blocked'
              ? 'bg-[color:var(--color-blocked)]/15 border-[color:var(--color-blocked)]/40 text-[color:var(--color-blocked)] stage-flash-blocked'
              : status === 'active'
                ? 'bg-[color:var(--color-accent)]/15 border-[color:var(--color-accent)]/40 text-[color:var(--color-accent)] stage-pulse'
                : 'bg-[color:var(--color-panel-2)] border-[color:var(--color-border)] text-[color:var(--color-muted)]'
        const dot =
          status === 'ok'
            ? '●'
            : status === 'blocked'
              ? '⊘'
              : status === 'active'
                ? '◐'
                : '○'
        return (
          <div
            key={l.key}
            className={`rounded-lg border p-3 transition-all ${colorClass}`}
          >
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold uppercase tracking-wide">{l.title}</div>
              <div className="text-xl leading-none">{dot}</div>
            </div>
            <div className="mt-1 text-[11px] opacity-70">{l.subtitle}</div>
            <div className="mt-3 text-xs min-h-[2.5rem]">
              {ev?.detail ?? <span className="opacity-50">waiting…</span>}
            </div>
            {(ev?.policyName || ev?.hookName) && (
              <div className="mt-2 text-[10px] uppercase tracking-wider opacity-60">
                {ev.policyName ?? ev.hookName}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

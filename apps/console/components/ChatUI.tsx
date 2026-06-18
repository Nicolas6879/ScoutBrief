'use client'

import { useCallback, useMemo, useState } from 'react'
import { runAgentStream } from '@/lib/sseClient'
import type { BriefStep, DoneEvent, LaneEvent, LaneKey } from '@/lib/types'
import { PolicyLanes } from './PolicyLanes'
import { HashScanLink, HcsTopicLink } from './HashScanLink'
import { BriefRenderer } from './BriefRenderer'

interface StepEntry {
  step: BriefStep
  at: number
}

export function ChatUI(): React.ReactElement {
  const [topic, setTopic] = useState('Anthropic')
  const [email, setEmail] = useState('')
  const [running, setRunning] = useState(false)
  const [steps, setSteps] = useState<StepEntry[]>([])
  const [done, setDone] = useState<DoneEvent | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [auditTopic, setAuditTopic] = useState<string | null>(null)

  const laneEvents = useMemo<LaneEvent[]>(() => mapStepsToLanes(steps), [steps])

  const start = useCallback(async (): Promise<void> => {
    setSteps([])
    setDone(null)
    setError(null)
    setRunning(true)
    await runAgentStream({
      body: { topic, email },
      onMessage: (msg) => {
        if (msg.event === 'step') {
          const step = msg.data as BriefStep
          setSteps((prev) => [...prev, { step, at: Date.now() }])
          if (step.stage === 'audit') setAuditTopic(step.topic)
        } else if (msg.event === 'done') {
          setDone(msg.data as DoneEvent)
        } else if (msg.event === 'error') {
          setError((msg.data as { reason?: string }).reason ?? 'stream error')
        }
      },
      onError: (err) => setError(err.message),
    })
    setRunning(false)
  }, [topic, email])

  const canRun = topic.trim().length > 1 && /\S+@\S+\.\S+/.test(email) && !running

  return (
    <div className="min-h-screen px-4 py-8 md:px-10">
      <header className="max-w-6xl mx-auto mb-8">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-2">
          <div>
            <h1 className="text-3xl md:text-4xl font-semibold tracking-tight">
              Scout<span className="text-[color:var(--color-accent)]">Brief</span>
            </h1>
            <p className="text-sm text-[color:var(--color-muted)] mt-1">
              Reference implementation of the Hedera Agent Kit V4 Hooks &amp; Policies pattern
              · spend caps · counterparty allowlists · contextual approval · on-chain audit
            </p>
          </div>
          <div className="flex gap-3 text-xs text-[color:var(--color-muted)]">
            {auditTopic && <HcsTopicLink topicId={auditTopic} label="audit topic" />}
            <a
              href="https://github.com/Nicolas6879/ScoutBrief"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[color:var(--color-accent)] hover:underline"
            >
              ↗ source
            </a>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-[1fr_1.4fr] gap-6">
        <section className="rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-[color:var(--color-muted)] mb-4">
            Request
          </h2>
          <div className="space-y-3">
            <Field label="Topic (startup name)">
              <input
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="Anthropic"
                className="w-full rounded-md bg-[color:var(--color-panel-2)] border border-[color:var(--color-border)] px-3 py-2 text-sm outline-none focus:border-[color:var(--color-accent)]"
              />
            </Field>
            <Field label="Email">
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                type="email"
                className="w-full rounded-md bg-[color:var(--color-panel-2)] border border-[color:var(--color-border)] px-3 py-2 text-sm outline-none focus:border-[color:var(--color-accent)]"
              />
            </Field>
            <button
              onClick={start}
              disabled={!canRun}
              className="w-full rounded-md bg-[color:var(--color-accent)] disabled:opacity-40 disabled:cursor-not-allowed hover:brightness-110 transition px-4 py-2.5 text-sm font-semibold"
            >
              {running ? 'Brief in flight…' : 'Buy brief (≈ 0.05 HBAR)'}
            </button>
            <div className="text-[11px] text-[color:var(--color-muted)] leading-relaxed">
              The agent charges 0.05 HBAR to an escrow account, searches Tavily, synthesizes via Groq
              (Llama 3.3 70b) or Gemini fallback, then releases the escrow — every transfer is gated
              by the V4 policies on the right. The synthesized brief renders below; email delivery is
              best-effort (Resend free tier delivers only to the verified owner&apos;s inbox).
            </div>
          </div>

          <StepsFeed steps={steps} />

          {done && (
            <>
              <ResultPanel done={done} steps={steps} />
              {done.briefMarkdown && <BriefInlinePanel markdown={done.briefMarkdown} />}
            </>
          )}
          {error && (
            <div className="mt-4 rounded-md border border-[color:var(--color-blocked)]/40 bg-[color:var(--color-blocked)]/10 p-3 text-sm">
              <div className="font-semibold text-[color:var(--color-blocked)]">Error</div>
              <div className="mt-1 text-xs">{error}</div>
            </div>
          )}
        </section>

        <section className="rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-[color:var(--color-muted)]">
              Policy Console · Agent Kit V4 lifecycle
            </h2>
            <span className="text-[10px] text-[color:var(--color-muted)] uppercase tracking-wider">
              4 stages
            </span>
          </div>
          <PolicyLanes events={laneEvents} />

          <div className="mt-6">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-[color:var(--color-muted)] mb-2">
              Brief categories satisfied
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-xs">
              <Pill label="spend limits" satisfied />
              <Pill label="allowed counterparties" satisfied />
              <Pill label="contextual approval" satisfied />
            </div>
          </div>
        </section>
      </main>

      <footer className="max-w-6xl mx-auto mt-8 text-center text-[11px] text-[color:var(--color-muted)]">
        Hedera AI Bounty · Week 5 · Policy Agent · testnet · zero-cost stack
      </footer>
    </div>
  )
}

function Field({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}): React.ReactElement {
  return (
    <label className="block">
      <span className="block text-[11px] text-[color:var(--color-muted)] uppercase tracking-wider mb-1">
        {label}
      </span>
      {children}
    </label>
  )
}

function Pill({ label, satisfied }: { label: string; satisfied: boolean }): React.ReactElement {
  return (
    <div
      className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 ${
        satisfied
          ? 'border-[color:var(--color-ok)]/40 bg-[color:var(--color-ok)]/10 text-[color:var(--color-ok)]'
          : 'border-[color:var(--color-border)] text-[color:var(--color-muted)]'
      }`}
    >
      <span>{satisfied ? '✓' : '·'}</span>
      <span>{label}</span>
    </div>
  )
}

function StepsFeed({ steps }: { steps: StepEntry[] }): React.ReactElement | null {
  if (steps.length === 0) return null
  return (
    <ol className="mt-5 space-y-1 text-xs font-mono text-[color:var(--color-muted)] max-h-[34vh] overflow-auto">
      {steps.map((s, i) => (
        <li key={i} className="flex items-start gap-2">
          <span className="text-[color:var(--color-accent)] w-4 shrink-0">›</span>
          <StepLine entry={s} />
        </li>
      ))}
    </ol>
  )
}

function StepLine({ entry }: { entry: StepEntry }): React.ReactElement {
  const s = entry.step
  switch (s.stage) {
    case 'decision':
      return (
        <span>
          <strong>decision</strong> → depth=<em>{s.depth}</em>; {s.reason}
        </span>
      )
    case 'charge':
      return (
        <span className={s.ok ? 'text-[color:var(--color-ok)]' : 'text-[color:var(--color-blocked)]'}>
          <strong>charge</strong> {s.ok ? 'OK' : 'BLOCKED'}{' '}
          {s.reason && <span className="opacity-70">— {s.reason.slice(0, 100)}</span>}
        </span>
      )
    case 'tavily':
      return (
        <span>
          <strong>tavily</strong> {s.count} results · {s.ms}ms
        </span>
      )
    case 'synth':
      return (
        <span>
          <strong>synth</strong> ({s.provider}) {s.chars} chars · {s.ms}ms
        </span>
      )
    case 'resend':
      return (
        <span>
          <strong>resend</strong> msg=<code>{s.messageId.slice(0, 8)}</code> · {s.ms}ms
        </span>
      )
    case 'email_skipped':
      return (
        <span className="text-[color:var(--color-warn)]">
          <strong>email</strong> skipped — {s.reason.slice(0, 140)}
        </span>
      )
    case 'release':
      return (
        <span className={s.ok ? 'text-[color:var(--color-ok)]' : 'text-[color:var(--color-blocked)]'}>
          <strong>release</strong> {s.ok ? 'OK' : 'FAIL'}{' '}
          {s.txOutput && <HashScanLink txOutput={s.txOutput} label="tx" />}
        </span>
      )
    case 'refund':
      return (
        <span className="text-[color:var(--color-warn)]">
          <strong>refund</strong> {s.ok ? 'OK' : 'FAIL'}{' '}
          {s.txOutput && <HashScanLink txOutput={s.txOutput} label="tx" />}
        </span>
      )
    case 'audit':
      return (
        <span>
          <strong>audit</strong> hcs <code>{s.ref}</code>
        </span>
      )
    case 'blocked':
      return (
        <span className="text-[color:var(--color-blocked)]">
          <strong>blocked</strong> by <em>{s.policyName ?? 'policy'}</em> — {s.reason.slice(0, 140)}
        </span>
      )
    case 'error':
      return (
        <span className="text-[color:var(--color-blocked)]">
          <strong>error</strong> {s.reason.slice(0, 160)}
        </span>
      )
  }
}

function ResultPanel({ done, steps }: { done: DoneEvent; steps: StepEntry[] }): React.ReactElement {
  const releaseStep = steps.find((s) => s.step.stage === 'release')
  const chargeStep = steps.find((s) => s.step.stage === 'charge')
  const refundStep = steps.find((s) => s.step.stage === 'refund')
  const emailSkipped = steps.some((s) => s.step.stage === 'email_skipped')

  let title: string
  let toneClass: string
  if (!done.ok) {
    title = '⊘ Brief blocked · funds refunded on-chain'
    toneClass = 'border-[color:var(--color-blocked)]/40 bg-[color:var(--color-blocked)]/10 text-[color:var(--color-blocked)]'
  } else if (emailSkipped) {
    title = '✓ Brief synthesized · email skipped (sandbox)'
    toneClass = 'border-[color:var(--color-warn)]/40 bg-[color:var(--color-warn)]/10 text-[color:var(--color-warn)]'
  } else {
    title = '✓ Brief delivered'
    toneClass = 'border-[color:var(--color-ok)]/40 bg-[color:var(--color-ok)]/10 text-[color:var(--color-ok)]'
  }

  return (
    <div className={`mt-4 rounded-md border p-3 text-sm ${toneClass}`}>
      <div className="font-semibold">{title}</div>
      <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-[color:var(--color-text)]">
        <dt className="text-[color:var(--color-muted)]">request</dt>
        <dd className="font-mono">{done.requestId.slice(0, 12)}…</dd>
        {done.briefChars && (
          <>
            <dt className="text-[color:var(--color-muted)]">brief</dt>
            <dd>{done.briefChars} chars</dd>
          </>
        )}
        {done.emailMessageId && (
          <>
            <dt className="text-[color:var(--color-muted)]">email</dt>
            <dd className="font-mono">{done.emailMessageId.slice(0, 8)}…</dd>
          </>
        )}
        {done.policyName && (
          <>
            <dt className="text-[color:var(--color-muted)]">blocked by</dt>
            <dd className="text-[color:var(--color-blocked)] font-semibold">{done.policyName}</dd>
          </>
        )}
      </dl>
      <div className="mt-3 flex flex-wrap gap-3">
        {chargeStep?.step.stage === 'charge' && chargeStep.step.txOutput && (
          <HashScanLink txOutput={chargeStep.step.txOutput} label="charge tx" />
        )}
        {releaseStep?.step.stage === 'release' && releaseStep.step.txOutput && (
          <HashScanLink txOutput={releaseStep.step.txOutput} label="release tx" />
        )}
        {refundStep?.step.stage === 'refund' && refundStep.step.txOutput && (
          <HashScanLink txOutput={refundStep.step.txOutput} label="refund tx" />
        )}
      </div>
    </div>
  )
}

function BriefInlinePanel({ markdown }: { markdown: string }): React.ReactElement {
  return (
    <div className="mt-4 rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-panel-2)] p-5">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-[color:var(--color-muted)]">
          Brief delivered to screen
        </h3>
        <span className="text-[10px] text-[color:var(--color-muted)]">
          synthesized from Tavily sources
        </span>
      </div>
      <BriefRenderer markdown={markdown} />
    </div>
  )
}

function mapStepsToLanes(entries: StepEntry[]): LaneEvent[] {
  const events: LaneEvent[] = []
  for (const { step, at } of entries) {
    switch (step.stage) {
      case 'decision':
        events.push({
          lane: 'pre-tool',
          status: 'active',
          hookName: 'auditLogHook',
          detail: `depth = ${step.depth}`,
          timestamp: at,
        })
        break
      case 'audit':
        // Audit events fill in the post-tool lane (settlement hook) optimistically
        events.push({
          lane: 'post-tool',
          status: 'ok',
          hookName: 'HcsAuditTrailHook',
          detail: `hcs ${step.ref}`,
          timestamp: at,
        })
        break
      case 'charge':
        if (step.ok) {
          events.push({
            lane: 'pre-tool',
            status: 'ok',
            policyName: 'CounterpartyAllowlistPolicy',
            detail: 'allowlist + cap ok',
            timestamp: at,
          })
          events.push({
            lane: 'post-param-norm',
            status: 'ok',
            policyName: 'SpendLimitPolicy',
            detail: 'under per-brief + 24h cap',
            timestamp: at,
          })
        } else {
          // Try to identify which lane blocked from the reason text
          const blamedLane: LaneKey = step.reason?.includes('SpendLimitPolicy')
            ? 'post-param-norm'
            : 'pre-tool'
          events.push({
            lane: blamedLane,
            status: 'blocked',
            policyName: step.reason?.match(/(\w+Policy)/)?.[1],
            detail: 'transfer rejected',
            timestamp: at,
          })
        }
        break
      case 'tavily':
      case 'synth':
      case 'resend':
      case 'email_skipped':
        // These belong to the agent core action surface — not a Kit lifecycle
        // stage, but we surface them in the Post-Core lane for visual continuity.
        events.push({
          lane: 'post-core',
          status: 'active',
          detail:
            step.stage === 'email_skipped'
              ? 'email skipped (sandbox)'
              : `${step.stage} active`,
          timestamp: at,
        })
        break
      case 'release':
        events.push({
          lane: 'post-core',
          status: step.ok ? 'ok' : 'blocked',
          policyName: 'ContextualApprovalPolicy',
          detail: step.ok ? 'settlement released' : 'settlement failed',
          timestamp: at,
        })
        break
      case 'refund':
        events.push({
          lane: 'post-core',
          status: 'ok',
          policyName: 'ContextualApprovalPolicy',
          detail: step.ok ? 'refund issued on-chain' : 'refund failed',
          timestamp: at,
        })
        break
      case 'blocked':
        events.push({
          lane: 'pre-tool',
          status: 'blocked',
          policyName: step.policyName,
          detail: step.reason.slice(0, 80),
          timestamp: at,
        })
        break
      case 'error':
        events.push({
          lane: 'post-core',
          status: 'blocked',
          detail: step.reason.slice(0, 80),
          timestamp: at,
        })
        break
    }
  }
  return events
}

// Shared types between the SSE feed (server) and the dashboard.

export type BriefStep =
  | { stage: 'decision'; depth: 'lite' | 'standard' | 'deep'; reason: string }
  | { stage: 'charge'; ok: boolean; txOutput?: string; reason?: string }
  | { stage: 'tavily'; count: number; ms: number }
  | { stage: 'synth'; provider: 'groq' | 'gemini'; chars: number; ms: number }
  | { stage: 'release'; ok: boolean; txOutput?: string; reason?: string }
  | { stage: 'refund'; ok: boolean; txOutput?: string; reason?: string }
  | { stage: 'audit'; topic: string; ref: string }
  | { stage: 'blocked'; policyName?: string; reason: string }
  | { stage: 'error'; reason: string }

export interface DoneEvent {
  ok: boolean
  requestId: string
  runId?: string
  accountId?: string
  briefChars?: number
  briefMarkdown?: string
  policyName?: string
  reason?: string
}

// ---------- Watchlist accounts ----------

export type AccountStatus = 'ok' | 'blocked' | 'refunded' | null

export interface Account {
  id: string
  name: string
  created_at: number
  last_run_at: number | null
  last_status: AccountStatus
}

// ---------- Runs + decisions (history + audit) ----------

export type RunStatus = 'running' | 'ok' | 'blocked' | 'refunded' | 'error'

export interface Run {
  id: string
  account_id: string
  account_name: string
  batch_id: string
  started_at: number
  finished_at: number | null
  status: RunStatus
  blocked_policy: string | null
  blocked_reason: string | null
  cost_tinybars: number | null
  brief_markdown: string | null
  charge_tx: string | null
  release_tx: string | null
  refund_tx: string | null
  audit_topic: string | null
  audit_consensus: string | null
}

export type DecisionStatus = 'ok' | 'blocked' | 'active' | 'info'

export interface Decision {
  id: string
  run_id: string
  account_id: string
  ts: number
  stage: string
  policy_name: string | null
  hook_name: string | null
  status: DecisionStatus
  detail: string | null
  tx_id: string | null
  hcs_ref: string | null
}

export interface Budget {
  daily_used_tinybars: number
  daily_limit_tinybars: number
  per_brief_limit_tinybars: number
  pct_used: number
}

// ---------- Pipeline state (live tab) ----------

export type PipelineNodeKey =
  | 'request'
  | 'counterparty'
  | 'charge'
  | 'spend'
  | 'research'
  | 'approval'
  | 'audit'

export type PipelineNodeStatus = 'idle' | 'active' | 'ok' | 'blocked' | 'held'

export interface PipelineNodeState {
  key: PipelineNodeKey
  status: PipelineNodeStatus
  startedAt?: number
  finishedAt?: number
  detail?: string
}

// ---------- SSE event union for scout/run ----------

export interface BatchStartEvent {
  batchId: string
  accounts: { id: string; name: string }[]
}

export interface RunStartEvent {
  batchId: string
  runId: string
  account: { id: string; name: string }
}

export interface StreamStepEvent {
  batchId: string
  runId: string
  accountId: string
  step: BriefStep
}

export interface RunDoneEvent {
  batchId: string
  runId: string
  accountId: string
  ok: boolean
  briefChars?: number
  briefMarkdown?: string
  policyName?: string
  reason?: string
}

export interface RunErrorEvent {
  batchId: string
  runId: string
  accountId: string
  reason: string
}

export interface BatchDoneEvent {
  batchId: string
}

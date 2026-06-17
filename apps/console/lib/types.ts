// Shared types between the SSE feed (server) and the UI (client).
// Kept as a small local copy of the agent's BriefStep so the console
// has zero workspace coupling (so Vercel builds cleanly without the
// agent workspace being installed alongside).

export type BriefStep =
  | { stage: 'decision'; depth: 'lite' | 'standard' | 'deep'; reason: string }
  | { stage: 'charge'; ok: boolean; txOutput?: string; reason?: string }
  | { stage: 'tavily'; count: number; ms: number }
  | { stage: 'synth'; provider: 'groq' | 'gemini'; chars: number; ms: number }
  | { stage: 'resend'; messageId: string; ms: number }
  | { stage: 'release'; ok: boolean; txOutput?: string; reason?: string }
  | { stage: 'refund'; ok: boolean; txOutput?: string; reason?: string }
  | { stage: 'audit'; topic: string; ref: string }
  | { stage: 'blocked'; policyName?: string; reason: string }
  | { stage: 'error'; reason: string }

export interface DoneEvent {
  ok: boolean
  requestId: string
  emailMessageId?: string
  briefChars?: number
  policyName?: string
  reason?: string
}

// V4 lifecycle stage mapping for the 4-lane Policy Console.
// Lanes are: Pre-Tool, Post-Param-Norm, Post-Core, Post-Tool.
export type LaneKey = 'pre-tool' | 'post-param-norm' | 'post-core' | 'post-tool'

export interface LaneEvent {
  lane: LaneKey
  status: 'idle' | 'ok' | 'blocked' | 'active'
  policyName?: string
  hookName?: string
  detail?: string
  timestamp: number
}

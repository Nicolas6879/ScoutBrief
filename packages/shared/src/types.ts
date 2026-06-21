import { z } from 'zod'

export const BriefDepth = z.enum(['lite', 'standard', 'deep'])
export type BriefDepth = z.infer<typeof BriefDepth>

export const BriefRequestSchema = z.object({
  topic: z.string().min(1).max(120),
  accountName: z.string().min(1).max(120).optional(),
  accountId: z.string().min(1).max(64).optional(),
  runId: z.string().uuid().optional(),
  batchId: z.string().uuid().optional(),
  requestId: z.string().uuid().optional(),
})
export type BriefRequest = z.infer<typeof BriefRequestSchema>

export const LifecycleStage = z.enum([
  'pre-tool',
  'post-param-normalization',
  'post-core-action',
  'post-tool',
])
export type LifecycleStage = z.infer<typeof LifecycleStage>

export const PolicyEventSchema = z.object({
  stage: z.number().int().min(1).max(7),
  status: z.enum(['passed', 'blocked', 'logged', 'hold-scheduled', 'committed']),
  policyName: z.string(),
  message: z.string(),
  metadata: z.record(z.unknown()).optional(),
  timestamp: z.number(),
})
export type PolicyEvent = z.infer<typeof PolicyEventSchema>

export const PolicyResultSchema = z.object({
  allow: z.boolean(),
  reason: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
})
export type PolicyResult = z.infer<typeof PolicyResultSchema>

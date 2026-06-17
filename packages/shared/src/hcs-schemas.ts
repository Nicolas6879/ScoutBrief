import { z } from 'zod'

export const POLICY_MANIFEST_SCHEMA_ID = 'scoutbrief.policy_manifest.v1'
export const AUDIT_EVENT_SCHEMA_ID = 'scoutbrief.audit_event.v1'

export const PolicyManifestSchema = z.object({
  schema: z.literal(POLICY_MANIFEST_SCHEMA_ID),
  version: z.string(),
  agentName: z.string(),
  hooks: z.array(
    z.object({
      stage: z.string(),
      name: z.string(),
      blocking: z.literal(false),
    }),
  ),
  policies: z.array(
    z.object({
      stage: z.string(),
      name: z.string(),
      blocking: z.literal(true),
      briefCategory: z.enum(['spend_limits', 'counterparties', 'contextual_approval']),
      config: z.record(z.unknown()),
    }),
  ),
  publishedAt: z.string(),
  publishedBy: z.string(),
})
export type PolicyManifest = z.infer<typeof PolicyManifestSchema>

export const AuditEventSchema = z.object({
  schema: z.literal(AUDIT_EVENT_SCHEMA_ID),
  eventType: z.enum([
    'intent_logged',
    'decision_complete',
    'policy_blocked',
    'refund_issued',
    'release_executed',
  ]),
  policyManifestTopicId: z.string(),
  requestId: z.string(),
  params: z.record(z.unknown()).optional(),
  decisionTrace: z.string().optional(),
  txIds: z.array(z.string()).optional(),
  timestamp: z.number(),
})
export type AuditEvent = z.infer<typeof AuditEventSchema>

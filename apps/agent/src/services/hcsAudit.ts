/**
 * HCS audit topic helpers — writes scoutbrief.audit_event.v1 messages to the
 * audit topic created during M1.1.
 *
 * Fire-and-forget: callers should NOT await this for critical path latency.
 */
import { Client, PrivateKey, TopicMessageSubmitTransaction } from '@hiero-ledger/sdk'
import {
  AUDIT_EVENT_SCHEMA_ID,
  type AuditEvent,
  AuditEventSchema,
} from '@scoutbrief/shared'

let cachedClient: Client | null = null

function getLoggingClient(): Client {
  if (cachedClient) return cachedClient
  const operatorId = process.env.HEDERA_OPERATOR_ID
  const operatorKey = process.env.HEDERA_OPERATOR_KEY
  if (!operatorId || !operatorKey) throw new Error('Hedera operator env missing')
  const c = Client.forTestnet()
  c.setOperator(operatorId, PrivateKey.fromStringDer(operatorKey))
  cachedClient = c
  return c
}

export interface WriteAuditArgs {
  eventType: AuditEvent['eventType']
  requestId: string
  params?: Record<string, unknown>
  decisionTrace?: string
  txIds?: string[]
}

/**
 * Write an audit event to the HCS audit topic. Fire-and-forget: returns immediately
 * with a promise that resolves when chain consensus is reached, but callers can
 * ignore the promise for low-latency critical paths.
 */
export async function writeAuditEvent(args: WriteAuditArgs): Promise<string> {
  const topicId = process.env.HCS_AUDIT_TOPIC
  const policyTopicId = process.env.HCS_POLICY_MANIFEST_TOPIC
  if (!topicId || !policyTopicId) throw new Error('HCS audit topic env missing')

  const event: AuditEvent = {
    schema: AUDIT_EVENT_SCHEMA_ID,
    eventType: args.eventType,
    policyManifestTopicId: policyTopicId,
    requestId: args.requestId,
    params: args.params,
    decisionTrace: args.decisionTrace,
    txIds: args.txIds,
    timestamp: Date.now(),
  }

  // Validate before writing so we never poison the audit log with bad shapes
  AuditEventSchema.parse(event)

  const client = getLoggingClient()
  const message = JSON.stringify(event)
  const tx = await new TopicMessageSubmitTransaction()
    .setTopicId(topicId)
    .setMessage(message)
    .execute(client)
  const receipt = await tx.getReceipt(client)
  return `${topicId}@${receipt.topicSequenceNumber?.toString() ?? '0'}`
}

/**
 * Close the underlying client (used in tests / shutdown).
 */
export function closeHcsClient(): void {
  if (cachedClient) {
    cachedClient.close()
    cachedClient = null
  }
}

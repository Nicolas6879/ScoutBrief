/**
 * Hedera Agent Kit V4 toolkit setup.
 *
 * Wires:
 *   - core account + consensus plugins (provides transfer_hbar_tool + topic submit)
 *   - HcsAuditTrailHook (built-in, non-blocking) — observes every transfer
 *   - CounterpartyAllowlistPolicy (custom, blocking) — Pre-Tool
 *   - SpendLimitPolicy (custom, blocking) — Post-Param-Norm
 *   - ContextualApprovalPolicy (custom, blocking with hold side-effect) — Post-Core
 *
 * The toolkit exposes LangChain-compatible tools whose invocation routes through
 * the full V4 lifecycle, so each transfer call exercises all 4 stages.
 */
import { AgentMode } from '@hashgraph/hedera-agent-kit'
import { coreAccountPlugin, coreConsensusPlugin } from '@hashgraph/hedera-agent-kit/plugins'
import { HcsAuditTrailHook } from '@hashgraph/hedera-agent-kit/hooks'
import { HederaLangchainToolkit } from '@hashgraph/hedera-agent-kit-langchain'
import { getHederaClient } from './hedera/client.js'

// The kit returns its own tool wrapper objects; we only need .name and .invoke,
// both of which are LangChain-compatible at runtime.
type KitTool = { name: string; invoke: (input: unknown) => Promise<unknown> }
import { CounterpartyAllowlistPolicy } from './policies/counterpartyAllowlistPolicy.js'
import { SpendLimitPolicy } from './policies/spendLimitPolicy.js'
import { ContextualApprovalPolicy } from './policies/contextualApprovalPolicy.js'

const TRANSFER_HBAR_TOOL = 'transfer_hbar_tool'

let cachedToolkit: HederaLangchainToolkit | null = null
let cachedTools: KitTool[] | null = null

export function getToolkit(): HederaLangchainToolkit {
  if (cachedToolkit) return cachedToolkit
  const client = getHederaClient()

  const auditTopicId = process.env.HCS_AUDIT_TOPIC
  if (!auditTopicId) throw new Error('HCS_AUDIT_TOPIC missing in env')

  cachedToolkit = new HederaLangchainToolkit({
    client,
    configuration: {
      plugins: [coreAccountPlugin, coreConsensusPlugin],
      context: {
        mode: AgentMode.AUTONOMOUS,
        accountId: process.env.HEDERA_OPERATOR_ID,
        hooks: [
          // Built-in: writes pre/post transfer events to HCS audit topic.
          new HcsAuditTrailHook([TRANSFER_HBAR_TOOL], auditTopicId, client),
          // Custom blocking policies (each extends AbstractHook via AbstractPolicy):
          new CounterpartyAllowlistPolicy({ relevantTools: [TRANSFER_HBAR_TOOL] }),
          new SpendLimitPolicy({ relevantTools: [TRANSFER_HBAR_TOOL] }),
          new ContextualApprovalPolicy({ relevantTools: [TRANSFER_HBAR_TOOL] }),
        ],
      },
    },
  })
  return cachedToolkit
}

export function getTransferHbarTool(): KitTool {
  if (!cachedTools) cachedTools = getToolkit().getTools() as unknown as KitTool[]
  const t = cachedTools.find((x) => x.name === TRANSFER_HBAR_TOOL)
  if (!t) {
    const available = cachedTools.map((x) => x.name).join(', ')
    throw new Error(
      `transfer_hbar_tool not found in toolkit. Available: ${available}`,
    )
  }
  return t
}

/**
 * Result of a policy-gated HBAR transfer attempted via the kit.
 * On success: `ok=true`, tx receipt details surfaced through HCS audit + return string.
 * On block:   `ok=false`, `policyName` identifies which gate denied.
 */
export interface KitTransferResult {
  ok: boolean
  reason?: string
  policyName?: string
  rawOutput: string
}

/**
 * Invoke the kit's HBAR transfer tool with the full V4 lifecycle (hooks + policies fire).
 *
 * The transfer payload follows the kit's schema: `hbarTransfers: [{accountId, amount}, ...]`
 * where amount is in HBAR (NOT tinybars — the kit normalises this for us).
 */
export async function transferHbarViaKit(args: {
  fromAccountId: string
  toAccountId: string
  hbar: number
  memo?: string
}): Promise<KitTransferResult> {
  const tool = getTransferHbarTool()
  // Kit schema: `transfers` contains RECIPIENTS only (positive amounts in HBAR).
  // The sender is set via sourceAccountId (defaults to operator).
  const payload = {
    transfers: [{ accountId: args.toAccountId, amount: args.hbar }],
    sourceAccountId: args.fromAccountId,
    transactionMemo: args.memo,
  }
  try {
    const result = await tool.invoke(payload)
    const text = typeof result === 'string' ? result : JSON.stringify(result)
    // Heuristic: kit policies throw or surface an error string. We treat any
    // mention of "policy" + "block" / "denied" / "rejected" as a block.
    const lower = text.toLowerCase()
    if (
      lower.includes('blocked') ||
      lower.includes('denied') ||
      lower.includes('rejected') ||
      lower.includes('policy violation')
    ) {
      return {
        ok: false,
        reason: text,
        policyName: extractPolicyName(text),
        rawOutput: text,
      }
    }
    return { ok: true, rawOutput: text }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return {
      ok: false,
      reason: msg,
      policyName: extractPolicyName(msg),
      rawOutput: msg,
    }
  }
}

function extractPolicyName(text: string): string | undefined {
  const match = text.match(/(CounterpartyAllowlistPolicy|SpendLimitPolicy|ContextualApprovalPolicy)/)
  return match?.[1]
}

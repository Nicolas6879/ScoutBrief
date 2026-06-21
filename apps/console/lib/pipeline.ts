import type { LucideIcon } from 'lucide-react'
import {
  Brain,
  Database,
  FileSearch,
  Lock,
  ShieldCheck,
  Sparkles,
  Wallet,
} from 'lucide-react'
import type { PipelineNodeKey } from './types'

export interface NodeConfig {
  key: PipelineNodeKey
  friendlyLabel: string
  technicalLabel: string
  friendlyDescription: string
  technicalDescription: string
  icon: LucideIcon
  hue: 'violet' | 'cyan' | 'fuchsia' | 'emerald' | 'amber'
}

export const PIPELINE_NODES: NodeConfig[] = [
  {
    key: 'request',
    friendlyLabel: 'Request',
    technicalLabel: 'Tool invocation',
    friendlyDescription: 'A scout request enters the agent',
    technicalDescription: 'BuyBriefTool entry · params validated',
    icon: Sparkles,
    hue: 'violet',
  },
  {
    key: 'counterparty',
    friendlyLabel: 'Vendor check',
    technicalLabel: 'CounterpartyAllowlistPolicy',
    friendlyDescription: 'Confirms the vendors are approved',
    technicalDescription: 'Pre-Tool · endpoint allowlist + per-recipient cap',
    icon: ShieldCheck,
    hue: 'cyan',
  },
  {
    key: 'charge',
    friendlyLabel: 'Initial charge',
    technicalLabel: 'transfer_hbar_tool',
    friendlyDescription: 'Holds budget in an on-chain escrow',
    technicalDescription: 'Operator → Escrow · HcsAuditTrailHook fires',
    icon: Wallet,
    hue: 'violet',
  },
  {
    key: 'spend',
    friendlyLabel: 'Budget check',
    technicalLabel: 'SpendLimitPolicy',
    friendlyDescription: 'Verifies budget is available',
    technicalDescription: 'Post-Param-Norm · live mirror balance + caps',
    icon: Lock,
    hue: 'amber',
  },
  {
    key: 'research',
    friendlyLabel: 'Web research',
    technicalLabel: 'Tavily + LLM synth',
    friendlyDescription: 'Reads the web and writes the brief',
    technicalDescription: 'Tavily search → Groq / Gemini synthesis',
    icon: FileSearch,
    hue: 'fuchsia',
  },
  {
    key: 'approval',
    friendlyLabel: 'Final approval',
    technicalLabel: 'ContextualApprovalPolicy',
    friendlyDescription: 'Schedules settlement, then releases funds',
    technicalDescription: 'Post-Core · settlement hold + escrow release',
    icon: Brain,
    hue: 'emerald',
  },
  {
    key: 'audit',
    friendlyLabel: 'Hedera audit',
    technicalLabel: 'HCS audit topic',
    friendlyDescription: 'Records the decision on Hedera permanently',
    technicalDescription: 'HCS-2 audit topic · settlement hook',
    icon: Database,
    hue: 'cyan',
  },
]

export function nodeConfig(key: PipelineNodeKey): NodeConfig {
  const c = PIPELINE_NODES.find((n) => n.key === key)
  if (!c) throw new Error(`unknown node ${key}`)
  return c
}

export const PIPELINE_EDGES: { from: PipelineNodeKey; to: PipelineNodeKey }[] = [
  { from: 'request', to: 'counterparty' },
  { from: 'counterparty', to: 'charge' },
  { from: 'charge', to: 'spend' },
  { from: 'spend', to: 'research' },
  { from: 'research', to: 'approval' },
  { from: 'approval', to: 'audit' },
]

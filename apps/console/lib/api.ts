import type { Account, Budget, Decision, Run } from './types'

const BASE = process.env.NEXT_PUBLIC_AGENT_API_URL ?? 'http://localhost:3001'

async function jget<T>(path: string): Promise<T> {
  const r = await fetch(`${BASE}${path}`, { cache: 'no-store' })
  if (!r.ok) throw new Error(`GET ${path} → HTTP ${r.status}`)
  return (await r.json()) as T
}

async function jpost<T>(path: string, body: unknown): Promise<T> {
  const r = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!r.ok) {
    const detail = await r.text().catch(() => '')
    throw new Error(`POST ${path} → HTTP ${r.status} ${detail.slice(0, 120)}`)
  }
  return (await r.json()) as T
}

async function jdelete<T>(path: string): Promise<T> {
  const r = await fetch(`${BASE}${path}`, { method: 'DELETE' })
  if (!r.ok) throw new Error(`DELETE ${path} → HTTP ${r.status}`)
  return (await r.json()) as T
}

// ---------- Accounts ----------

export async function fetchAccounts(): Promise<Account[]> {
  const data = await jget<{ accounts: Account[] }>('/accounts')
  return data.accounts
}

export async function createAccount(name: string): Promise<Account> {
  const data = await jpost<{ account: Account }>('/accounts', { name })
  return data.account
}

export async function deleteAccount(id: string): Promise<void> {
  await jdelete(`/accounts/${encodeURIComponent(id)}`)
}

// ---------- Runs ----------

export async function fetchRuns(limit = 50, offset = 0): Promise<Run[]> {
  const data = await jget<{ runs: Run[] }>(`/runs?limit=${limit}&offset=${offset}`)
  return data.runs
}

export async function fetchRunDetail(id: string): Promise<{ run: Run; decisions: Decision[] }> {
  return jget<{ run: Run; decisions: Decision[] }>(`/runs/${encodeURIComponent(id)}`)
}

// ---------- Decisions (audit feed) ----------

export interface DecisionFilters {
  accountId?: string
  runId?: string
  status?: 'ok' | 'blocked' | 'active' | 'info'
  since?: number
  limit?: number
}

export async function fetchDecisions(filters: DecisionFilters = {}): Promise<Decision[]> {
  const params = new URLSearchParams()
  if (filters.accountId) params.set('account', filters.accountId)
  if (filters.runId) params.set('run', filters.runId)
  if (filters.status) params.set('status', filters.status)
  if (filters.since) params.set('since', String(filters.since))
  if (filters.limit) params.set('limit', String(filters.limit))
  const q = params.toString()
  const data = await jget<{ decisions: Decision[] }>(`/decisions${q ? `?${q}` : ''}`)
  return data.decisions
}

// ---------- Budget ----------

export async function fetchBudget(): Promise<Budget> {
  return jget<Budget>('/budget')
}

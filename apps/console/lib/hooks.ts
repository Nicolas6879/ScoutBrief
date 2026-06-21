'use client'

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import {
  createAccount as apiCreateAccount,
  deleteAccount as apiDeleteAccount,
  fetchAccounts,
  fetchBudget,
  fetchDecisions,
  fetchRunDetail,
  fetchRuns,
  type DecisionFilters,
} from './api'
import type { Account, Budget, Decision, Run } from './types'

// ---------- useWatchlist ----------

export interface UseWatchlist {
  accounts: Account[]
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
  add: (name: string) => Promise<Account | null>
  remove: (id: string) => Promise<void>
}

export function useWatchlist(): UseWatchlist {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async (): Promise<void> => {
    try {
      const list = await fetchAccounts()
      setAccounts(list)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const add = useCallback(
    async (name: string): Promise<Account | null> => {
      try {
        const account = await apiCreateAccount(name)
        await refresh()
        return account
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
        return null
      }
    },
    [refresh],
  )

  const remove = useCallback(
    async (id: string): Promise<void> => {
      try {
        await apiDeleteAccount(id)
        await refresh()
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
      }
    },
    [refresh],
  )

  return { accounts, loading, error, refresh, add, remove }
}

// ---------- useBudget ----------

export function useBudget(pollMs = 8000): {
  budget: Budget | null
  refresh: () => Promise<void>
} {
  const [budget, setBudget] = useState<Budget | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const refresh = useCallback(async (): Promise<void> => {
    try {
      const b = await fetchBudget()
      setBudget(b)
    } catch {
      // soft-fail; gauge stays on last good value
    }
  }, [])

  useEffect(() => {
    void refresh()
    timerRef.current = setInterval(() => {
      void refresh()
    }, pollMs)
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [refresh, pollMs])

  return { budget, refresh }
}

// ---------- useRunHistory ----------

export function useRunHistory(limit = 50): {
  runs: Run[]
  loading: boolean
  refresh: () => Promise<void>
} {
  const [runs, setRuns] = useState<Run[]>([])
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async (): Promise<void> => {
    try {
      const list = await fetchRuns(limit)
      setRuns(list)
    } finally {
      setLoading(false)
    }
  }, [limit])

  useEffect(() => {
    void refresh()
  }, [refresh])

  return { runs, loading, refresh }
}

// ---------- useRunDetail ----------

export function useRunDetail(id: string | null): {
  run: Run | null
  decisions: Decision[]
  loading: boolean
} {
  const [run, setRun] = useState<Run | null>(null)
  const [decisions, setDecisions] = useState<Decision[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!id) {
      setRun(null)
      setDecisions([])
      return
    }
    setLoading(true)
    fetchRunDetail(id)
      .then(({ run, decisions }) => {
        setRun(run)
        setDecisions(decisions)
      })
      .finally(() => setLoading(false))
  }, [id])

  return { run, decisions, loading }
}

// ---------- useAuditFeed ----------

export function useAuditFeed(filters: DecisionFilters): {
  decisions: Decision[]
  loading: boolean
  refresh: () => Promise<void>
} {
  const [decisions, setDecisions] = useState<Decision[]>([])
  const [loading, setLoading] = useState(true)
  // serialize the filters to detect change without identity churn
  const key = JSON.stringify(filters)

  const refresh = useCallback(async (): Promise<void> => {
    setLoading(true)
    try {
      const list = await fetchDecisions(filters)
      setDecisions(list)
    } finally {
      setLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  useEffect(() => {
    void refresh()
  }, [refresh])

  return { decisions, loading, refresh }
}

// ---------- useTechnicalView (Context-based shared toggle) ----------

const TECH_KEY = 'scoutbrief.technicalView'

interface TechnicalViewCtx {
  technical: boolean
  setTechnical: (v: boolean) => void
}

const TechnicalViewContext = createContext<TechnicalViewCtx>({
  technical: false,
  setTechnical: () => undefined,
})

export function useTechnicalView(): TechnicalViewCtx {
  return useContext(TechnicalViewContext)
}

export { TechnicalViewContext, TECH_KEY }

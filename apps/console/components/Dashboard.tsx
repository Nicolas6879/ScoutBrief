'use client'

import { AnimatePresence } from 'framer-motion'
import { useCallback, useState } from 'react'
import confetti from 'canvas-confetti'
import { toast } from 'sonner'
import { useBudget, useWatchlist } from '@/lib/hooks'
import { TechnicalViewProvider } from '@/lib/TechnicalViewProvider'
import { useScoutRun } from '@/lib/scoutRun'
import { Sidebar } from './Sidebar'
import { TopBar, type TabKey } from './TopBar'
import { LiveTab } from './tabs/LiveTab'
import { HistoryTab } from './tabs/HistoryTab'
import { AuditTab } from './tabs/AuditTab'

function DashboardInner(): React.ReactElement {
  const [tab, setTab] = useState<TabKey>('live')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const { accounts, add, remove, refresh: refreshAccounts } = useWatchlist()
  const { refresh: refreshBudget } = useBudget()

  const scout = useScoutRun({
    onComplete: () => {
      void refreshAccounts()
      void refreshBudget()
    },
    onCelebrate: () => {
      try {
        void confetti({
          particleCount: 60,
          spread: 60,
          origin: { y: 0.25 },
          colors: ['#7c5cff', '#22d3ee', '#ec4899', '#22c55e'],
          disableForReducedMotion: true,
        })
      } catch {
        // ignore
      }
    },
  })

  const toggleSelected = useCallback((id: string): void => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const onAdd = useCallback(
    async (name: string) => {
      const result = await add(name)
      if (result) toast.success(`Tracking ${result.name}`)
      else toast.error('Could not add account')
      return result
    },
    [add],
  )

  const onRemove = useCallback(
    async (id: string) => {
      const a = accounts.find((x) => x.id === id)
      await remove(id)
      setSelectedIds((prev) => {
        const next = new Set(prev)
        next.delete(id)
        return next
      })
      if (a) toast(`Removed ${a.name}`)
    },
    [remove, accounts],
  )

  const onRun = useCallback(async () => {
    if (selectedIds.size === 0) return
    setTab('live')
    const ids = Array.from(selectedIds)
    await scout.run(ids)
  }, [selectedIds, scout])

  return (
    <div className="min-h-screen">
      <TopBar activeTab={tab} onTabChange={setTab} />

      <main className="mx-auto grid max-w-[1400px] grid-cols-1 gap-6 px-6 py-6 lg:grid-cols-[320px_1fr]">
        <Sidebar
          accounts={accounts}
          selectedIds={selectedIds}
          onToggleSelected={toggleSelected}
          onAdd={onAdd}
          onRemove={onRemove}
          onRun={onRun}
          running={scout.state.active}
        />

        <section className="min-h-[60vh]">
          <AnimatePresence mode="wait">
            {tab === 'live' && (
              <LiveTab
                key="live"
                batch={scout.state}
                onSelectAccount={scout.selectCurrent}
              />
            )}
            {tab === 'history' && <HistoryTab key="history" />}
            {tab === 'audit' && <AuditTab key="audit" />}
          </AnimatePresence>
        </section>
      </main>
    </div>
  )
}

export function Dashboard(): React.ReactElement {
  return (
    <TechnicalViewProvider>
      <DashboardInner />
    </TechnicalViewProvider>
  )
}

'use client'

import { AnimatePresence, motion } from 'framer-motion'
import { CheckCircle2, Circle, Loader2, ShieldOff, Terminal } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { useTechnicalView } from '@/lib/hooks'
import type { DecisionEntry } from '@/lib/scoutRun'

interface Props {
  decisions: DecisionEntry[]
}

function tone(e: DecisionEntry): string {
  if (e.tone === 'ok') return 'text-emerald-200/85'
  if (e.tone === 'blocked') return 'text-rose-200/90'
  if (e.tone === 'active') return 'text-violet-200/85'
  return 'text-white/65'
}

function icon(e: DecisionEntry): React.ReactElement {
  if (e.tone === 'ok') return <CheckCircle2 size={11} className="text-emerald-300" />
  if (e.tone === 'blocked') return <ShieldOff size={11} className="text-rose-300" />
  if (e.tone === 'active') return <Loader2 size={11} className="text-violet-300 animate-spin" />
  return <Circle size={11} className="text-white/40" />
}

function fmtTime(ts: number): string {
  const d = new Date(ts)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`
}

export function DecisionLog({ decisions }: Props): React.ReactElement {
  const { technical } = useTechnicalView()
  const ref = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight
  }, [decisions.length])

  return (
    <div className="glass rounded-2xl p-5">
      <div className="mb-3 flex items-center gap-2">
        <Terminal size={14} className="text-white/55" />
        <h3 className="text-sm font-semibold tracking-tight text-white/85">
          Decision log
        </h3>
        <span className="ml-auto text-[10px] uppercase tracking-[0.18em] text-white/35">
          {decisions.length} {decisions.length === 1 ? 'event' : 'events'}
        </span>
      </div>
      <div
        ref={ref}
        className="max-h-[280px] overflow-y-auto rounded-xl border border-white/[0.05] bg-black/20 p-3 font-mono text-[11.5px] leading-relaxed"
      >
        {decisions.length === 0 ? (
          <p className="text-white/35">No events yet for this run.</p>
        ) : (
          <ul className="space-y-1.5">
            <AnimatePresence initial={false}>
              {decisions.map((e) => (
                <motion.li
                  key={e.id}
                  initial={{ opacity: 0, x: -6 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.18 }}
                  className="flex items-start gap-2"
                >
                  <span className="mt-0.5 text-white/30">{fmtTime(e.ts)}</span>
                  <span className="mt-0.5">{icon(e)}</span>
                  <span className={`flex-1 ${tone(e)}`}>
                    {e.text}
                    {technical && (e.policyName || e.hookName) && (
                      <span className="ml-2 text-[10px] text-white/35">
                        · {e.policyName ?? e.hookName}
                      </span>
                    )}
                  </span>
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        )}
      </div>
    </div>
  )
}

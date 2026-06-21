'use client'

import { useCallback, useEffect, useState } from 'react'
import { TechnicalViewContext, TECH_KEY } from './hooks'

export function TechnicalViewProvider({
  children,
}: {
  children: React.ReactNode
}): React.ReactElement {
  const [technical, setTechnicalState] = useState(false)

  useEffect(() => {
    try {
      if (localStorage.getItem(TECH_KEY) === 'true') setTechnicalState(true)
    } catch {
      // localStorage unavailable
    }
  }, [])

  const setTechnical = useCallback((v: boolean): void => {
    setTechnicalState(v)
    try {
      localStorage.setItem(TECH_KEY, String(v))
    } catch {
      // ignore
    }
  }, [])

  return (
    <TechnicalViewContext.Provider value={{ technical, setTechnical }}>
      {children}
    </TechnicalViewContext.Provider>
  )
}

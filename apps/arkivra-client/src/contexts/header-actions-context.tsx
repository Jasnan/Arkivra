"use client"

import * as React from "react"

interface HeaderActionsContextValue {
  actions: React.ReactNode
  setActions: (actions: React.ReactNode) => void
}

const HeaderActionsContext = React.createContext<HeaderActionsContextValue | null>(null)

export function HeaderActionsProvider({ children }: { children: React.ReactNode }) {
  const [actions, setActions] = React.useState<React.ReactNode>(null)
  const value = React.useMemo(() => ({ actions, setActions }), [actions])

  return (
    <HeaderActionsContext.Provider value={value}>
      {children}
    </HeaderActionsContext.Provider>
  )
}

function useHeaderActionsContext() {
  const context = React.useContext(HeaderActionsContext)

  if (!context) {
    throw new Error("Header actions must be used within HeaderActionsProvider")
  }

  return context
}

export function useHeaderActions(actions: React.ReactNode) {
  const { setActions } = useHeaderActionsContext()

  React.useEffect(() => {
    setActions(actions)

    return () => setActions(null)
  }, [actions, setActions])
}

export function HeaderActionsSlot() {
  const { actions } = useHeaderActionsContext()

  return actions ? <>{actions}</> : null
}

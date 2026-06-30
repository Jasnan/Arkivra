"use client"

import { useCallback, useEffect, useState } from "react"

export type VaultsView = "grid" | "list"

const STORAGE_KEY = "arkivra:vaults-view"
const VIEW_CHANGE_EVENT = "arkivra:vaults-view-change"

function isVaultsView(value: unknown): value is VaultsView {
  return value === "grid" || value === "list"
}

function readInitialView(): VaultsView {
  if (typeof window === "undefined") {
    return "grid"
  }

  const stored = window.localStorage.getItem(STORAGE_KEY)
  return isVaultsView(stored) ? stored : "grid"
}

export function useVaultsView() {
  const [view, setViewState] = useState<VaultsView>(readInitialView)

  useEffect(() => {
    function syncView(event: Event) {
      const nextView =
        event instanceof CustomEvent && isVaultsView(event.detail)
          ? event.detail
          : readInitialView()
      setViewState(nextView)
    }

    window.addEventListener(VIEW_CHANGE_EVENT, syncView)
    window.addEventListener("storage", syncView)

    return () => {
      window.removeEventListener(VIEW_CHANGE_EVENT, syncView)
      window.removeEventListener("storage", syncView)
    }
  }, [])

  const setView = useCallback((nextView: VaultsView) => {
    setViewState(nextView)
    window.localStorage.setItem(STORAGE_KEY, nextView)
    window.dispatchEvent(new CustomEvent(VIEW_CHANGE_EVENT, { detail: nextView }))
  }, [])

  return [view, setView] as const
}

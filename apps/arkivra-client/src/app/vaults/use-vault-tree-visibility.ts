"use client"

import { useCallback, useEffect, useState } from "react"

const STORAGE_KEY = "arkivra:vault-tree-visible"
const VISIBILITY_CHANGE_EVENT = "arkivra:vault-tree-visibility-change"

function isStoredVaultTreeVisibility(value: unknown): value is "true" | "false" {
  return value === "true" || value === "false"
}

function readInitialVaultTreeVisibility() {
  if (typeof window === "undefined") {
    return true
  }

  const stored = window.localStorage.getItem(STORAGE_KEY)
  return isStoredVaultTreeVisibility(stored) ? stored === "true" : true
}

export function useVaultTreeVisibility() {
  const [isVisible, setIsVisibleState] = useState(readInitialVaultTreeVisibility)

  useEffect(() => {
    function syncVisibility(event: Event) {
      const nextVisibility =
        event instanceof CustomEvent && typeof event.detail === "boolean"
          ? event.detail
          : readInitialVaultTreeVisibility()
      setIsVisibleState(nextVisibility)
    }

    window.addEventListener(VISIBILITY_CHANGE_EVENT, syncVisibility)
    window.addEventListener("storage", syncVisibility)

    return () => {
      window.removeEventListener(VISIBILITY_CHANGE_EVENT, syncVisibility)
      window.removeEventListener("storage", syncVisibility)
    }
  }, [])

  const setIsVisible = useCallback((nextVisibility: boolean) => {
    setIsVisibleState(nextVisibility)
    window.localStorage.setItem(STORAGE_KEY, nextVisibility ? "true" : "false")
    window.dispatchEvent(new CustomEvent(VISIBILITY_CHANGE_EVENT, { detail: nextVisibility }))
  }, [])

  return [isVisible, setIsVisible] as const
}

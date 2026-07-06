"use client"

import { useSyncExternalStore } from "react"

type LiveThreadContextSnapshot = {
  threadId: string
  remoteId?: string
  contextSnapshot: unknown
}

let currentSnapshot: LiveThreadContextSnapshot | null = null
const listeners = new Set<() => void>()

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function emitChange() {
  for (const listener of listeners) {
    listener()
  }
}

export function setLiveThreadContextSnapshot(nextSnapshot: LiveThreadContextSnapshot) {
  if (
    currentSnapshot?.threadId === nextSnapshot.threadId &&
    currentSnapshot.remoteId === nextSnapshot.remoteId &&
    currentSnapshot.contextSnapshot === nextSnapshot.contextSnapshot
  ) {
    return
  }

  currentSnapshot = nextSnapshot
  emitChange()
}

export function getLiveThreadContextSnapshot({
  threadId,
  remoteId,
}: {
  threadId: string
  remoteId?: string
}) {
  if (currentSnapshot === null) return undefined
  if (currentSnapshot.threadId === threadId) return currentSnapshot.contextSnapshot
  if (remoteId !== undefined && currentSnapshot.remoteId === remoteId) return currentSnapshot.contextSnapshot

  return undefined
}

export function useLiveThreadContextSnapshot({
  threadId,
  remoteId,
}: {
  threadId: string
  remoteId?: string
}) {
  return useSyncExternalStore(
    subscribe,
    () => {
      if (currentSnapshot === null) return undefined
      if (currentSnapshot.threadId === threadId) return currentSnapshot.contextSnapshot
      if (remoteId !== undefined && currentSnapshot.remoteId === remoteId) return currentSnapshot.contextSnapshot

      return undefined
    },
    () => undefined,
  )
}

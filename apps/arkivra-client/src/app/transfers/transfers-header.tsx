"use client"

import { useEffect, useMemo, useState } from "react"
import { ArrowDownUp } from "lucide-react"
import { useLocation } from "react-router-dom"

import { Button } from "@/components/ui/button"
import { TransfersDrawer } from "./transfers-drawer"
import { useUploadManagerState } from "./use-upload-manager"

export function TransfersHeaderButton() {
  const uploadState = useUploadManagerState()
  const location = useLocation()
  const [isOpen, setIsOpen] = useState(false)
  const transferCount = uploadState.activeCount + uploadState.queuedCount
  const badgeCount = transferCount > 0 ? transferCount : uploadState.failedCount

  useEffect(() => {
    function handleOpenTransfers() {
      setIsOpen(true)
    }

    window.addEventListener("arkivra:transfers-open", handleOpenTransfers)
    return () => window.removeEventListener("arkivra:transfers-open", handleOpenTransfers)
  }, [])

  useEffect(() => {
    const hasUnfinishedUploads = uploadState.items.some((item) => item.status === "queued" || item.status === "uploading" || item.status === "paused")

    if (!hasUnfinishedUploads) {
      return undefined
    }

    function warnBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault()
      event.returnValue = ""
    }

    window.addEventListener("beforeunload", warnBeforeUnload)
    return () => window.removeEventListener("beforeunload", warnBeforeUnload)
  }, [uploadState.items])

  useEffect(() => {
    setIsOpen(false)
  }, [location.key])

  const label = useMemo(() => {
    if (transferCount > 0) {
      return `Transfers, ${transferCount} active`
    }
    if (uploadState.failedCount > 0) {
      return `Transfers, ${uploadState.failedCount} failed`
    }
    return "Transfers"
  }, [transferCount, uploadState.failedCount])

  return (
    <>
      <Button type="button" variant="ghost" size="icon" className="relative" aria-label={label} onClick={() => setIsOpen(true)}>
        <ArrowDownUp className="size-4" />
        {badgeCount > 0 ? (
          <span className="absolute -top-1 -right-1 flex size-4 items-center justify-center rounded-full bg-primary text-[10px] font-medium text-primary-foreground">
            {badgeCount > 9 ? "9+" : badgeCount}
          </span>
        ) : null}
      </Button>
      <TransfersDrawer open={isOpen} onOpenChange={setIsOpen} />
    </>
  )
}

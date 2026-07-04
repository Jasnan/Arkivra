"use client"

import { useCallback, useEffect, useState, type ReactNode } from "react"
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  FileText,
  Loader2,
  Plug,
  RefreshCw,
  Search,
  Shield,
} from "lucide-react"
import { toast } from "sonner"

import { BaseLayout } from "@/components/layouts/base-layout"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Switch } from "@/components/ui/switch"
import { getMe } from "../ai-settings/ai-settings.api"
import {
  getAdminOfficeConverterStatus,
  scheduleMissingOfficePreviews,
  updateAdminOfficeConverterSettings,
  type AdminOfficeConverterStatus,
} from "./office-converter.api"

interface AsyncState<T> {
  data: T | null
  isLoading: boolean
  error: Error | null
}

const emptyMeState: AsyncState<{ isAdmin: boolean }> = {
  data: null,
  isLoading: true,
  error: null,
}

const emptyStatusState: AsyncState<{ officeConverter: AdminOfficeConverterStatus }> = {
  data: null,
  isLoading: false,
  error: null,
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback
}

function formatOfficeConverterDate(value: string | null) {
  if (value === null) return "Not checked"

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "Not checked"

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date)
}

function formatConverterProvider(provider: string | null) {
  if (provider === null) return "Not configured"
  if (provider === "gotenberg") return "Gotenberg"
  return provider
}

function getOfficeConverterHealth(status: AdminOfficeConverterStatus) {
  switch (status.effectiveState) {
    case "not_configured":
      return {
        label: "Not configured",
        badgeClassName: "border-muted-foreground/30 bg-muted text-muted-foreground",
        description: "Configure a converter service before Office previews can be generated.",
      }
    case "active":
      return {
        label: "Active",
        badgeClassName: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
        description: "The converter service is connected and conversion is enabled.",
      }
    case "paused":
      return {
        label: "Paused",
        badgeClassName: "border-muted-foreground/30 bg-muted text-muted-foreground",
        description: "The converter service is connected. Conversion is disabled by an administrator.",
      }
    case "unavailable":
      return {
        label: "Unavailable",
        badgeClassName: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
        description: "The converter service is configured but cannot be reached.",
      }
  }
}

function DetailRow({ icon, title, description }: { icon: ReactNode; title: string; description: string }) {
  return (
    <div className="flex items-start gap-3 py-3">
      <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-background text-primary">
        {icon}
      </div>
      <div className="min-w-0">
        <div className="text-sm font-medium">{title}</div>
        <div className="text-sm text-muted-foreground">{description}</div>
      </div>
    </div>
  )
}

function LoadingCard({ title, description }: { title: string; description: string }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-start gap-3">
        <Loader2 className="mt-0.5 size-4 animate-spin text-muted-foreground" />
        <div>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </div>
      </CardHeader>
    </Card>
  )
}

function AdminNoticeCard({ title, description }: { title: string; description: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
    </Card>
  )
}

function ErrorBanner({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
      <AlertTriangle className="mt-0.5 size-4 shrink-0" />
      <div>{children}</div>
    </div>
  )
}

function UnsupportedConverterCard() {
  return (
    <Card>
      <CardHeader className="flex flex-row items-start gap-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
          <FileText className="size-4" />
        </div>
        <div>
          <CardTitle>Office conversion unavailable</CardTitle>
          <CardDescription>
            This Arkivra build does not include Office document conversion support.
          </CardDescription>
        </div>
      </CardHeader>
    </Card>
  )
}

function OfficeConverterToggle({
  isSaving,
  status,
  onToggleEnabled,
}: {
  status: AdminOfficeConverterStatus
  isSaving: boolean
  onToggleEnabled: (enabled: boolean) => void
}) {
  const canEditPreference = status.effectiveState === "active" || status.effectiveState === "paused"

  return (
    <div className="flex shrink-0 items-center gap-3">
      <Switch
        id="office-converter-enabled"
        checked={status.enabled}
        disabled={isSaving || !canEditPreference}
        aria-label="Enable Office document conversion"
        className="h-6 w-11 [&_[data-slot=switch-thumb]]:size-5"
        onCheckedChange={onToggleEnabled}
      />
      <label
        htmlFor="office-converter-enabled"
        className={status.enabled ? "text-sm font-medium text-primary" : "text-sm font-medium text-muted-foreground"}
      >
        {status.enabled ? "Enabled" : "Disabled"}
      </label>
    </div>
  )
}

function OfficeConverterSection({
  isScheduling,
  status,
  onGenerateMissingPreviews,
}: {
  status: AdminOfficeConverterStatus
  isScheduling: boolean
  onGenerateMissingPreviews: () => void
}) {
  const health = getOfficeConverterHealth(status)
  const providerLabel = formatConverterProvider(status.provider)
  const supportedFormats = status.supportedFormats.length > 0 ? status.supportedFormats : []

  return (
    <div className="rounded-xl border bg-card p-6 shadow-sm">
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
          <div className="flex size-12 shrink-0 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 text-primary">
            <Plug className="size-6" />
          </div>
          <div className="min-w-0 flex-1 space-y-6">
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="text-base font-semibold">Connection</h2>
              <Badge variant="outline" className={health.badgeClassName}>
                {health.label === "Active" ? <CheckCircle2 className="size-3.5" /> : null}
                {health.label}
              </Badge>
            </div>

            {status.error ? (
              <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-300">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                <div>{status.error}</div>
              </div>
            ) : null}

            <div className="grid gap-6 md:grid-cols-[minmax(10rem,0.7fr)_minmax(13rem,0.8fr)_minmax(0,1.5fr)] md:divide-x">
              <div className="space-y-1 md:pr-6">
                <div className="text-sm font-medium text-muted-foreground">Service</div>
                <div className="text-base font-medium">{providerLabel}</div>
                <div className="text-sm text-muted-foreground">Converter service</div>
              </div>
              <div className="space-y-2 md:px-6">
                <div className="flex items-center gap-3 text-sm font-medium text-muted-foreground">
                  <Clock className="size-5" />
                  Last checked
                </div>
                <div className="text-base font-medium">{formatOfficeConverterDate(status.lastHealthCheck)}</div>
              </div>
              <div className="space-y-3 md:pl-6">
                <div className="text-sm font-medium text-muted-foreground">Supports</div>
                {supportedFormats.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {supportedFormats.map((format) => (
                      <Badge key={format} variant="outline" className="bg-background">
                        {format}
                      </Badge>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No formats reported by the converter.</p>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="border-t" />

        <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
          <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <RefreshCw className="size-6" />
          </div>
          <div className="min-w-0 space-y-5">
            <div className="space-y-2">
              <h2 className="text-base font-semibold">Older files</h2>
              <p className="max-w-md text-sm text-muted-foreground">
                Generate previews for supported files uploaded before the converter was enabled.
              </p>
            </div>

            <Button
              type="button"
              disabled={!status.canScheduleConversion || isScheduling}
              onClick={onGenerateMissingPreviews}
            >
              {isScheduling ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
              {isScheduling ? "Scheduling..." : "Generate previews"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

function GenerateOfficePreviewsDialog({
  isScheduling,
  open,
  onConfirm,
  onOpenChange,
}: {
  open: boolean
  isScheduling: boolean
  onConfirm: () => void
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Generate missing previews?</DialogTitle>
          <DialogDescription>
            Arkivra will queue PDF previews for eligible Office and OpenDocument versions that do not have one.
          </DialogDescription>
        </DialogHeader>
        <div className="divide-y rounded-lg border bg-muted/20 px-3">
          <DetailRow
            icon={<FileText className="size-4" />}
            title="Background job"
            description="PDF previews are generated in the background for eligible versions."
          />
          <DetailRow
            icon={<Shield className="size-4" />}
            title="Originals stay unchanged"
            description="Versions that already have previews are skipped."
          />
          <DetailRow
            icon={<Search className="size-4" />}
            title="Index updates"
            description="Search indexes are rebuilt when AI indexing is enabled."
          />
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" disabled={isScheduling} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" disabled={isScheduling} onClick={onConfirm}>
            {isScheduling ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
            {isScheduling ? "Scheduling..." : "Generate"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default function AdminOfficeConverterPage() {
  const [meState, setMeState] = useState<AsyncState<{ isAdmin: boolean }>>(emptyMeState)
  const [statusState, setStatusState] =
    useState<AsyncState<{ officeConverter: AdminOfficeConverterStatus }>>(emptyStatusState)
  const [savePending, setSavePending] = useState(false)
  const [schedulePending, setSchedulePending] = useState(false)
  const [generateDialogOpen, setGenerateDialogOpen] = useState(false)

  const isAdmin = meState.data?.isAdmin === true
  const officeConverter = statusState.data?.officeConverter ?? null

  const loadMe = useCallback(async () => {
    setMeState({ data: null, isLoading: true, error: null })

    try {
      const me = await getMe()
      setMeState({ data: { isAdmin: me.isAdmin }, isLoading: false, error: null })
    } catch (error) {
      setMeState({
        data: null,
        isLoading: false,
        error: error instanceof Error ? error : new Error("Unable to load account."),
      })
    }
  }, [])

  const loadStatus = useCallback(async ({ keepData = false }: { keepData?: boolean } = {}) => {
    setStatusState((current) => ({
      data: keepData ? current.data : null,
      isLoading: true,
      error: null,
    }))

    try {
      const result = await getAdminOfficeConverterStatus()
      setStatusState({ data: result, isLoading: false, error: null })
    } catch (error) {
      setStatusState((current) => ({
        data: keepData ? current.data : null,
        isLoading: false,
        error: error instanceof Error ? error : new Error("Unable to load converter status."),
      }))
    }
  }, [])

  useEffect(() => {
    void loadMe()
  }, [loadMe])

  useEffect(() => {
    if (isAdmin) {
      void loadStatus()
    }
  }, [isAdmin, loadStatus])

  async function handleToggleEnabled(enabled: boolean) {
    if (savePending) return

    setSavePending(true)
    try {
      const result = await updateAdminOfficeConverterSettings({ enabled })
      toast.success(result.settings.enabled ? "Office conversion enabled." : "Office conversion disabled.")
      await loadStatus({ keepData: true })
    } catch (error) {
      toast.error(getErrorMessage(error, "Could not update Office conversion settings."))
    } finally {
      setSavePending(false)
    }
  }

  async function handleGenerateMissingPreviews() {
    if (schedulePending) return

    setSchedulePending(true)
    try {
      await scheduleMissingOfficePreviews()
      setGenerateDialogOpen(false)
      toast.success("Preview generation scheduled.")
      await loadStatus({ keepData: true })
    } catch (error) {
      toast.error(getErrorMessage(error, "Could not schedule preview generation."))
    } finally {
      setSchedulePending(false)
    }
  }

  if (meState.isLoading) {
    return (
      <BaseLayout
        title="Office Converter"
        description="Automatically generate PDF previews for supported Office documents. Existing previews remain available if you disable the converter."
      >
        <div className="px-4 lg:px-6">
          <LoadingCard title="Checking access" description="Loading your administrator permissions." />
        </div>
      </BaseLayout>
    )
  }

  if (meState.error) {
    return (
      <BaseLayout
        title="Office Converter"
        description="Automatically generate PDF previews for supported Office documents. Existing previews remain available if you disable the converter."
      >
        <div className="px-4 lg:px-6">
          <ErrorBanner>{meState.error.message}</ErrorBanner>
        </div>
      </BaseLayout>
    )
  }

  if (!isAdmin) {
    return (
      <BaseLayout
        title="Office Converter"
        description="Automatically generate PDF previews for supported Office documents. Existing previews remain available if you disable the converter."
      >
        <div className="px-4 lg:px-6">
          <AdminNoticeCard
            title="Platform administrator required"
            description="Only platform administrators can manage Office conversion."
          />
        </div>
      </BaseLayout>
    )
  }

  return (
    <BaseLayout>
      <div className="space-y-6 px-4 lg:px-6">
        <header className="border-b pb-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0 space-y-1.5">
              <h1 className="text-3xl font-bold tracking-tight">Office Converter</h1>
              <p className="max-w-2xl text-sm text-muted-foreground">
                Automatically generate PDF previews for supported Office documents. Existing previews remain available if you disable the converter.
              </p>
            </div>
            {officeConverter?.supported ? (
              <OfficeConverterToggle
                status={officeConverter}
                isSaving={savePending}
                onToggleEnabled={(enabled) => void handleToggleEnabled(enabled)}
              />
            ) : null}
          </div>
        </header>

        {statusState.error && officeConverter ? (
          <ErrorBanner>Could not refresh converter status: {statusState.error.message}</ErrorBanner>
        ) : null}

        {statusState.isLoading && !officeConverter ? (
          <LoadingCard title="Loading converter status" description="Checking the configured conversion service." />
        ) : statusState.error && !officeConverter ? (
          <ErrorBanner>{statusState.error.message}</ErrorBanner>
        ) : officeConverter?.supported ? (
          <OfficeConverterSection
            status={officeConverter}
            isScheduling={schedulePending}
            onGenerateMissingPreviews={() => setGenerateDialogOpen(true)}
          />
        ) : officeConverter ? (
          <UnsupportedConverterCard />
        ) : null}
      </div>

      <GenerateOfficePreviewsDialog
        open={generateDialogOpen}
        isScheduling={schedulePending}
        onConfirm={() => void handleGenerateMissingPreviews()}
        onOpenChange={setGenerateDialogOpen}
      />
    </BaseLayout>
  )
}

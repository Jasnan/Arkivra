"use client"

import { useCallback, useEffect, useState, type ReactNode } from "react"
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  FileText,
  Globe2,
  Info,
  Loader2,
  RefreshCw,
  Search,
  Shield,
} from "lucide-react"
import { toast } from "sonner"

import { BaseLayout } from "@/components/layouts/base-layout"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
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

function getOfficeConverterRuntimeDescription(status: AdminOfficeConverterStatus) {
  switch (status.effectiveState) {
    case "not_configured":
      return "Set the converter environment variables, then restart the service."
    case "active":
      return "New supported uploads receive PDF previews."
    case "paused":
      return "New supported uploads skip PDF preview generation until conversion is enabled."
    case "unavailable":
      return "New supported uploads skip preview generation until the service is reachable."
  }
}

function StatusMetric({
  icon,
  label,
  value,
}: {
  icon: ReactNode
  label: string
  value: ReactNode
}) {
  return (
    <div className="flex min-w-0 items-center gap-3 rounded-lg border bg-muted/20 p-3">
      <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-background text-muted-foreground">
        {icon}
      </div>
      <div className="min-w-0">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="break-words text-sm font-medium">{value}</div>
      </div>
    </div>
  )
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

function OfficeConverterSection({
  isSaving,
  isScheduling,
  status,
  onGenerateMissingPreviews,
  onToggleEnabled,
}: {
  status: AdminOfficeConverterStatus
  isSaving: boolean
  isScheduling: boolean
  onToggleEnabled: (enabled: boolean) => void
  onGenerateMissingPreviews: () => void
}) {
  const health = getOfficeConverterHealth(status)
  const providerLabel = formatConverterProvider(status.provider)
  const canEditPreference = status.effectiveState === "active" || status.effectiveState === "paused"
  const supportedFormats = status.supportedFormats.length > 0 ? status.supportedFormats : []

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-end">
          <div className="flex shrink-0 items-center gap-3">
            <Switch
              id="office-converter-enabled"
              checked={status.enabled}
              disabled={isSaving || !canEditPreference}
              aria-label="Enable Office document conversion"
              onCheckedChange={onToggleEnabled}
            />
            <label
              htmlFor="office-converter-enabled"
              className={status.enabled ? "text-sm font-medium text-emerald-700 dark:text-emerald-300" : "text-sm font-medium text-muted-foreground"}
            >
              {status.enabled ? "Enabled" : "Disabled"}
            </label>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(20rem,0.9fr)]">
            <div className="space-y-4 rounded-lg border bg-muted/20 p-4">
              <div className="flex flex-wrap items-center gap-3">
                <h2 className="text-base font-semibold">Connection</h2>
                <Badge variant="outline" className={health.badgeClassName}>
                  {health.label === "Active" ? <CheckCircle2 className="size-3" /> : null}
                  {health.label}
                </Badge>
              </div>
              <div className="space-y-1 text-sm text-muted-foreground">
                <p>{health.description}</p>
                <p>{getOfficeConverterRuntimeDescription(status)}</p>
              </div>

              {status.error ? (
                <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-300">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                  <div>{status.error}</div>
                </div>
              ) : null}

              <div className="grid gap-3 sm:grid-cols-2">
                <StatusMetric icon={<Globe2 className="size-4" />} label="Service" value={providerLabel} />
                <StatusMetric
                  icon={<Clock className="size-4" />}
                  label="Last checked"
                  value={formatOfficeConverterDate(status.lastHealthCheck)}
                />
              </div>

              <div className="space-y-2 border-t pt-4">
                <div className="text-sm font-medium">Supported formats</div>
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

            <div className="space-y-4 rounded-lg border bg-muted/20 p-4">
              <div className="flex items-center gap-3">
                <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-background text-primary">
                  <RefreshCw className="size-4" />
                </div>
                <div>
                  <h2 className="text-base font-semibold">Existing documents</h2>
                  <p className="text-sm text-muted-foreground">
                    Queue PDF previews for eligible files uploaded before conversion was available.
                  </p>
                </div>
              </div>

              <Button
                type="button"
                disabled={!status.canScheduleConversion || isScheduling}
                onClick={onGenerateMissingPreviews}
              >
                {isScheduling ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
                {isScheduling ? "Scheduling..." : "Generate missing previews"}
              </Button>
            </div>
          </div>

          <div className="flex items-start gap-3 rounded-lg border bg-muted/20 p-3 text-sm text-muted-foreground">
            <Info className="mt-0.5 size-4 shrink-0 text-primary" />
            <p>Turning conversion off stops new preview generation. Existing previews remain available.</p>
          </div>
        </CardContent>
      </Card>
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
        description="Convert Office and OpenDocument uploads into PDFs for previews and citations."
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
        description="Convert Office and OpenDocument uploads into PDFs for previews and citations."
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
        description="Convert Office and OpenDocument uploads into PDFs for previews and citations."
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
    <BaseLayout title="Office Converter" description="Convert Office and OpenDocument uploads into PDFs for previews and citations.">
      <div className="space-y-6 px-4 lg:px-6">
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
            isSaving={savePending}
            isScheduling={schedulePending}
            onToggleEnabled={(enabled) => void handleToggleEnabled(enabled)}
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

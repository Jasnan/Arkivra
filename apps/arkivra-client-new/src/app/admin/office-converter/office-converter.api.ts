import { fetchJson } from "@/lib/api"

export interface AdminOfficeConverterStatus {
  supported: boolean
  enabled: boolean
  settingSource: "stored" | "environment_default"
  configured: boolean
  healthy: boolean
  effectiveState: "not_configured" | "active" | "paused" | "unavailable"
  canScheduleConversion: boolean
  provider: string | null
  url: string | null
  lastHealthCheck: string | null
  error: string | null
  supportedFormats: string[]
}

export async function getAdminOfficeConverterStatus() {
  return fetchJson<{ officeConverter: AdminOfficeConverterStatus }>(
    "/api/admin/maintenance/office-converter/status"
  )
}

export async function updateAdminOfficeConverterSettings({ enabled }: { enabled: boolean }) {
  return fetchJson<{ settings: { enabled: boolean; settingSource: "stored" } }>(
    "/api/admin/maintenance/office-converter/settings",
    {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ enabled }),
    }
  )
}

export async function scheduleMissingOfficePreviews() {
  return fetchJson<{ job: { type: "generate-office-preview-pdfs"; status: "queued" } }>(
    "/api/admin/maintenance/office-preview-pdfs",
    {
      method: "POST",
    }
  )
}

import { fetchJson } from "@/lib/api"

export type AdminAiProviderKind = "ollama" | "gemini" | "privatemode"
export type AdminAiModelCapability = "chat" | "vision" | "embedding"

export interface MeResponse {
  id?: string
  email?: string
  name?: string | null
  systemRole?: "admin" | "member" | null
  isAdmin: boolean
  canCreateVault?: boolean
  canUseAI?: boolean
  aiFeaturesEnabled: boolean
}

export interface AdminAiProviderModelOption {
  provider: AdminAiProviderKind
  model: string
  label?: string
  capabilities: AdminAiModelCapability[]
  embeddingDimensions?: number
}

export interface AdminAiProviderSettings {
  provider: AdminAiProviderKind
  baseUrl: string
  apiKeySecretRef: string | null
  model: string
}

export interface AdminAiChatProviderSettings extends AdminAiProviderSettings {
  allowedModels?: string[]
}

export interface AdminAiEmbeddingProviderSettings {
  provider: AdminAiProviderKind | null
  baseUrl: string
  apiKeySecretRef: string | null
  model: string | null
  dimensions: number | null
}

export interface AdminAiSettings {
  aiFeaturesEnabled: boolean
  chat: AdminAiChatProviderSettings
  translation: AdminAiProviderSettings
  embedding: AdminAiEmbeddingProviderSettings
  providers?: {
    privatemode?: { baseUrl: string; apiKeySecretRef: string | null; configured?: boolean }
    gemini?: {
      baseUrl: string
      apiKeySecretRef: string | null
      configured?: boolean
    }
  }
  ollamaHost: string
  model: string
}

export type AdminAiSettingsUpdatePayload = Omit<
  AdminAiSettings,
  "translation" | "ollamaHost" | "model" | "providers"
> & {
  translation?: AdminAiProviderSettings
  providers?: {
    privatemode?: { baseUrl: string; apiKeySecretRef: string | null; configured?: boolean }
    gemini?: {
      baseUrl: string
      apiKeySecretRef: string | null
    }
  }
  ollamaHost?: string
  model?: string
}

export interface AdminAiModel {
  name: string
  size: number | null
  modifiedAt: string | null
  capabilities: string[]
  description?: string | null
  displayName?: string | null
  supportedGenerationMethods?: string[]
  inputTokenLimit?: number | null
  outputTokenLimit?: number | null
  version?: string | null
  contextWindow?: number | null
  maxOutputTokens?: number | null
  providerMetadata?: Record<string, unknown>
  source?: "live"
  available?: boolean
  availabilityReason?: string | null
  embeddingDimensions?: number
}

export interface AdminAiAvailability {
  host: string
  model: string
  reachable: boolean
  modelAvailable: boolean
  models: AdminAiModel[]
  responseTimeMs: number | null
  error: string | null
}

export interface AdminEmbeddingIndexSummary {
  id: string
  providerConfigId: string
  provider: AdminAiProviderKind | "openrouter" | "voyage" | "custom"
  model: string
  dimensions: number
  distanceMetric: string
  status: "building" | "ready" | "active" | "failed" | "retiring" | "retired"
  isActive: boolean
  expectedChunkCount: number
  embeddedChunkCount: number
  failedChunkCount: number
  failureMessage: string | null
  buildStartedAt: string | null
  buildCompletedAt: string | null
  activatedAt: string | null
  createdAt: string
  updatedAt: string
  documentStatuses: {
    pending: number
    indexing: number
    ready: number
    failed: number
    stale: number
    skipped: number
  }
}

export interface AdminAiStatus {
  aiFeaturesEnabled: boolean
  chat: {
    provider: "ollama" | "openrouter" | "gemini" | "custom"
    baseUrl: string | null
    model: string
    allowedModels: string[]
  }
  embedding: {
    activeIndex: AdminEmbeddingIndexSummary | null
    candidateIndexes: AdminEmbeddingIndexSummary[]
    recentIndexes: AdminEmbeddingIndexSummary[]
    chunkCoverage: {
      indexedChunkCount: number
      totalChunkCount: number
    }
    semanticSearchAvailable: boolean
  }
}

export async function getMe() {
  return fetchJson<MeResponse>("/api/me")
}

export async function getAdminAiSettings() {
  return fetchJson<{ settings: AdminAiSettings }>("/api/admin/ai/settings")
}

export async function getAdminAiStatus() {
  return fetchJson<{ status: AdminAiStatus }>("/api/admin/ai/status")
}

export async function listAdminAiProviderModels({
  host,
  provider,
  includeEmbeddingModels,
  apiKeySecretRef,
}: {
  host: string
  provider?: AdminAiProviderKind
  includeEmbeddingModels?: boolean
  apiKeySecretRef?: string | null
}) {
  return fetchJson<{ models: AdminAiModel[] }>("/api/admin/ai/models", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ host, provider, includeEmbeddingModels, apiKeySecretRef }),
  })
}

export async function updateAdminAiSettings(settings: AdminAiSettingsUpdatePayload) {
  return fetchJson<{ settings: AdminAiSettings }>("/api/admin/ai/settings", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(settings),
  })
}

export async function checkAiModelAvailability({
  host,
  model,
  provider,
  apiKeySecretRef,
}: {
  host: string
  model: string
  provider?: AdminAiProviderKind
  apiKeySecretRef?: string | null
}) {
  return fetchJson<{ availability: AdminAiAvailability }>("/api/admin/ai/availability", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ host, model, provider, apiKeySecretRef }),
  })
}

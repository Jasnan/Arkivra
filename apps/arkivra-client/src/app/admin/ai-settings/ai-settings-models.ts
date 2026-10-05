import type {
  AdminAiModelCapability,
  AdminAiProviderKind,
  AdminAiProviderModelOption,
  AdminAiSettings,
  AdminEmbeddingIndexSummary,
} from "./ai-settings.api"
import { formatDate } from "@/lib/date-format"

export interface EmbeddingModelOption {
  key: string
  provider: NonNullable<AdminAiSettings["embedding"]["provider"]>
  providerLabel: string
  baseUrl: string
  model: string
  dimensions: number | null
  isActive: boolean
  isConfigured: boolean
  isDiscovered: boolean
  capabilities: string[]
}

export const geminiBaseUrl = "https://generativelanguage.googleapis.com/v1beta/openai"

const ollamaLatestTagPattern = /:latest$/

export function formatProvider(provider: string | null) {
  if (provider === null) return "Not selected"
  if (provider === "ollama") return "Ollama"
  if (provider === "gemini") return "Google Gemini"
  if (provider === "privatemode") return "Privatemode"
  return provider
}

export function hasModelCapability(model: { capabilities?: string[] }, capability: string) {
  return model.capabilities?.some((item) => item.toLowerCase() === capability) ?? false
}

export function mapProviderCapabilities(capabilities: readonly string[]) {
  const mapped = new Set<AdminAiModelCapability>()

  for (const capability of capabilities) {
    const normalized = capability.trim().toLowerCase()
    if (normalized === "completion") {
      mapped.add("chat")
      continue
    }

    if (normalized === "chat" || normalized === "vision" || normalized === "embedding") {
      mapped.add(normalized)
    }
  }

  return Array.from(mapped)
}

function stripLatestTag(model: string) {
  return model.trim().toLowerCase().replace(ollamaLatestTagPattern, "")
}

export function isSameProviderModel({
  provider,
  left,
  right,
}: {
  provider: string | null
  left: string
  right: string
}) {
  return provider === "ollama" ? stripLatestTag(left) === stripLatestTag(right) : left === right
}

function findProviderModel(
  providerModels: AdminAiProviderModelOption[],
  provider: AdminAiProviderKind,
  model: string,
) {
  return providerModels.find(
    (item) =>
      item.provider === provider &&
      isSameProviderModel({ provider, left: item.model, right: model }),
  )
}

export function buildEmbeddingModelOptions({
  activeIndex,
  baseUrl,
  model,
  provider,
  providerBaseUrls,
  providerModels,
  savedEmbedding,
}: {
  activeIndex: AdminEmbeddingIndexSummary | null
  baseUrl: string
  model: string | null
  provider: AdminAiSettings["embedding"]["provider"]
  providerBaseUrls?: Partial<Record<AdminAiProviderKind, string>>
  providerModels: AdminAiProviderModelOption[]
  savedEmbedding: AdminAiSettings["embedding"]
}) {
  const configuredModel = savedEmbedding.model?.trim() || model?.trim() || ""
  const activeModel = activeIndex?.model.trim() ?? ""
  const optionByKey = new Map<string, EmbeddingModelOption>()

  function addModelOption(
    optionProvider: AdminAiProviderKind,
    optionModel: string,
    providerModel?: AdminAiProviderModelOption,
  ) {
    if (optionModel.length === 0) return

    const optionBaseUrl = providerBaseUrls?.[optionProvider] ?? baseUrl
    const key = `${optionProvider}:${optionBaseUrl}:${optionModel}`
    const dimensions = providerModel?.embeddingDimensions ?? savedEmbedding.dimensions ?? null

    optionByKey.set(key, {
      key,
      provider: optionProvider,
      providerLabel: formatProvider(optionProvider),
      baseUrl: optionBaseUrl,
      model: optionModel,
      dimensions,
      isActive:
        activeIndex?.provider === optionProvider &&
        isSameProviderModel({ provider: optionProvider, left: activeIndex.model, right: optionModel }),
      isConfigured:
        savedEmbedding.provider === optionProvider &&
        savedEmbedding.model !== null &&
        isSameProviderModel({ provider: optionProvider, left: savedEmbedding.model, right: optionModel }),
      isDiscovered: providerModel !== undefined,
      capabilities: providerModel?.capabilities ?? [],
    })
  }

  for (const providerModel of providerModels) {
    if (!hasModelCapability(providerModel, "embedding")) continue

    const optionModel =
      configuredModel.length > 0 &&
      isSameProviderModel({
        provider: providerModel.provider,
        left: providerModel.model,
        right: configuredModel,
      })
        ? configuredModel
        : activeModel.length > 0 &&
            isSameProviderModel({
              provider: providerModel.provider,
              left: providerModel.model,
              right: activeModel,
            })
          ? activeModel
          : providerModel.model

    addModelOption(providerModel.provider, optionModel, providerModel)
  }

  if (provider !== null && configuredModel.length > 0) {
    addModelOption(provider, configuredModel, findProviderModel(providerModels, provider, configuredModel))
  }

  if (provider !== null && activeModel.length > 0) {
    addModelOption(provider, activeModel, findProviderModel(providerModels, provider, activeModel))
  }

  return Array.from(optionByKey.values()).sort(
    (left, right) =>
      left.providerLabel.localeCompare(right.providerLabel) || left.model.localeCompare(right.model),
  )
}

export function formatIndexStatus(status: AdminEmbeddingIndexSummary["status"]) {
  if (status === "active" || status === "ready") return "Ready"
  if (status === "building") return "Building"
  if (status === "failed") return "Error"
  if (status === "retiring" || status === "retired") return "Retired"
  return "Unknown"
}

export function getIndexProgress(index: AdminEmbeddingIndexSummary) {
  if (index.expectedChunkCount <= 0) {
    return index.status === "active" || index.status === "ready" ? 100 : 0
  }

  return Math.min(100, Math.round((index.embeddedChunkCount / index.expectedChunkCount) * 100))
}

export function formatShortDateTime(value: string | null | undefined) {
  return formatDate(value, { dateStyle: "medium", timeStyle: "short" }, value ? value : "Unavailable")
}

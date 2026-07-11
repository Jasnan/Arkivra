"use client"

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import {
  BookOpen,
  Bot,
  CheckCircle2,
  ChevronRight,
  ExternalLink,
  Info,
  Languages,
  Layers3,
  MessageSquare,
  Package,
  Power,
  RefreshCw,
  Search,
  Settings,
  Sparkles,
  TriangleAlert,
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
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Progress } from "@/components/ui/progress"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { cn } from "@/lib/utils"
import {
  getChatModelOptions,
  invalidateChatModelOptionsCache,
} from "@/app/chat/lib/chat-model-options"
import {
  checkAiModelAvailability,
  getAdminAiSettings,
  getAdminAiStatus,
  getMe,
  listAdminAiProviderModels,
  updateAdminAiSettings,
  type AdminAiAvailability,
  type AdminAiModel,
  type AdminAiProviderKind,
  type AdminAiProviderModelOption,
  type AdminAiSettings,
  type AdminAiSettingsUpdatePayload,
  type AdminAiStatus,
  type AdminEmbeddingIndexSummary,
  type MeResponse,
} from "./ai-settings.api"
import {
  buildEmbeddingModelOptions,
  formatIndexStatus,
  formatProvider,
  geminiBaseUrl,
  getIndexProgress,
  hasModelCapability,
  isSameProviderModel,
  mapProviderCapabilities,
  type EmbeddingModelOption,
} from "./ai-settings-models"

type AsyncState<T> = {
  data: T | null
  error: Error | null
  isLoading: boolean
  isFetching: boolean
  updatedAt: number
}

type AiSetupState = "no_providers" | "needs_configuration" | "ready" | "enabled"
type HealthSeverity = "critical" | "warning" | "info"
type ProgressStatus = AdminEmbeddingIndexSummary["status"] | "paused" | "idle"

interface ChatModelOption {
  value: string
  provider: AdminAiSettings["chat"]["provider"]
  providerLabel: string
  model: string
  label: string
  baseUrl: string
  description?: string | null
  capabilities: string[]
}

interface TranslationModelOption {
  key: string
  provider: AdminAiSettings["translation"]["provider"]
  providerLabel: string
  model: string
  label: string
  baseUrl: string
  description?: string | null
  capabilities: string[]
  isConfigured: boolean
}

interface HealthIssue {
  id: string
  severity: HealthSeverity
  title: string
  description: string
}

interface ProviderSummary {
  id: AdminAiProviderKind
  name: string
  description: string
  endpoint: string
  status: string
  tone: "enabled" | "inactive" | "warning"
  isConfigured: boolean
  isHealthy: boolean
  modelCount: number
  models: string[]
  updatedAt: number
  error: string | null
  isChecking: boolean
  onRefresh: () => void
}

type AiSettingsDraftOverride = Partial<Omit<AdminAiSettings, "chat" | "translation" | "embedding">> & {
  chat?: Partial<AdminAiSettings["chat"]>
  translation?: Partial<AdminAiSettings["translation"]>
  embedding?: Partial<AdminAiSettings["embedding"]>
}

const emptyAiSettings: AdminAiSettings = {
  aiFeaturesEnabled: false,
  chat: {
    provider: "ollama",
    baseUrl: "",
    apiKeySecretRef: null,
    model: "",
    allowedModels: [],
  },
  translation: {
    provider: "ollama",
    baseUrl: "",
    apiKeySecretRef: null,
    model: "",
  },
  embedding: {
    provider: null,
    baseUrl: "",
    apiKeySecretRef: null,
    model: null,
    dimensions: null,
  },
  providers: {
    gemini: {
      baseUrl: geminiBaseUrl,
      apiKeySecretRef: null,
      configured: false,
    },
  },
  ollamaHost: "",
  model: "",
}

const emptyAsyncState = <T,>(): AsyncState<T> => ({
  data: null,
  error: null,
  isLoading: true,
  isFetching: false,
  updatedAt: 0,
})

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback
}

function formatChatModelValue({
  provider,
  model,
}: {
  provider: AdminAiSettings["chat"]["provider"]
  model: string
}) {
  return `${provider}:${model}`
}

function parseChatModelValue({
  value,
  fallbackProvider,
}: {
  value: string
  fallbackProvider: AdminAiSettings["chat"]["provider"]
}): {
  provider: AdminAiSettings["chat"]["provider"]
  model: string
  value: string
} {
  const trimmed = value.trim()
  const separator = trimmed.indexOf(":")
  const maybeProvider = separator > 0 ? trimmed.slice(0, separator) : ""

  if (maybeProvider === "ollama" || maybeProvider === "gemini") {
    const model = trimmed.slice(separator + 1).trim()
    return {
      provider: maybeProvider,
      model,
      value: formatChatModelValue({ provider: maybeProvider, model }),
    }
  }

  return {
    provider: fallbackProvider,
    model: trimmed,
    value: formatChatModelValue({ provider: fallbackProvider, model: trimmed }),
  }
}

function buildAvailableProviderModels({
  isReachable,
  models,
  provider,
}: {
  isReachable: boolean
  models: AdminAiModel[]
  provider: AdminAiProviderKind
}) {
  if (!isReachable) return []

  const modelsByName = new Map<string, AdminAiProviderModelOption>()

  for (const liveModel of models) {
    if (liveModel.available === false) continue

    const capabilities = mapProviderCapabilities(liveModel.capabilities)
    if (capabilities.length === 0) continue

    modelsByName.set(liveModel.name, {
      provider,
      model: liveModel.name,
      label: liveModel.displayName ?? liveModel.description ?? liveModel.name,
      capabilities,
      embeddingDimensions: liveModel.embeddingDimensions,
    })
  }

  return Array.from(modelsByName.values()).sort((left, right) => left.model.localeCompare(right.model))
}

function getSetupState({
  aiEnabled,
  providers,
  hasSearchEngine,
}: {
  aiEnabled: boolean
  providers: ProviderSummary[]
  hasSearchEngine: boolean
}): AiSetupState {
  const configuredProviders = providers.filter((provider) => provider.isConfigured).length

  if (configuredProviders === 0) return "no_providers"
  if (!hasSearchEngine) return "needs_configuration"
  return aiEnabled ? "enabled" : "ready"
}

function shouldPollAiStatus(status: AdminAiStatus | null) {
  if (status?.aiFeaturesEnabled !== true) return false

  const hasWritableIndex =
    status.embedding.activeIndex !== null ||
    status.embedding.candidateIndexes.some((index) => index.status === "building" || index.status === "ready")

  if (!hasWritableIndex) return false

  if (status.embedding.chunkCoverage.indexedChunkCount < status.embedding.chunkCoverage.totalChunkCount) {
    return 2000
  }

  return 10000
}

function hasCompleteEmbeddingSelection(settings: AdminAiSettings["embedding"]) {
  return (
    settings.provider !== null &&
    settings.baseUrl.trim().length > 0 &&
    (settings.model?.trim().length ?? 0) > 0
  )
}

function toSchemaModelValue(model: string) {
  const trimmed = model.trim()

  return trimmed.length > 0 ? trimmed : " "
}

export default function AdminAiSettingsPage() {
  const [meState, setMeState] = useState<AsyncState<MeResponse>>(emptyAsyncState)
  const [settingsState, setSettingsState] = useState<AsyncState<{ settings: AdminAiSettings }>>(emptyAsyncState)
  const [statusState, setStatusState] = useState<AsyncState<{ status: AdminAiStatus }>>(emptyAsyncState)
  const [geminiModelsState, setGeminiModelsState] = useState<AsyncState<{ models: AdminAiModel[] }>>(emptyAsyncState)
  const [ollamaModelsState, setOllamaModelsState] = useState<AsyncState<{ models: AdminAiModel[] }>>(emptyAsyncState)
  const [geminiAvailabilityState, setGeminiAvailabilityState] =
    useState<AsyncState<{ availability: AdminAiAvailability }>>(emptyAsyncState)
  const [ollamaAvailabilityState, setOllamaAvailabilityState] =
    useState<AsyncState<{ availability: AdminAiAvailability }>>(emptyAsyncState)
  const [aiDraftOverride, setAiDraftOverride] = useState<AiSettingsDraftOverride>({})
  const [isSaving, setIsSaving] = useState(false)
  const [showProviderDetails, setShowProviderDetails] = useState(false)
  const [expandedProvider, setExpandedProvider] = useState<AdminAiProviderKind | null>(null)
  const [isChatModelsDialogOpen, setIsChatModelsDialogOpen] = useState(false)
  const [draftAllowedChatModels, setDraftAllowedChatModels] = useState<string[]>([])
  const [draftDefaultChatModel, setDraftDefaultChatModel] = useState("")
  const [isEmbeddingModelDialogOpen, setIsEmbeddingModelDialogOpen] = useState(false)
  const [selectedEmbeddingModelKey, setSelectedEmbeddingModelKey] = useState("")
  const [isTranslationModelDialogOpen, setIsTranslationModelDialogOpen] = useState(false)
  const [selectedTranslationModelKey, setSelectedTranslationModelKey] = useState("")
  const autoDisabledEmbeddingModelKeyRef = useRef<string | null>(null)

  const savedAiSettings = settingsState.data?.settings ?? emptyAiSettings
  const isAdmin = meState.data?.isAdmin === true

  const aiDraft = useMemo(() => {
    const draft: AdminAiSettings = {
      ...savedAiSettings,
      ...aiDraftOverride,
      chat: {
        ...savedAiSettings.chat,
        ...(aiDraftOverride.chat ?? {}),
      },
      translation: {
        ...(savedAiSettings.translation ?? savedAiSettings.chat),
        ...(aiDraftOverride.translation ?? {}),
      },
      embedding: {
        ...savedAiSettings.embedding,
        ...(aiDraftOverride.embedding ?? {}),
      },
      providers: {
        ...(savedAiSettings.providers ?? emptyAiSettings.providers),
        ...(aiDraftOverride.providers ?? {}),
        gemini: {
          baseUrl: geminiBaseUrl,
          apiKeySecretRef: null,
          ...(savedAiSettings.providers?.gemini ?? emptyAiSettings.providers?.gemini),
          ...(aiDraftOverride.providers?.gemini ?? {}),
        },
      },
    }

    draft.ollamaHost =
      draft.chat.provider === "ollama"
        ? draft.chat.baseUrl
        : savedAiSettings.ollamaHost || draft.translation.baseUrl || draft.embedding.baseUrl
    draft.model = draft.chat.provider === "ollama" ? draft.chat.model : draft.translation.model
    draft.translation.baseUrl = draft.translation.baseUrl || draft.ollamaHost || draft.embedding.baseUrl

    return draft
  }, [aiDraftOverride, savedAiSettings])

  const effectiveOllamaBaseUrl =
    aiDraft.chat.provider === "ollama"
      ? aiDraft.chat.baseUrl
      : aiDraft.ollamaHost || aiDraft.translation.baseUrl || aiDraft.embedding.baseUrl

  const isGeminiConfigured = aiDraft.providers?.gemini?.configured === true
  const geminiApiKeySecretRef =
    aiDraft.providers?.gemini?.apiKeySecretRef ?? aiDraft.chat.apiKeySecretRef ?? null
  const configuredGeminiChatModel = aiDraft.chat.provider === "gemini" ? aiDraft.chat.model.trim() : ""
  const configuredOllamaChatModel = aiDraft.chat.provider === "ollama" ? aiDraft.chat.model.trim() : ""

  const loadMe = useCallback(async () => {
    setMeState((current) => ({ ...current, isFetching: true }))
    try {
      const data = await getMe()
      setMeState({ data, error: null, isLoading: false, isFetching: false, updatedAt: Date.now() })
    } catch (error) {
      setMeState({
        data: null,
        error: error instanceof Error ? error : new Error("Could not load account."),
        isLoading: false,
        isFetching: false,
        updatedAt: Date.now(),
      })
    }
  }, [])

  const loadSettings = useCallback(async () => {
    setSettingsState((current) => ({ ...current, isFetching: true }))
    try {
      const data = await getAdminAiSettings()
      setSettingsState({ data, error: null, isLoading: false, isFetching: false, updatedAt: Date.now() })
    } catch (error) {
      setSettingsState({
        data: null,
        error: error instanceof Error ? error : new Error("Could not load AI settings."),
        isLoading: false,
        isFetching: false,
        updatedAt: Date.now(),
      })
    }
  }, [])

  const loadStatus = useCallback(async ({ silent = false }: { silent?: boolean } = {}) => {
    setStatusState((current) => ({ ...current, isFetching: true, isLoading: silent ? current.isLoading : current.isLoading }))
    try {
      const data = await getAdminAiStatus()
      setStatusState({ data, error: null, isLoading: false, isFetching: false, updatedAt: Date.now() })
    } catch (error) {
      setStatusState((current) => ({
        data: current.data,
        error: error instanceof Error ? error : new Error("Could not load AI status."),
        isLoading: false,
        isFetching: false,
        updatedAt: Date.now(),
      }))
    }
  }, [])

  const refreshGemini = useCallback(async () => {
    if (!isAdmin || !isGeminiConfigured) {
      setGeminiModelsState({ data: { models: [] }, error: null, isLoading: false, isFetching: false, updatedAt: 0 })
      setGeminiAvailabilityState({
        data: null,
        error: null,
        isLoading: false,
        isFetching: false,
        updatedAt: 0,
      })
      return
    }

    setGeminiModelsState((current) => ({ ...current, isFetching: true }))
    try {
      const data = await listAdminAiProviderModels({
        host: geminiBaseUrl,
        provider: "gemini",
        includeEmbeddingModels: true,
        apiKeySecretRef: geminiApiKeySecretRef,
      })
      setGeminiModelsState({ data, error: null, isLoading: false, isFetching: false, updatedAt: Date.now() })
    } catch (error) {
      setGeminiModelsState({
        data: null,
        error: error instanceof Error ? error : new Error("Could not load Gemini models."),
        isLoading: false,
        isFetching: false,
        updatedAt: Date.now(),
      })
    }
  }, [geminiApiKeySecretRef, isAdmin, isGeminiConfigured])

  const refreshGeminiAvailability = useCallback(async () => {
    if (!isAdmin || !isGeminiConfigured || configuredGeminiChatModel.length === 0) {
      setGeminiAvailabilityState({
        data: null,
        error: null,
        isLoading: false,
        isFetching: false,
        updatedAt: 0,
      })
      return
    }

    setGeminiAvailabilityState((current) => ({ ...current, isFetching: true }))
    try {
      const data = await checkAiModelAvailability({
        host: geminiBaseUrl,
        model: configuredGeminiChatModel,
        provider: "gemini",
        apiKeySecretRef: geminiApiKeySecretRef,
      })
      setGeminiAvailabilityState({ data, error: null, isLoading: false, isFetching: false, updatedAt: Date.now() })
    } catch (error) {
      setGeminiAvailabilityState({
        data: null,
        error: error instanceof Error ? error : new Error("Could not check Gemini availability."),
        isLoading: false,
        isFetching: false,
        updatedAt: Date.now(),
      })
    }
  }, [configuredGeminiChatModel, geminiApiKeySecretRef, isAdmin, isGeminiConfigured])

  const refreshOllama = useCallback(async () => {
    if (!isAdmin || effectiveOllamaBaseUrl.trim().length === 0) {
      setOllamaModelsState({ data: { models: [] }, error: null, isLoading: false, isFetching: false, updatedAt: 0 })
      return
    }

    setOllamaModelsState((current) => ({ ...current, isFetching: true }))
    try {
      const data = await listAdminAiProviderModels({
        host: effectiveOllamaBaseUrl,
        provider: "ollama",
        includeEmbeddingModels: true,
      })
      setOllamaModelsState({ data, error: null, isLoading: false, isFetching: false, updatedAt: Date.now() })
    } catch (error) {
      setOllamaModelsState({
        data: null,
        error: error instanceof Error ? error : new Error("Could not load Ollama models."),
        isLoading: false,
        isFetching: false,
        updatedAt: Date.now(),
      })
    }
  }, [effectiveOllamaBaseUrl, isAdmin])

  const refreshOllamaAvailability = useCallback(async () => {
    if (!isAdmin || effectiveOllamaBaseUrl.trim().length === 0 || configuredOllamaChatModel.length === 0) {
      setOllamaAvailabilityState({
        data: null,
        error: null,
        isLoading: false,
        isFetching: false,
        updatedAt: 0,
      })
      return
    }

    setOllamaAvailabilityState((current) => ({ ...current, isFetching: true }))
    try {
      const data = await checkAiModelAvailability({
        host: effectiveOllamaBaseUrl,
        model: configuredOllamaChatModel,
        provider: "ollama",
      })
      setOllamaAvailabilityState({ data, error: null, isLoading: false, isFetching: false, updatedAt: Date.now() })
    } catch (error) {
      setOllamaAvailabilityState({
        data: null,
        error: error instanceof Error ? error : new Error("Could not check Ollama availability."),
        isLoading: false,
        isFetching: false,
        updatedAt: Date.now(),
      })
    }
  }, [configuredOllamaChatModel, effectiveOllamaBaseUrl, isAdmin])

  useEffect(() => {
    void loadMe()
  }, [loadMe])

  useEffect(() => {
    if (!isAdmin) return
    void loadSettings()
    void loadStatus()
  }, [isAdmin, loadSettings, loadStatus])

  useEffect(() => {
    if (!isAdmin || settingsState.isLoading) return
    void refreshGemini()
  }, [isAdmin, refreshGemini, settingsState.isLoading])

  useEffect(() => {
    if (!isAdmin || settingsState.isLoading) return
    void refreshOllama()
  }, [isAdmin, refreshOllama, settingsState.isLoading])

  useEffect(() => {
    if (!isAdmin || settingsState.isLoading) return
    void refreshGeminiAvailability()
  }, [isAdmin, refreshGeminiAvailability, settingsState.isLoading])

  useEffect(() => {
    if (!isAdmin || settingsState.isLoading) return
    void refreshOllamaAvailability()
  }, [isAdmin, refreshOllamaAvailability, settingsState.isLoading])

  useEffect(() => {
    if (!isAdmin) return
    const pollMs = shouldPollAiStatus(statusState.data?.status ?? null)
    if (pollMs === false) return

    const id = window.setInterval(() => {
      void loadStatus({ silent: true })
    }, pollMs)

    return () => window.clearInterval(id)
  }, [isAdmin, loadStatus, statusState.data?.status])

  const geminiProviderModels = useMemo<AdminAiProviderModelOption[]>(
    () =>
      (geminiModelsState.data?.models ?? []).map((model) => ({
        provider: "gemini",
        model: model.name,
        label: model.displayName ?? model.description ?? model.name,
        capabilities: mapProviderCapabilities(model.capabilities),
        embeddingDimensions: model.embeddingDimensions,
      })),
    [geminiModelsState.data?.models],
  )

  const geminiAvailability = geminiAvailabilityState.data?.availability
  const isGeminiProviderReachable =
    geminiModelsState.data !== null || geminiAvailability?.reachable === true
  const isGeminiProviderHealthy = isGeminiProviderReachable

  const ollamaAvailability = ollamaAvailabilityState.data?.availability
  const isOllamaProviderReachable =
    ollamaModelsState.data !== null || ollamaAvailability?.reachable === true
  const isOllamaSelectedModelAvailable = ollamaAvailability?.modelAvailable === true
  const isOllamaProviderHealthy = isOllamaProviderReachable

  const availableGeminiChatModels = useMemo(
    () =>
      isGeminiConfigured
        ? geminiProviderModels.filter((model) => hasModelCapability(model, "chat"))
        : [],
    [geminiProviderModels, isGeminiConfigured],
  )

  const availableOllamaModels = useMemo(
    () =>
      buildAvailableProviderModels({
        isReachable: isOllamaProviderReachable,
        models: ollamaModelsState.data?.models ?? ollamaAvailability?.models ?? [],
        provider: "ollama",
      }),
    [isOllamaProviderReachable, ollamaAvailability?.models, ollamaModelsState.data?.models],
  )

  const availableEmbeddingProviderModels = useMemo(
    () =>
      [...geminiProviderModels, ...availableOllamaModels].filter((model) =>
        hasModelCapability(model, "embedding"),
      ),
    [availableOllamaModels, geminiProviderModels],
  )

  const chatModelOptions = useMemo<ChatModelOption[]>(() => {
    const geminiOptions = availableGeminiChatModels.map((model) => ({
      value: formatChatModelValue({ provider: "gemini", model: model.model }),
      provider: "gemini" as const,
      providerLabel: "Google Gemini",
      model: model.model,
      label: model.label ?? model.model,
      baseUrl: geminiBaseUrl,
      description: model.label ?? null,
      capabilities: model.capabilities,
    }))
    const ollamaOptions = availableOllamaModels
      .filter((model) => hasModelCapability(model, "chat"))
      .map((model) => ({
        value: formatChatModelValue({ provider: "ollama", model: model.model }),
        provider: "ollama" as const,
        providerLabel: "Ollama",
        model: model.model,
        label: model.label ?? model.model,
        baseUrl: effectiveOllamaBaseUrl,
        description: model.label ?? null,
        capabilities: model.capabilities,
      }))

    return [...geminiOptions, ...ollamaOptions]
  }, [availableGeminiChatModels, availableOllamaModels, effectiveOllamaBaseUrl])

  const chatModelValues = useMemo(() => chatModelOptions.map((option) => option.value), [chatModelOptions])

  const translationModelOptions = useMemo<TranslationModelOption[]>(() => {
    const geminiOptions = availableGeminiChatModels
      .filter((model) => hasModelCapability(model, "chat") && hasModelCapability(model, "vision"))
      .map((model) => ({
        key: formatChatModelValue({ provider: "gemini", model: model.model }),
        provider: "gemini" as const,
        providerLabel: "Google Gemini",
        model: model.model,
        label: model.label ?? model.model,
        baseUrl: geminiBaseUrl,
        description: model.label ?? null,
        capabilities: model.capabilities,
        isConfigured:
          aiDraft.translation.provider === "gemini" && aiDraft.translation.model === model.model,
      }))
    const ollamaOptions = availableOllamaModels
      .filter((model) => hasModelCapability(model, "chat") && hasModelCapability(model, "vision"))
      .map((model) => ({
        key: formatChatModelValue({ provider: "ollama", model: model.model }),
        provider: "ollama" as const,
        providerLabel: "Ollama",
        model: model.model,
        label: model.label ?? model.model,
        baseUrl: effectiveOllamaBaseUrl,
        description: model.label ?? null,
        capabilities: model.capabilities,
        isConfigured:
          aiDraft.translation.provider === "ollama" && aiDraft.translation.model === model.model,
      }))

    return [...geminiOptions, ...ollamaOptions]
  }, [
    aiDraft.translation.model,
    aiDraft.translation.provider,
    availableGeminiChatModels,
    availableOllamaModels,
    effectiveOllamaBaseUrl,
  ])

  const translationModelKeys = useMemo(
    () => translationModelOptions.map((option) => option.key),
    [translationModelOptions],
  )

  const configuredChatSelection = parseChatModelValue({
    value: aiDraft.chat.model.trim(),
    fallbackProvider: aiDraft.chat.provider,
  })
  const configuredChatModel = configuredChatSelection.value
  const isConfiguredChatModelAvailable =
    configuredChatModel.length > 0 && chatModelValues.includes(configuredChatModel)
  const effectiveDefaultChatModel = isConfiguredChatModelAvailable ? configuredChatModel : ""
  const effectiveDefaultChatSelection = parseChatModelValue({
    value: effectiveDefaultChatModel || configuredChatModel,
    fallbackProvider: aiDraft.chat.provider,
  })
  const effectiveDefaultChatOption =
    chatModelOptions.find((option) => option.value === effectiveDefaultChatModel) ?? null

  const configuredTranslationModel = aiDraft.translation.model.trim()
  const configuredTranslationModelKey = configuredTranslationModel
    ? formatChatModelValue({
        provider: aiDraft.translation.provider,
        model: configuredTranslationModel,
      })
    : ""
  const isConfiguredTranslationModelAvailable =
    configuredTranslationModel.length > 0 && translationModelKeys.includes(configuredTranslationModelKey)
  const effectiveTranslationOption =
    (isConfiguredTranslationModelAvailable
      ? translationModelOptions.find((option) => option.key === configuredTranslationModelKey)
      : null) ?? null
  const effectiveTranslationModel = effectiveTranslationOption?.model ?? configuredTranslationModel
  const selectedTranslationModel =
    translationModelOptions.find((option) => option.key === selectedTranslationModelKey) ?? null
  const selectedTranslationModelChanged =
    selectedTranslationModel !== null &&
    (aiDraft.translation.provider !== selectedTranslationModel.provider ||
      aiDraft.translation.baseUrl !== selectedTranslationModel.baseUrl ||
      aiDraft.translation.model !== selectedTranslationModel.model)

  const savedAllowedChatModels = aiDraft.chat.allowedModels ?? []
  const savedAllowedChatModelValues = savedAllowedChatModels.map(
    (model) => parseChatModelValue({ value: model, fallbackProvider: aiDraft.chat.provider }).value,
  )
  const effectiveAllowedChatModels =
    savedAllowedChatModels.length === 0
      ? effectiveDefaultChatModel.length > 0
        ? chatModelValues.filter((model) => model === effectiveDefaultChatModel)
        : []
      : chatModelValues.filter(
          (model) => savedAllowedChatModelValues.includes(model) || model === effectiveDefaultChatModel,
        )

  const isChatConfigValid =
    effectiveDefaultChatModel.length > 0 &&
    ((effectiveDefaultChatSelection.provider === "gemini" && isGeminiProviderHealthy) ||
      (effectiveDefaultChatSelection.provider === "ollama" &&
        isConfiguredChatModelAvailable &&
        (effectiveDefaultChatOption?.baseUrl ?? "").trim().length > 0))

  const ollamaProviderStatus =
    effectiveOllamaBaseUrl.trim().length === 0
      ? "Not configured"
      : ollamaAvailabilityState.isFetching
        ? "Checking"
        : ollamaAvailabilityState.error
          ? "Error"
          : isOllamaSelectedModelAvailable
            ? "Healthy"
            : isOllamaProviderReachable
              ? "Reachable"
              : "Unavailable"
  const ollamaProviderTone =
    ollamaProviderStatus === "Healthy" || ollamaProviderStatus === "Reachable"
      ? "enabled"
      : ollamaProviderStatus === "Checking"
        ? "inactive"
        : "warning"

  const geminiProviderStatus = !isGeminiConfigured
    ? "Not configured"
    : geminiModelsState.isFetching || geminiAvailabilityState.isFetching
      ? "Checking"
      : isGeminiProviderReachable
        ? "Healthy"
        : "Unavailable"
  const geminiProviderTone =
    geminiProviderStatus === "Healthy"
      ? "enabled"
      : geminiProviderStatus === "Checking"
        ? "inactive"
        : "warning"

  const isTranslationConfigValid =
    (
      effectiveTranslationOption?.baseUrl ??
      (aiDraft.translation.baseUrl || aiDraft.chat.baseUrl)
    ).trim().length > 0 &&
    effectiveTranslationModel.length > 0 &&
    effectiveTranslationOption !== null &&
    ((effectiveTranslationOption.provider === "gemini" && isGeminiProviderHealthy) ||
      (effectiveTranslationOption.provider === "ollama" && isConfiguredTranslationModelAvailable))
  const isTranslationModelMultimodal =
    effectiveTranslationModel.length > 0 && (effectiveTranslationOption?.capabilities.includes("vision") ?? false)

  const activeIndex = statusState.data?.status.embedding.activeIndex ?? null
  const preparingIndex =
    statusState.data?.status.embedding.candidateIndexes.find(
      (index) => index.status === "building" || index.status === "ready",
    ) ?? null
  const currentIndex = preparingIndex ?? activeIndex
  const chunkCoverage = statusState.data?.status.embedding.chunkCoverage ?? {
    indexedChunkCount: 0,
    totalChunkCount: 0,
  }

  const selectedEmbeddingProviderModel =
    aiDraft.embedding.provider !== null && aiDraft.embedding.model !== null
      ? availableEmbeddingProviderModels.find(
          (model) =>
            model.provider === aiDraft.embedding.provider &&
            isSameProviderModel({
              provider: model.provider,
              left: model.model,
              right: aiDraft.embedding.model ?? "",
            }),
        )
      : undefined
  const isSelectedEmbeddingProviderReachable =
    aiDraft.embedding.provider === "ollama"
      ? isOllamaProviderReachable
      : aiDraft.embedding.provider === "gemini"
        ? geminiModelsState.data !== null
        : false
  const isSelectedEmbeddingModelConfirmedMissing =
    aiDraft.embedding.provider !== null &&
    isSelectedEmbeddingProviderReachable &&
    selectedEmbeddingProviderModel === undefined
  const isEmbeddingSelectionConfigured =
    aiDraft.embedding.provider !== null &&
    aiDraft.embedding.baseUrl.trim().length > 0 &&
    (aiDraft.embedding.model?.trim().length ?? 0) > 0
  const selectedSearchEngine = isEmbeddingSelectionConfigured
    ? {
        provider: aiDraft.embedding.provider!,
        baseUrl: aiDraft.embedding.baseUrl,
        model: aiDraft.embedding.model!,
        dimensions: aiDraft.embedding.dimensions ?? null,
      }
    : undefined
  const isSelectedEmbeddingProviderHealthy =
    aiDraft.embedding.provider === "ollama"
      ? isOllamaProviderHealthy
      : aiDraft.embedding.provider === "gemini"
        ? isGeminiProviderHealthy
        : false
  const isEmbeddingOperational =
    selectedSearchEngine !== undefined &&
    isSelectedEmbeddingProviderHealthy &&
    !isSelectedEmbeddingModelConfirmedMissing
  const missingEmbeddingModelKey =
    selectedSearchEngine !== undefined && isSelectedEmbeddingModelConfirmedMissing
      ? `${selectedSearchEngine.provider}:${selectedSearchEngine.baseUrl}:${selectedSearchEngine.model}`
      : null

  const indexProgress = currentIndex
    ? getIndexProgress(currentIndex)
    : chunkCoverage.totalChunkCount > 0
      ? Math.min(100, Math.round((chunkCoverage.indexedChunkCount / chunkCoverage.totalChunkCount) * 100))
      : 0
  const hasIndexableChunks = chunkCoverage.totalChunkCount > 0
  const isSemanticIndexIncomplete =
    aiDraft.aiFeaturesEnabled &&
    hasIndexableChunks &&
    indexProgress < 100 &&
    (currentIndex !== null || chunkCoverage.totalChunkCount > 0)
  const semanticStatus = !aiDraft.aiFeaturesEnabled
    ? "Paused"
    : selectedSearchEngine === undefined
      ? "Needs configuration"
      : !isEmbeddingOperational
        ? "Unavailable"
        : !hasIndexableChunks
          ? "No documents"
          : isSemanticIndexIncomplete
            ? "Building"
            : currentIndex
              ? formatIndexStatus(currentIndex.status)
              : "Ready to index"
  const semanticProgressStatus: ProgressStatus = !aiDraft.aiFeaturesEnabled
    ? "paused"
    : !hasIndexableChunks || selectedSearchEngine === undefined || !isEmbeddingOperational
      ? "idle"
      : currentIndex?.status === "failed"
        ? "failed"
        : isSemanticIndexIncomplete
          ? "building"
          : (currentIndex?.status ?? "idle")

  const embeddingModelOptions = useMemo<EmbeddingModelOption[]>(
    () =>
      buildEmbeddingModelOptions({
        activeIndex,
        baseUrl: aiDraft.embedding.baseUrl || effectiveOllamaBaseUrl,
        model: aiDraft.embedding.model,
        provider: aiDraft.embedding.provider,
        providerBaseUrls: {
          gemini: geminiBaseUrl,
          ollama: effectiveOllamaBaseUrl,
        },
        providerModels: availableEmbeddingProviderModels,
        savedEmbedding: savedAiSettings.embedding,
      }),
    [
      activeIndex,
      aiDraft.embedding.baseUrl,
      aiDraft.embedding.model,
      aiDraft.embedding.provider,
      availableEmbeddingProviderModels,
      effectiveOllamaBaseUrl,
      savedAiSettings.embedding,
    ],
  )
  const selectedEmbeddingModel =
    embeddingModelOptions.find((option) => option.key === selectedEmbeddingModelKey) ?? null
  const selectableEmbeddingModelOptions = useMemo(
    () => embeddingModelOptions.filter((option) => option.isDiscovered),
    [embeddingModelOptions],
  )
  const selectedEmbeddingModelChanged =
    selectedEmbeddingModel !== null &&
    (savedAiSettings.embedding.provider !== selectedEmbeddingModel.provider ||
      savedAiSettings.embedding.baseUrl !== selectedEmbeddingModel.baseUrl ||
      savedAiSettings.embedding.model !== selectedEmbeddingModel.model ||
      savedAiSettings.embedding.dimensions !== selectedEmbeddingModel.dimensions)

  const providerSummaries: ProviderSummary[] = [
    {
      id: "gemini",
      name: "Google Gemini",
      description: "Hosted provider",
      endpoint: geminiBaseUrl,
      status: geminiProviderStatus,
      tone: geminiProviderTone,
      isConfigured: isGeminiConfigured,
      isHealthy: geminiProviderStatus === "Healthy",
      modelCount: geminiProviderModels.length,
      models: geminiProviderModels.map((model) => model.model),
      updatedAt: Math.max(geminiModelsState.updatedAt, geminiAvailabilityState.updatedAt),
      error:
        geminiModelsState.error?.message ??
        geminiAvailabilityState.error?.message ??
        geminiAvailability?.error ??
        null,
      isChecking: geminiModelsState.isFetching || geminiAvailabilityState.isFetching,
      onRefresh: () => {
        void refreshGemini()
        void refreshGeminiAvailability()
      },
    },
    {
      id: "ollama",
      name: "Ollama",
      description: "Self-hosted provider",
      endpoint: effectiveOllamaBaseUrl,
      status: ollamaProviderStatus,
      tone: ollamaProviderTone,
      isConfigured: effectiveOllamaBaseUrl.trim().length > 0,
      isHealthy: isOllamaProviderHealthy,
      modelCount: availableOllamaModels.length,
      models: availableOllamaModels.map((model) => model.model),
      updatedAt: Math.max(ollamaModelsState.updatedAt, ollamaAvailabilityState.updatedAt),
      error:
        ollamaModelsState.error?.message ??
        ollamaAvailabilityState.error?.message ??
        ollamaAvailability?.error ??
        null,
      isChecking: ollamaModelsState.isFetching || ollamaAvailabilityState.isFetching,
      onRefresh: () => {
        void refreshOllama()
        void refreshOllamaAvailability()
      },
    },
  ]

  const configuredChatProviderReachable =
    effectiveDefaultChatSelection.provider === "ollama" ? isOllamaProviderReachable : isGeminiProviderReachable
  const configuredTranslationProviderReachable =
    aiDraft.translation.provider === "ollama" ? isOllamaProviderReachable : isGeminiProviderReachable
  const isConfiguredChatModelMissing =
    configuredChatModel.length > 0 && configuredChatProviderReachable && !isConfiguredChatModelAvailable
  const isConfiguredTranslationModelMissing =
    configuredTranslationModel.length > 0 &&
    configuredTranslationProviderReachable &&
    !isConfiguredTranslationModelAvailable
  const needsDefaultChatModelSelection = configuredChatModel.length === 0 || isConfiguredChatModelMissing
  const needsDefaultTranslationModelSelection =
    configuredTranslationModel.length === 0 || isConfiguredTranslationModelMissing

  const providerHealthIssues: HealthIssue[] = providerSummaries
    .filter((provider) => provider.isConfigured && !provider.isChecking && !provider.isHealthy)
    .map((provider) => ({
      id: `provider-unavailable-${provider.id}`,
      severity: "warning",
      title: `${provider.name} is unavailable`,
      description:
        provider.error ??
        "A configured AI provider cannot currently be reached. Features that depend on it are temporarily unavailable.",
    }))
  const embeddingHealthIssue: HealthIssue | null =
    selectedSearchEngine !== undefined && isSelectedEmbeddingModelConfirmedMissing
      ? {
          id: "embedding-model-unavailable",
          severity: "critical",
          title: "Configured embedding model is unavailable",
          description:
            "The selected embedding model is no longer returned by its provider. Choose another embedding model to restore AI Search.",
        }
      : selectedSearchEngine !== undefined && !isSelectedEmbeddingProviderHealthy
        ? {
            id: "embedding-provider-unavailable",
            severity: "warning",
            title: "Embedding provider is unavailable",
            description:
              "The configured embedding provider cannot currently be reached. Indexing and embedding-dependent features will recover when the provider is healthy again.",
          }
        : null
  const chatHealthIssue: HealthIssue | null =
    embeddingHealthIssue !== null
      ? {
          id: "chat-embedding-dependency",
          severity: embeddingHealthIssue.severity,
          title: "AI Chat is unavailable",
          description: "Document chat depends on the configured embedding platform for retrieval.",
        }
      : needsDefaultChatModelSelection
        ? {
            id:
              configuredChatModel.length > 0
                ? "default-chat-model-unavailable"
                : "default-chat-model-not-selected",
            severity: "warning",
            title:
              configuredChatModel.length > 0
                ? "Default chat model is unavailable"
                : "Default chat model needs selection",
            description:
              configuredChatModel.length > 0
                ? "The configured default chat model is no longer returned by its provider. Choose another default model to restore AI Chat."
                : "Choose a default chat model from an available provider to make AI Chat available.",
          }
        : null
  const translationHealthIssue: HealthIssue | null =
    embeddingHealthIssue !== null
      ? {
          id: "translation-embedding-dependency",
          severity: embeddingHealthIssue.severity,
          title: "Translation is unavailable",
          description:
            "Translation depends on the configured AI platform and is unavailable until embedding health recovers.",
        }
      : needsDefaultTranslationModelSelection
        ? {
            id:
              configuredTranslationModel.length > 0
                ? "default-translation-model-unavailable"
                : "default-translation-model-not-selected",
            severity: "warning",
            title:
              configuredTranslationModel.length > 0
                ? "Default translation model is unavailable"
                : "Default translation model needs selection",
            description:
              configuredTranslationModel.length > 0
                ? "The configured default translation model is no longer returned by its provider. Choose another default model to restore Translation."
                : "Choose a default translation model from an available provider to make Translation available.",
          }
        : null
  const missingAllowedChatModels = savedAllowedChatModelValues.filter(
    (model) => model !== configuredChatModel && !chatModelValues.includes(model),
  )
  const enabledModelsHealthIssue: HealthIssue | null =
    savedAllowedChatModelValues.length > 0 && chatModelValues.length > 0 && missingAllowedChatModels.length > 0
      ? {
          id: "enabled-chat-models-unavailable",
          severity: "info",
          title: "Some enabled chat models are no longer available",
          description:
            "Unavailable non-default chat models have been removed from the available model list. No action is required unless users still need those models.",
        }
      : null
  const topLevelEmbeddingHealthIssue =
    embeddingHealthIssue?.id === "embedding-model-unavailable" ? null : embeddingHealthIssue
  const healthIssues = [
    ...providerHealthIssues,
    topLevelEmbeddingHealthIssue,
    enabledModelsHealthIssue,
  ].filter((issue): issue is HealthIssue => issue !== null)

  const setupState = getSetupState({
    aiEnabled: aiDraft.aiFeaturesEnabled,
    providers: providerSummaries,
    hasSearchEngine: selectedSearchEngine !== undefined,
  })
  const isAiReady = setupState === "ready" || setupState === "enabled"
  const visibleProviderSummaries = providerSummaries.filter((provider) => provider.isConfigured)
  const isInitialDiscoveryPending =
    (isGeminiConfigured && (geminiModelsState.isLoading || geminiAvailabilityState.isLoading)) ||
    (effectiveOllamaBaseUrl.trim().length > 0 &&
      (ollamaModelsState.isLoading || ollamaAvailabilityState.isLoading))
  const isAiConfigurationLoading =
    settingsState.isLoading || statusState.isLoading || isInitialDiscoveryPending

  function mergeAiDraft(next: AiSettingsDraftOverride): AdminAiSettings {
    const merged: AdminAiSettings = {
      ...aiDraft,
      ...next,
      chat: {
        ...aiDraft.chat,
        ...(next.chat ?? {}),
      },
      translation: {
        ...aiDraft.translation,
        ...(next.translation ?? {}),
      },
      embedding: {
        ...aiDraft.embedding,
        ...(next.embedding ?? {}),
      },
    }

    merged.ollamaHost =
      merged.chat.provider === "ollama"
        ? merged.chat.baseUrl
        : savedAiSettings.ollamaHost || merged.translation.baseUrl || merged.embedding.baseUrl
    merged.model = merged.chat.provider === "ollama" ? merged.chat.model : merged.translation.model
    merged.translation.baseUrl = merged.translation.baseUrl || merged.ollamaHost || merged.embedding.baseUrl

    return merged
  }

  function normalizeAiSettingsForSave(settings: AdminAiSettings): AdminAiSettingsUpdatePayload {
    const configuredModel = parseChatModelValue({
      value: settings.chat.model.trim(),
      fallbackProvider: settings.chat.provider,
    })
    const ollamaBaseUrl = (
      configuredModel.provider === "ollama" && settings.chat.baseUrl.trim().length > 0
        ? settings.chat.baseUrl
        : settings.ollamaHost || savedAiSettings.ollamaHost || settings.embedding.baseUrl
    ).trim()
    const chatBaseUrl = configuredModel.provider === "gemini" ? geminiBaseUrl : ollamaBaseUrl
    const translationBaseUrl = (settings.translation.baseUrl || ollamaBaseUrl).trim()
    const configuredTranslation = settings.translation.model.trim()
    const hasEmbeddingSelection =
      settings.embedding.provider !== null && (settings.embedding.model?.trim().length ?? 0) > 0
    const embeddingBaseUrl = hasEmbeddingSelection
      ? settings.embedding.provider === "gemini"
        ? geminiBaseUrl
        : settings.embedding.baseUrl.trim() || ollamaBaseUrl
      : ""
    const embeddingModel = hasEmbeddingSelection ? settings.embedding.model!.trim() : null
    const legacyModel = configuredModel.provider === "ollama" ? configuredModel.model : configuredTranslation
    const geminiApiKeySecretRef = settings.providers?.gemini?.apiKeySecretRef?.trim() || null

    return {
      aiFeaturesEnabled: settings.aiFeaturesEnabled && hasEmbeddingSelection,
      chat: {
        ...settings.chat,
        provider: configuredModel.provider,
        baseUrl: chatBaseUrl,
        apiKeySecretRef:
          configuredModel.provider === "gemini"
            ? (settings.chat.apiKeySecretRef ?? settings.providers?.gemini?.apiKeySecretRef ?? null)
            : null,
        model: toSchemaModelValue(configuredModel.model),
        allowedModels: (settings.chat.allowedModels ?? effectiveAllowedChatModels).filter(
          (model) => model.trim().length > 0,
        ),
      },
      translation: {
        ...settings.translation,
        provider: settings.translation.provider,
        baseUrl: translationBaseUrl,
        apiKeySecretRef:
          settings.translation.provider === "gemini"
            ? (settings.translation.apiKeySecretRef ?? settings.providers?.gemini?.apiKeySecretRef ?? null)
            : null,
        model: toSchemaModelValue(configuredTranslation),
      },
      embedding: {
        ...settings.embedding,
        provider: hasEmbeddingSelection ? settings.embedding.provider : null,
        baseUrl: embeddingBaseUrl,
        model: embeddingModel,
        dimensions: hasEmbeddingSelection ? settings.embedding.dimensions : null,
      },
      providers: {
        gemini: {
          baseUrl: geminiBaseUrl,
          apiKeySecretRef: geminiApiKeySecretRef,
        },
      },
      ...(ollamaBaseUrl.length > 0 ? { ollamaHost: ollamaBaseUrl } : {}),
      ...(legacyModel.length > 0 ? { model: legacyModel } : {}),
    }
  }

  async function saveSettings(
    settings: AdminAiSettings,
    options: { successMessage?: string; errorMessage?: string } = {},
  ) {
    const normalized = normalizeAiSettingsForSave(settings)

    setIsSaving(true)
    try {
      const result = await updateAdminAiSettings(normalized)
      invalidateChatModelOptionsCache()
      void getChatModelOptions().catch(() => {
        // Chat will retry its background refresh the next time it mounts.
      })
      const shouldKeepSavedEmbeddingDraft =
        hasCompleteEmbeddingSelection(normalized.embedding) &&
        !hasCompleteEmbeddingSelection(result.settings.embedding)

      setAiDraftOverride(
        shouldKeepSavedEmbeddingDraft
          ? {
              embedding: {
                provider: normalized.embedding.provider,
                baseUrl: normalized.embedding.baseUrl,
                apiKeySecretRef: normalized.embedding.apiKeySecretRef,
                model: normalized.embedding.model,
                dimensions: normalized.embedding.dimensions,
              },
            }
          : {},
      )
      setSettingsState({
        data: { settings: result.settings },
        error: null,
        isLoading: false,
        isFetching: false,
        updatedAt: Date.now(),
      })
      setMeState((current) =>
        current.data
          ? {
              ...current,
              data: { ...current.data, aiFeaturesEnabled: result.settings.aiFeaturesEnabled },
              updatedAt: Date.now(),
            }
          : current,
      )
      toast.success(options.successMessage ?? "AI settings saved.")
      await Promise.all([loadSettings(), loadStatus(), loadMe()])
    } catch (error) {
      setAiDraftOverride({})
      toast.error(getErrorMessage(error, options.errorMessage ?? "Could not save AI settings."))
    } finally {
      setIsSaving(false)
    }
  }

  function persistAiDraft(next: AiSettingsDraftOverride, options: { confirmEmbeddingChange?: boolean } = {}) {
    const merged = mergeAiDraft(next)
    const nextEmbeddingConfigChanged =
      savedAiSettings.embedding.provider !== merged.embedding.provider ||
      savedAiSettings.embedding.baseUrl !== merged.embedding.baseUrl ||
      savedAiSettings.embedding.model !== merged.embedding.model ||
      savedAiSettings.embedding.dimensions !== merged.embedding.dimensions

    if (merged.aiFeaturesEnabled && !isAiReady) {
      toast.warning("Choose available models from healthy providers before saving AI settings.")
      return
    }

    if (options.confirmEmbeddingChange && nextEmbeddingConfigChanged) {
      const nextOption = embeddingModelOptions.find(
        (option) =>
          option.isDiscovered &&
          option.provider === merged.embedding.provider &&
          option.baseUrl === merged.embedding.baseUrl &&
          merged.embedding.model !== null &&
          option.model === merged.embedding.model,
      )
      setSelectedEmbeddingModelKey(nextOption?.key ?? "")
      setIsEmbeddingModelDialogOpen(true)
      return
    }

    void saveSettings(merged)
  }

  useEffect(() => {
    if (missingEmbeddingModelKey === null) {
      autoDisabledEmbeddingModelKeyRef.current = null
      return
    }

    if (!isAdmin || !aiDraft.aiFeaturesEnabled || isSaving) return
    if (autoDisabledEmbeddingModelKeyRef.current === missingEmbeddingModelKey) return

    autoDisabledEmbeddingModelKeyRef.current = missingEmbeddingModelKey
    void saveSettings(mergeAiDraft({ aiFeaturesEnabled: false }), {
      successMessage: "AI was disabled because the configured embedding model is unavailable.",
      errorMessage: "Could not disable AI after the embedding model became unavailable.",
    })
  })

  function openChatModelsDialog() {
    const defaultModel = effectiveDefaultChatModel
    const allowed = effectiveAllowedChatModels.length > 0 ? effectiveAllowedChatModels : defaultModel ? [defaultModel] : []

    setDraftDefaultChatModel(defaultModel)
    setDraftAllowedChatModels(chatModelValues.filter((model) => allowed.includes(model) || model === defaultModel))
    setIsChatModelsDialogOpen(true)
  }

  function openSearchEngineDialog() {
    const savedEmbeddingModel = savedAiSettings.embedding.model
    const currentOption =
      savedEmbeddingModel === null
        ? null
        : (embeddingModelOptions.find(
            (option) =>
              option.isDiscovered &&
              option.provider === savedAiSettings.embedding.provider &&
              option.baseUrl === savedAiSettings.embedding.baseUrl &&
              isSameProviderModel({
                provider: option.provider,
                left: option.model,
                right: savedEmbeddingModel,
              }),
          ) ?? null)

    setSelectedEmbeddingModelKey(currentOption?.key ?? "")
    setIsEmbeddingModelDialogOpen(true)
  }

  function openTranslationModelDialog() {
    setSelectedTranslationModelKey(effectiveTranslationOption?.key ?? "")
    setIsTranslationModelDialogOpen(true)
  }

  function updateDraftAllowedChatModel(model: string, checked: boolean) {
    setDraftAllowedChatModels((current) => {
      const next = new Set(current)

      if (checked) {
        next.add(model)
      } else if (model !== draftDefaultChatModel) {
        next.delete(model)
      }

      if (draftDefaultChatModel.length > 0) {
        next.add(draftDefaultChatModel)
      }

      return chatModelValues.filter((option) => next.has(option))
    })
  }

  function updateDraftDefaultChatModel(model: string) {
    setDraftDefaultChatModel(model)
    setDraftAllowedChatModels((current) =>
      chatModelValues.filter((option) => current.includes(option) || option === model),
    )
  }

  function saveChatModelsDialog() {
    if (draftDefaultChatModel.length === 0) return

    const allowed = chatModelValues.filter(
      (model) => draftAllowedChatModels.includes(model) || model === draftDefaultChatModel,
    )
    const defaultSelection = parseChatModelValue({
      value: draftDefaultChatModel,
      fallbackProvider: aiDraft.chat.provider,
    })
    const defaultOption = chatModelOptions.find((option) => option.value === draftDefaultChatModel)
    setIsChatModelsDialogOpen(false)
    persistAiDraft({
      chat: {
        provider: defaultSelection.provider,
        baseUrl: defaultOption?.baseUrl ?? aiDraft.chat.baseUrl,
        model: defaultSelection.model,
        allowedModels: allowed,
        apiKeySecretRef:
          defaultSelection.provider === "gemini"
            ? (aiDraft.providers?.gemini?.apiKeySecretRef ?? aiDraft.chat.apiKeySecretRef)
            : null,
      },
    })
  }

  const pageActions = (
    <Button asChild variant="outline" size="sm">
      <a href="https://docs.arkivra.app" target="_blank" rel="noreferrer">
        <BookOpen className="size-4" />
        Docs
        <ExternalLink className="size-3.5" />
      </a>
    </Button>
  )

  if (meState.isLoading) {
    return (
      <BaseLayout title="AI Settings" description="Configure AI features for this Arkivra instance.">
        <div className="px-4 lg:px-6">
          <LoadingConfiguration />
        </div>
      </BaseLayout>
    )
  }

  if (meState.error) {
    return (
      <BaseLayout title="AI Settings" description="Configure AI features for this Arkivra instance.">
        <div className="px-4 lg:px-6">
          <ErrorCard
            title="Could not load account"
            description={meState.error.message}
            actionLabel="Retry"
            onAction={() => void loadMe()}
          />
        </div>
      </BaseLayout>
    )
  }

  if (!isAdmin) {
    return (
      <BaseLayout title="AI Settings" description="Configure AI features for this Arkivra instance.">
        <div className="px-4 lg:px-6">
          <Card>
            <CardHeader>
              <CardTitle>Admin access required</CardTitle>
              <CardDescription>Only administrators can view or change AI settings.</CardDescription>
            </CardHeader>
          </Card>
        </div>
      </BaseLayout>
    )
  }

  return (
    <BaseLayout
      title="AI Settings"
      description="Configure AI features for this Arkivra instance."
      headerActionsContent={pageActions}
    >
      <div className="space-y-4 px-4 lg:px-6">
        {settingsState.error ? (
          <ErrorCard
            title="Could not load AI settings"
            description={settingsState.error.message}
            actionLabel="Retry"
            onAction={() => void loadSettings()}
          />
        ) : isAiConfigurationLoading ? (
          <LoadingConfiguration />
        ) : (
          <>
            {setupState !== "no_providers" ? (
              <AiStateHero
                state={setupState}
                expandedProvider={expandedProvider}
                healthyProviderCount={visibleProviderSummaries.filter((provider) => provider.isHealthy).length}
                isSaving={isSaving}
                providers={visibleProviderSummaries}
                searchEngineCount={selectableEmbeddingModelOptions.length}
                showProviderDetails={showProviderDetails}
                onChooseSearchEngine={openSearchEngineDialog}
                onDisableAi={() => persistAiDraft({ aiFeaturesEnabled: false })}
                onEnableAi={() => {
                  if (!isAiReady) {
                    toast.warning("Choose an embedding model before enabling AI.")
                    return
                  }

                  persistAiDraft({ aiFeaturesEnabled: true })
                }}
                onExpandedProviderChange={setExpandedProvider}
                onToggleProviderDetails={() => setShowProviderDetails((current) => !current)}
              />
            ) : null}

            {setupState === "no_providers" ? (
              <AiUnconfiguredState />
            ) : (
              <>
                {setupState !== "needs_configuration" && healthIssues.length > 0 ? (
                  <HealthIssuesSection issues={healthIssues} />
                ) : null}

                <CapabilitiesSection
                  state={setupState}
                  chatModelCount={chatModelOptions.length}
                  chatHealthIssue={chatHealthIssue}
                  defaultChatModel={effectiveDefaultChatOption?.label ?? effectiveDefaultChatSelection.model}
                  embeddingHealthIssue={embeddingHealthIssue}
                  effectiveTranslationModel={effectiveTranslationOption?.label ?? effectiveTranslationModel}
                  indexedChunks={chunkCoverage.indexedChunkCount}
                  indexProgress={indexProgress}
                  isChatConfigValid={isChatConfigValid}
                  isSaving={isSaving}
                  isTranslationConfigValid={isTranslationConfigValid && isTranslationModelMultimodal}
                  searchEngineModel={selectedSearchEngine?.model ?? ""}
                  searchEngineProvider={selectedSearchEngine?.provider ?? savedAiSettings.embedding.provider}
                  semanticProgressStatus={semanticProgressStatus}
                  semanticStatus={semanticStatus}
                  totalChunks={chunkCoverage.totalChunkCount}
                  translationHealthIssue={translationHealthIssue}
                  translationModelCount={translationModelOptions.length}
                  onConfigureChatModels={openChatModelsDialog}
                  onConfigureSearchEngine={openSearchEngineDialog}
                  onConfigureTranslation={openTranslationModelDialog}
                />

                {statusState.error ? (
                  <ErrorCard
                    title="AI status is stale"
                    description={statusState.error.message}
                    actionLabel="Refresh status"
                    onAction={() => void loadStatus()}
                  />
                ) : null}
              </>
            )}
          </>
        )}
      </div>

      <ChatModelsDialog
        open={isChatModelsDialogOpen}
        chatModelOptions={chatModelOptions}
        draftAllowedChatModels={draftAllowedChatModels}
        draftDefaultChatModel={draftDefaultChatModel}
        isFetchingChatModels={
          geminiModelsState.isFetching ||
          geminiAvailabilityState.isFetching ||
          ollamaModelsState.isFetching ||
          ollamaAvailabilityState.isFetching
        }
        isSaving={isSaving}
        onAllowedModelChange={updateDraftAllowedChatModel}
        onDefaultModelChange={updateDraftDefaultChatModel}
        onOpenChange={setIsChatModelsDialogOpen}
        onSave={saveChatModelsDialog}
      />

      <EmbeddingModelDialog
        open={isEmbeddingModelDialogOpen}
        aiDraft={aiDraft}
        embeddingModelOptions={embeddingModelOptions}
        selectedEmbeddingModel={selectedEmbeddingModel}
        selectedEmbeddingModelChanged={selectedEmbeddingModelChanged}
        selectedEmbeddingModelKey={selectedEmbeddingModelKey}
        isFetchingModels={
          geminiModelsState.isFetching ||
          geminiAvailabilityState.isFetching ||
          ollamaModelsState.isFetching ||
          ollamaAvailabilityState.isFetching
        }
        isSaving={isSaving}
        onConfirm={() => {
          if (selectedEmbeddingModel === null) return

          setIsEmbeddingModelDialogOpen(false)
          void saveSettings(
            mergeAiDraft({
              aiFeaturesEnabled: true,
              embedding: {
                provider: selectedEmbeddingModel.provider,
                baseUrl: selectedEmbeddingModel.baseUrl,
                model: selectedEmbeddingModel.model,
                dimensions: selectedEmbeddingModel.dimensions,
              },
            }),
          )
        }}
        onOpenChange={setIsEmbeddingModelDialogOpen}
        onSelectedModelKeyChange={setSelectedEmbeddingModelKey}
      />

      <TranslationModelDialog
        open={isTranslationModelDialogOpen}
        translationModelOptions={translationModelOptions}
        selectedTranslationModel={selectedTranslationModel}
        selectedTranslationModelChanged={selectedTranslationModelChanged}
        selectedTranslationModelKey={selectedTranslationModelKey}
        isFetchingModels={
          geminiModelsState.isFetching ||
          geminiAvailabilityState.isFetching ||
          ollamaModelsState.isFetching ||
          ollamaAvailabilityState.isFetching
        }
        isSaving={isSaving}
        onConfirm={() => {
          if (selectedTranslationModel === null) return

          setIsTranslationModelDialogOpen(false)
          persistAiDraft({
            translation: {
              provider: selectedTranslationModel.provider,
              baseUrl: selectedTranslationModel.baseUrl,
              apiKeySecretRef:
                selectedTranslationModel.provider === "gemini"
                  ? (aiDraft.providers?.gemini?.apiKeySecretRef ?? aiDraft.translation.apiKeySecretRef)
                  : null,
              model: selectedTranslationModel.model,
            },
          })
        }}
        onOpenChange={setIsTranslationModelDialogOpen}
        onSelectedModelKeyChange={setSelectedTranslationModelKey}
      />
    </BaseLayout>
  )
}

function LoadingConfiguration() {
  return (
    <Card>
      <CardContent className="grid gap-6 p-5 lg:grid-cols-[1fr_20rem] lg:p-6">
        <div className="grid gap-4 md:grid-cols-[10rem_1fr] md:items-center">
          <div className="flex h-36 items-center justify-center rounded-md border bg-muted/40 text-muted-foreground">
            <RefreshCw className="size-12" />
          </div>
          <div className="space-y-4">
            <div>
              <h2 className="text-2xl font-semibold">Checking AI configuration</h2>
              <p className="text-sm text-muted-foreground">Verifying providers and loading available models.</p>
            </div>
            <div className="space-y-2 text-sm text-muted-foreground">
              <LoadingStep label="Verifying AI providers" />
              <LoadingStep label="Loading available models" />
              <LoadingStep label="Preparing AI settings" />
            </div>
          </div>
        </div>
        <div className="space-y-3">
          <Skeleton className="h-3 w-44" />
          <Skeleton className="h-3 w-64" />
          <Skeleton className="h-3 w-52" />
        </div>
      </CardContent>
    </Card>
  )
}

function LoadingStep({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="size-1.5 rounded-full bg-primary" />
      <span>{label}</span>
    </div>
  )
}

function ErrorCard({
  actionLabel,
  description,
  onAction,
  title,
}: {
  title: string
  description: string
  actionLabel: string
  onAction: () => void
}) {
  return (
    <Card className="border-destructive/30">
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </div>
        <Button variant="outline" size="sm" onClick={onAction}>
          <RefreshCw className="size-4" />
          {actionLabel}
        </Button>
      </CardHeader>
    </Card>
  )
}

function AiStateHero({
  expandedProvider,
  healthyProviderCount,
  isSaving,
  onChooseSearchEngine,
  onDisableAi,
  onEnableAi,
  onExpandedProviderChange,
  onToggleProviderDetails,
  providers,
  searchEngineCount,
  showProviderDetails,
  state,
}: {
  state: AiSetupState
  providers: ProviderSummary[]
  healthyProviderCount: number
  isSaving: boolean
  searchEngineCount: number
  showProviderDetails: boolean
  expandedProvider: AdminAiProviderKind | null
  onChooseSearchEngine: () => void
  onDisableAi: () => void
  onEnableAi: () => void
  onExpandedProviderChange: (provider: AdminAiProviderKind | null) => void
  onToggleProviderDetails: () => void
}) {
  const content = getHeroContent(state)
  const isEnabled = state === "enabled"
  const providerSummary = `${healthyProviderCount.toLocaleString()} healthy provider${healthyProviderCount === 1 ? "" : "s"}`

  return (
    <Card className={content.className}>
      <CardContent className="space-y-5 p-5">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <HeroStatusIcon state={state} />
              <h2 className="text-2xl font-semibold">{content.title}</h2>
              <Badge variant={content.badgeVariant}>{content.badge}</Badge>
            </div>
            <p className="max-w-2xl text-sm text-muted-foreground">{content.description}</p>
          </div>
          <div className="flex flex-wrap items-center justify-start gap-2 border-t pt-3 lg:justify-end lg:border-l lg:border-t-0 lg:pl-5 lg:pt-0">
            <Button variant="ghost" className="gap-3 px-0 lg:px-3" onClick={onToggleProviderDetails}>
              <HealthDot healthy={healthyProviderCount > 0} />
              {providerSummary}
              <ChevronRight className={cn("size-4 transition-transform", showProviderDetails && "rotate-90")} />
            </Button>
            {state === "needs_configuration" && searchEngineCount > 0 ? (
              <Button size="sm" onClick={onChooseSearchEngine}>
                <Search className="size-4" />
                Choose embedding model
              </Button>
            ) : null}
            {state === "needs_configuration" && searchEngineCount === 0 ? (
              <span className="text-sm font-medium text-muted-foreground">No embedding models available</span>
            ) : null}
            {state === "ready" ? (
              <Button size="sm" disabled={isSaving} onClick={onEnableAi}>
                <Power className="size-4" />
                {isSaving ? "Enabling..." : "Enable AI"}
              </Button>
            ) : null}
            {isEnabled ? (
              <Button size="sm" variant="outline" disabled={isSaving} onClick={onDisableAi}>
                <Power className="size-4" />
                {isSaving ? "Disabling..." : "Disable AI"}
              </Button>
            ) : null}
          </div>
        </div>
        {showProviderDetails ? (
          <ProviderDetailsPanel
            expandedProvider={expandedProvider}
            providers={providers}
            onExpandedProviderChange={onExpandedProviderChange}
          />
        ) : null}
      </CardContent>
    </Card>
  )
}

function AiUnconfiguredState() {
  return (
    <Card>
      <CardContent className="flex min-h-[32rem] flex-col items-center justify-center gap-7 p-8 text-center">
        <div className="flex size-28 items-center justify-center rounded-md border bg-muted/40 text-muted-foreground">
          <Sparkles className="size-14" />
        </div>
        <div className="max-w-2xl space-y-3">
          <h2 className="text-4xl font-semibold tracking-tight">AI is not configured</h2>
          <p className="text-lg leading-8 text-muted-foreground">
            Arkivra works without AI. Configure a provider when you want features like AI search, document chat,
            and translation.
          </p>
        </div>
        <div className="w-full max-w-2xl rounded-md border border-primary/20 bg-primary/5 p-4 text-left">
          <div className="flex gap-3">
            <Info className="mt-0.5 size-5 text-primary" />
            <div>
              <div className="font-medium">What you need</div>
              <p className="text-sm text-muted-foreground">
                One supported AI provider configured on the server through environment variables.
              </p>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap justify-center gap-3">
          <ProviderChip icon={<Bot className="size-5" />} label="Ollama" />
          <ProviderChip icon={<Sparkles className="size-5" />} label="Google Gemini" />
        </div>
        <Button asChild>
          <a href="https://docs.arkivra.app" target="_blank" rel="noreferrer">
            <BookOpen className="size-4" />
            View setup guide
            <ExternalLink className="size-4" />
          </a>
        </Button>
      </CardContent>
    </Card>
  )
}

function ProviderChip({ icon, label }: { icon: ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-3 rounded-md border bg-card px-4 py-3 text-sm font-medium shadow-xs">
      {icon}
      {label}
    </div>
  )
}

function HealthIssuesSection({ issues }: { issues: HealthIssue[] }) {
  return (
    <Card className="border-border">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <TriangleAlert className="size-5 text-muted-foreground" />
          Health issues
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {issues.map((issue) => (
          <div
            key={issue.id}
            className={cn("rounded-md border p-3", getHealthIssueClassName(issue.severity))}
          >
            <div className="flex gap-3">
              {issue.severity === "info" ? (
                <Info className="mt-0.5 size-4" />
              ) : (
                <TriangleAlert className="mt-0.5 size-4" />
              )}
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="text-sm font-semibold">{issue.title}</div>
                  <Badge variant="outline" className="capitalize">
                    {issue.severity}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground">{issue.description}</p>
              </div>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}

function CapabilitiesSection({
  chatModelCount,
  chatHealthIssue,
  defaultChatModel,
  embeddingHealthIssue,
  effectiveTranslationModel,
  indexedChunks,
  indexProgress,
  isChatConfigValid,
  isSaving,
  isTranslationConfigValid,
  onConfigureChatModels,
  onConfigureSearchEngine,
  onConfigureTranslation,
  searchEngineModel,
  searchEngineProvider,
  semanticProgressStatus,
  semanticStatus,
  state,
  totalChunks,
  translationHealthIssue,
  translationModelCount,
}: {
  state: AiSetupState
  chatModelCount: number
  chatHealthIssue: HealthIssue | null
  defaultChatModel: string
  embeddingHealthIssue: HealthIssue | null
  effectiveTranslationModel: string
  indexedChunks: number
  indexProgress: number
  isChatConfigValid: boolean
  isSaving: boolean
  isTranslationConfigValid: boolean
  searchEngineModel: string
  searchEngineProvider: AdminAiSettings["embedding"]["provider"]
  semanticProgressStatus: ProgressStatus
  semanticStatus: string
  totalChunks: number
  translationHealthIssue: HealthIssue | null
  translationModelCount: number
  onConfigureChatModels: () => void
  onConfigureSearchEngine: () => void
  onConfigureTranslation: () => void
}) {
  const isEnabled = state === "enabled"
  const blocked = state === "needs_configuration"
  const previewOnly = state === "ready"
  const semanticHealthText = embeddingHealthIssue?.description
  const embeddingModelUnavailable = embeddingHealthIssue?.id === "embedding-model-unavailable"
  const chatHealthText = isEnabled ? chatHealthIssue?.description : undefined
  const translationHealthText = isEnabled ? translationHealthIssue?.description : undefined
  const chatNeedsDefaultModel =
    chatHealthIssue?.id === "default-chat-model-not-selected" ||
    chatHealthIssue?.id === "default-chat-model-unavailable"
  const translationNeedsDefaultModel =
    translationHealthIssue?.id === "default-translation-model-not-selected" ||
    translationHealthIssue?.id === "default-translation-model-unavailable"

  return (
    <Card>
      <CardHeader>
        <CardTitle>{isEnabled ? "AI Services" : "AI Capabilities"}</CardTitle>
        <CardDescription>
          {blocked
            ? "AI features remain unavailable until setup is complete."
            : isEnabled
              ? "Configure AI services for this instance."
              : "Enable AI to make these services available."}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3 lg:grid-cols-3">
        <AiServiceCard
          title="AI Search"
          description="Configure the embedding model used for semantic search and document indexing."
          icon={<Search className="size-5" />}
          status={
            blocked
              ? "AI setup required"
              : semanticHealthText
                ? embeddingModelUnavailable
                  ? "Needs setup"
                  : "Unavailable"
                : isEnabled
                  ? "Ready"
                  : undefined
          }
          statusTone={blocked ? "inactive" : semanticHealthText ? "warning" : "enabled"}
          footer={
            blocked
              ? "Complete AI setup to use this feature"
              : semanticHealthText
                ? semanticHealthText
                : isEnabled
                  ? semanticStatus
                  : "Will become available after AI is enabled."
          }
          previewOnly={previewOnly && !semanticHealthText}
          action={
            isEnabled || embeddingModelUnavailable ? (
              <Button size="sm" variant="outline" disabled={isSaving} onClick={onConfigureSearchEngine}>
                <Settings className="size-4" />
                Configure
              </Button>
            ) : null
          }
        >
          {!blocked ? (
            <div className="space-y-3">
              <ModelSummary
                label="Embedding model"
                model={searchEngineModel || "Not selected"}
                provider={formatProvider(searchEngineProvider)}
                detail={
                  embeddingModelUnavailable ? "Choose another embedding model to restore AI Search." : undefined
                }
              />
              {isEnabled ? (
                <div className="space-y-2">
                  <div className="flex justify-between gap-3 text-xs text-muted-foreground">
                    <span>
                      {indexedChunks.toLocaleString()} of {totalChunks.toLocaleString()} chunks indexed
                    </span>
                    <span>{indexProgress}%</span>
                  </div>
                  <StatusProgress value={indexProgress} status={semanticProgressStatus} />
                </div>
              ) : null}
            </div>
          ) : null}
        </AiServiceCard>

        <AiServiceCard
          title="AI Chat"
          description="Control which chat models users can access and set the default for new conversations."
          icon={<MessageSquare className="size-5" />}
          status={
            blocked
              ? "AI setup required"
              : isEnabled
                ? chatHealthText
                  ? chatNeedsDefaultModel
                    ? "Needs setup"
                    : "Unavailable"
                  : isChatConfigValid
                    ? "Ready"
                    : "Needs setup"
                : undefined
          }
          statusTone={blocked ? "inactive" : chatHealthText || !isChatConfigValid ? "warning" : "enabled"}
          footer={
            blocked
              ? "Complete AI setup to use this feature"
              : isEnabled
                ? (chatHealthText ??
                  (isChatConfigValid ? "Default model configured" : "Select a default chat model."))
                : "Will become available after AI is enabled."
          }
          previewOnly={previewOnly}
          action={
            isEnabled ? (
              <Button
                size="sm"
                variant={isChatConfigValid ? "outline" : "default"}
                disabled={chatModelCount === 0 || isSaving}
                onClick={onConfigureChatModels}
              >
                <Settings className="size-4" />
                Configure
              </Button>
            ) : null
          }
        >
          {!blocked ? (
            <ModelSummary
              label="Default chat model"
              model={defaultChatModel || "Not selected"}
              provider=""
              detail={
                isChatConfigValid
                  ? "Used by default for new conversations."
                  : chatHealthIssue?.id === "default-chat-model-unavailable"
                    ? "Choose another default chat model."
                    : chatHealthText
                    ? "Choose a default chat model."
                    : "Select a default chat model."
              }
            />
          ) : null}
        </AiServiceCard>

        <AiServiceCard
          title="Translation"
          description="Document translation is experimental. Configure the multimodal model used by this feature."
          icon={<Languages className="size-5" />}
          status={
            blocked
              ? "AI setup required"
              : isEnabled
                ? translationHealthText
                  ? translationNeedsDefaultModel
                    ? "Needs setup"
                    : "Unavailable"
                  : isTranslationConfigValid
                    ? "Ready"
                    : "Needs setup"
                : undefined
          }
          statusTone={blocked ? "inactive" : translationHealthText || !isTranslationConfigValid ? "warning" : "enabled"}
          footer={
            blocked
              ? "Complete AI setup to use this feature"
              : isEnabled
                ? (translationHealthText ??
                  (isTranslationConfigValid
                    ? "Default model configured"
                    : "Select a default translation model."))
                : "Will become available after AI is enabled."
          }
          previewOnly={previewOnly}
          action={
            isEnabled ? (
              <Button
                size="sm"
                variant={isTranslationConfigValid ? "outline" : "default"}
                disabled={translationModelCount === 0 || isSaving}
                onClick={onConfigureTranslation}
              >
                <Settings className="size-4" />
                Configure
              </Button>
            ) : null
          }
        >
          {!blocked ? (
            <ModelSummary
              label="Translation model"
              model={effectiveTranslationModel || "Not selected"}
              provider=""
              detail={
                isTranslationConfigValid
                  ? "Used when users translate documents."
                  : translationHealthIssue?.id === "default-translation-model-unavailable"
                    ? "Choose another default translation model."
                    : translationHealthText
                    ? "Choose a default translation model."
                    : "Select the model used for document translation."
              }
            />
          ) : null}
        </AiServiceCard>
      </CardContent>
    </Card>
  )
}

function AiServiceCard({
  action,
  children,
  description,
  footer,
  icon,
  previewOnly = false,
  status,
  statusTone,
  title,
}: {
  title: string
  description: string
  icon: ReactNode
  status?: string
  statusTone: "enabled" | "inactive" | "warning"
  footer: string
  action?: ReactNode
  children?: ReactNode
  previewOnly?: boolean
}) {
  return (
    <div
      className={cn(
        "flex min-h-52 flex-col justify-between gap-4 rounded-md border p-4",
        previewOnly
          ? "bg-muted/40 opacity-80"
          : statusTone === "enabled"
            ? "border-primary/25 bg-primary/5"
            : statusTone === "warning"
              ? "bg-muted/30"
              : "bg-card",
      )}
    >
      <div className="space-y-4">
        <div className="grid grid-cols-[2.75rem_minmax(0,1fr)_auto] items-center gap-3">
          <div
            className={cn(
              "flex size-11 items-center justify-center rounded-md border [&_svg]:size-5",
              statusTone === "enabled" && !previewOnly
                ? "border-primary/20 bg-primary/10 text-primary"
                : "bg-muted/40 text-muted-foreground",
            )}
          >
            {icon}
          </div>
          <div className="truncate text-base font-semibold leading-none">{title}</div>
          {status ? <StatusBadge tone={statusTone}>{status}</StatusBadge> : null}
        </div>
        <p className="text-sm text-muted-foreground">{description}</p>
        {children ? <div className="border-t pt-3">{children}</div> : null}
      </div>
      <div className="flex items-center justify-between gap-3 border-t pt-3">
        <div className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
          {statusTone === "enabled" && !previewOnly ? (
            <CheckCircle2 className="size-4 text-primary" />
          ) : statusTone === "warning" && !previewOnly ? (
            <TriangleAlert className="size-4" />
          ) : (
            <Info className="size-4" />
          )}
          <span className="truncate">{footer}</span>
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
    </div>
  )
}

function ModelSummary({
  detail,
  label,
  model,
  provider,
}: {
  label: string
  model: string
  provider: string
  detail?: string
}) {
  return (
    <div className="space-y-1">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <Package className="size-4 text-muted-foreground" />
        <span className="break-all text-sm font-semibold">{model}</span>
        {provider ? <Badge variant="outline">{provider}</Badge> : null}
      </div>
      {detail ? <div className="text-xs text-muted-foreground">{detail}</div> : null}
    </div>
  )
}

function ProviderDetailsPanel({
  expandedProvider,
  onExpandedProviderChange,
  providers,
}: {
  providers: ProviderSummary[]
  expandedProvider: AdminAiProviderKind | null
  onExpandedProviderChange: (provider: AdminAiProviderKind | null) => void
}) {
  const healthyCount = providers.filter((provider) => provider.isHealthy).length

  return (
    <div className="space-y-4 border-t pt-5 text-card-foreground">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-md border bg-muted/40 text-muted-foreground">
            <Bot className="size-5" />
          </div>
          <div className="min-w-0">
            <div className="text-base font-semibold">Providers</div>
            <p className="text-sm text-muted-foreground">
              Providers are read-only and configured through environment variables.
            </p>
          </div>
        </div>
      </div>
      <div className="flex flex-col justify-between gap-2 border-t pt-4 text-sm text-muted-foreground sm:flex-row">
        <div className="flex items-center gap-2">
          <HealthDot healthy={healthyCount > 0} />
          {healthyCount.toLocaleString()} provider{healthyCount === 1 ? "" : "s"} healthy
        </div>
        <div>Last checked: {formatLastChecked(providers)}</div>
      </div>
      <div className="divide-y rounded-md border bg-card">
        {providers.map((provider) => (
          <ProviderDetail
            key={provider.id}
            expanded={expandedProvider === provider.id}
            provider={provider}
            onToggleExpanded={() =>
              onExpandedProviderChange(expandedProvider === provider.id ? null : provider.id)
            }
          />
        ))}
      </div>
      <div className="flex flex-col gap-3 rounded-md bg-muted/40 p-3 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Info className="size-4 shrink-0" />
          <span>Providers are configured via environment variables and cannot be modified here.</span>
        </div>
        <Button asChild size="sm" variant="ghost" className="justify-start">
          <a href="https://docs.arkivra.app" target="_blank" rel="noreferrer">
            Learn more about AI setup
            <ExternalLink className="size-4" />
          </a>
        </Button>
      </div>
    </div>
  )
}

function ProviderDetail({
  expanded,
  onToggleExpanded,
  provider,
}: {
  provider: ProviderSummary
  expanded: boolean
  onToggleExpanded: () => void
}) {
  return (
    <div>
      <div className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-md border bg-muted/40 text-muted-foreground">
            {provider.id === "gemini" ? <Sparkles className="size-4" /> : <Package className="size-4" />}
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <div className="text-sm font-semibold">{provider.name}</div>
              <StatusBadge tone={provider.tone}>{provider.status}</StatusBadge>
            </div>
            <div className="text-xs text-muted-foreground">{provider.description}</div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3 lg:justify-end">
          <div className="text-sm text-muted-foreground">{provider.modelCount.toLocaleString()} models available</div>
          <div className="text-sm text-muted-foreground">
            {provider.updatedAt ? `Checked ${formatRelativeTime(provider.updatedAt)}` : "Not checked"}
          </div>
          <Button
            size="icon"
            variant="ghost"
            aria-label={`Refresh ${provider.name} provider`}
            disabled={provider.isChecking}
            onClick={provider.onRefresh}
          >
            <RefreshCw className={cn("size-4", provider.isChecking && "animate-spin")} />
          </Button>
          <Button size="sm" variant="outline" onClick={onToggleExpanded}>
            {expanded ? "Hide details" : "View details"}
          </Button>
        </div>
      </div>
      {expanded ? (
        <div className="space-y-3 bg-muted/30 p-4">
          <div className="grid gap-3 lg:grid-cols-2">
            <DetailTile label="Connection status" value={provider.error ?? provider.status} />
            <DetailTile label="Endpoint" value={provider.endpoint || "Configured on the server"} mono />
          </div>
          <div className="rounded-md border bg-card p-3">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="text-sm font-semibold">Available models</div>
              <Badge variant="secondary">{provider.modelCount.toLocaleString()}</Badge>
            </div>
            {provider.models.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {provider.models.map((model) => (
                  <Badge key={model} variant="outline" className="whitespace-normal">
                    {model}
                  </Badge>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No available models were returned by this provider.</p>
            )}
          </div>
        </div>
      ) : null}
    </div>
  )
}

function DetailTile({ label, mono = false, value }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="min-w-0 rounded-md border bg-card p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={cn("break-words text-sm", mono && "font-mono")}>{value}</div>
    </div>
  )
}

function ChatModelsDialog({
  open,
  chatModelOptions,
  draftAllowedChatModels,
  draftDefaultChatModel,
  isFetchingChatModels,
  isSaving,
  onAllowedModelChange,
  onDefaultModelChange,
  onOpenChange,
  onSave,
}: {
  open: boolean
  chatModelOptions: ChatModelOption[]
  draftAllowedChatModels: string[]
  draftDefaultChatModel: string
  isFetchingChatModels: boolean
  isSaving: boolean
  onAllowedModelChange: (model: string, checked: boolean) => void
  onDefaultModelChange: (model: string) => void
  onOpenChange: (open: boolean) => void
  onSave: () => void
}) {
  const [searchQuery, setSearchQuery] = useState("")
  const [providerFilter, setProviderFilter] = useState("all")
  const [visibilityFilter, setVisibilityFilter] = useState("all")
  const allowedModelSet = useMemo(() => new Set(draftAllowedChatModels), [draftAllowedChatModels])
  const providerOptions = useModelProviderOptions(chatModelOptions)
  const filteredChatModelOptions = useMemo(
    () =>
      chatModelOptions.filter((option) =>
        matchesModelFilters({
          baseUrl: option.baseUrl,
          isSelected: allowedModelSet.has(option.value),
          model: option.label,
          provider: option.provider,
          providerFilter,
          providerLabel: option.providerLabel,
          searchQuery,
          visibilityFilter,
        }),
      ),
    [allowedModelSet, chatModelOptions, providerFilter, searchQuery, visibilityFilter],
  )
  const isDefaultEnabled = draftDefaultChatModel.length > 0 && allowedModelSet.has(draftDefaultChatModel)
  const isEmpty = chatModelOptions.length === 0
  const hasFilteredResults = filteredChatModelOptions.length > 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100vh-2rem)] overflow-hidden p-0 sm:max-w-4xl">
        <DialogHeader className="border-b px-6 py-5">
          <DialogTitle className="flex items-center gap-2">
            <MessageSquare className="size-5" />
            Configure chat models
          </DialogTitle>
          <DialogDescription>
            Choose which chat models users can access in chat and select the default for new conversations.
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-[calc(100vh-13rem)] overflow-y-auto px-6 py-4">
          <div className="space-y-4">
            <div className="grid gap-3 md:grid-cols-[14rem_12rem_minmax(0,1fr)] md:items-end">
              <div className="space-y-1.5">
                <Label>Provider</Label>
                <Select value={providerFilter} onValueChange={setProviderFilter}>
                  <SelectTrigger className="w-full data-[size=default]:h-10">
                    <SelectValue placeholder="All Providers" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Providers</SelectItem>
                    {providerOptions.map(([provider, label]) => (
                      <SelectItem key={provider} value={provider}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Show</Label>
                <Select value={visibilityFilter} onValueChange={setVisibilityFilter}>
                  <SelectTrigger className="w-full data-[size=default]:h-10">
                    <SelectValue placeholder="All models" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All models</SelectItem>
                    <SelectItem value="enabled">Enabled only</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5 [&_input]:h-10">
                <div className="flex items-center justify-between gap-3">
                  <Label htmlFor="chat-model-search">Search</Label>
                  <span className="text-xs text-muted-foreground">
                    {filteredChatModelOptions.length.toLocaleString()} {filteredChatModelOptions.length === 1 ? "model" : "models"}
                  </span>
                </div>
                <EmbeddingModelSearch id="chat-model-search" searchQuery={searchQuery} onSearchQueryChange={setSearchQuery} />
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
              <span>Enable the models users can choose, then select one default for new conversations.</span>
              <Badge variant="secondary">{draftAllowedChatModels.length.toLocaleString()} enabled</Badge>
            </div>

            {isEmpty ? (
              <EmptyState
                message={
                  isFetchingChatModels
                    ? "Loading available models and provider status..."
                    : "No chat models are selectable from healthy providers."
                }
              />
            ) : !hasFilteredResults ? (
              <EmptyState message="No models match the current filters." />
            ) : (
              <ChatModelTable
                allowedModels={allowedModelSet}
                defaultModel={draftDefaultChatModel}
                options={filteredChatModelOptions}
                onAllowedChange={onAllowedModelChange}
                onDefault={onDefaultModelChange}
              />
            )}
          </div>
        </div>
        <DialogFooter className="items-center border-t px-6 py-4 sm:justify-between">
          <div className={cn("flex items-center gap-2 text-sm", isDefaultEnabled ? "text-muted-foreground" : "text-foreground")}>
            {isDefaultEnabled ? <CheckCircle2 className="size-4 text-primary" /> : <TriangleAlert className="size-4" />}
            <span>
              {isDefaultEnabled
                ? `Default: ${getChatModelLabel(chatModelOptions, draftDefaultChatModel)}`
                : "Select a default model to save"}
            </span>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button disabled={!isDefaultEnabled || isSaving} onClick={onSave}>
              {isSaving ? "Saving..." : "Save chat models"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function EmbeddingModelDialog({
  open,
  aiDraft,
  embeddingModelOptions,
  selectedEmbeddingModel,
  selectedEmbeddingModelChanged,
  selectedEmbeddingModelKey,
  isFetchingModels,
  isSaving,
  onConfirm,
  onOpenChange,
  onSelectedModelKeyChange,
}: {
  open: boolean
  aiDraft: AdminAiSettings
  embeddingModelOptions: EmbeddingModelOption[]
  selectedEmbeddingModel: EmbeddingModelOption | null
  selectedEmbeddingModelChanged: boolean
  selectedEmbeddingModelKey: string
  isFetchingModels: boolean
  isSaving: boolean
  onConfirm: () => void
  onOpenChange: (open: boolean) => void
  onSelectedModelKeyChange: (key: string) => void
}) {
  const [searchQuery, setSearchQuery] = useState("")
  const [providerFilter, setProviderFilter] = useState("all")
  const [visibilityFilter, setVisibilityFilter] = useState("all")
  const hasConfiguredSearchEngine = aiDraft.embedding.provider !== null && aiDraft.embedding.model !== null
  const providerOptions = useModelProviderOptions(embeddingModelOptions)
  const filteredOptions = useMemo(
    () =>
      embeddingModelOptions.filter((option) =>
        matchesModelFilters({
          baseUrl: option.baseUrl,
          isSelected: option.key === selectedEmbeddingModelKey,
          model: option.model,
          provider: option.provider,
          providerFilter,
          providerLabel: option.providerLabel,
          searchQuery,
          visibilityFilter,
        }),
      ),
    [embeddingModelOptions, providerFilter, searchQuery, selectedEmbeddingModelKey, visibilityFilter],
  )
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100vh-2rem)] overflow-hidden p-0 sm:max-w-2xl">
        <DialogHeader className="border-b px-6 py-5">
          <DialogTitle className="flex items-center gap-2">
            <Layers3 className="size-5" />
            Select an embedding model
          </DialogTitle>
          <DialogDescription>
            This model is the retrieval engine behind AI features, helping Arkivra find relevant content across your documents.
          </DialogDescription>
        </DialogHeader>
        <EmbeddingModelSelectionBody
          emptyMessage={
            isFetchingModels
              ? "Loading available models and provider status..."
              : "No embedding models are selectable from a configured provider."
          }
          filterProps={{
            providerFilter,
            providerOptions,
            searchQuery,
            visibilityFilter,
            onProviderFilterChange: setProviderFilter,
            onSearchQueryChange: setSearchQuery,
            onVisibilityFilterChange: setVisibilityFilter,
          }}
          filteredCount={filteredOptions.length}
          hasOptions={embeddingModelOptions.length > 0}
          options={filteredOptions}
          selectedEmbeddingModelKey={selectedEmbeddingModelKey}
          onSelectedModelKeyChange={onSelectedModelKeyChange}
        />
        <DialogFooter className="items-center border-t px-6 py-4 sm:justify-end">
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              disabled={
                selectedEmbeddingModel === null ||
                !selectedEmbeddingModelChanged ||
                !selectedEmbeddingModel.isDiscovered ||
                isSaving
              }
              onClick={onConfirm}
            >
              {isSaving
                ? "Saving..."
                : hasConfiguredSearchEngine
                  ? "Save and rebuild search index"
                  : "Save selection"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function EmbeddingModelSelectionBody({
  emptyMessage,
  filterProps,
  filteredCount,
  hasOptions,
  onSelectedModelKeyChange,
  options,
  selectedEmbeddingModelKey,
}: {
  emptyMessage: string
  filterProps: ModelFiltersProps
  filteredCount: number
  hasOptions: boolean
  options: EmbeddingModelOption[]
  selectedEmbeddingModelKey: string
  onSelectedModelKeyChange: (key: string) => void
}) {
  return (
    <div className="max-h-[calc(100vh-13rem)] overflow-y-auto px-6 py-3">
      <div className="space-y-3">
        <div className="grid gap-3 md:grid-cols-[14rem_minmax(0,1fr)] md:items-end">
          <EmbeddingModelFilters {...filterProps} compact showVisibilityFilter={false} />
          <div className="space-y-1.5 [&_input]:h-10">
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor="embedding-model-search">Search</Label>
              <span className="text-xs text-muted-foreground">
                {filteredCount.toLocaleString()} {filteredCount === 1 ? "model" : "models"}
              </span>
            </div>
            <EmbeddingModelSearch
              searchQuery={filterProps.searchQuery}
              onSearchQueryChange={filterProps.onSearchQueryChange}
            />
          </div>
        </div>
        {!hasOptions ? (
          <EmptyState message={emptyMessage} />
        ) : filteredCount === 0 ? (
          <EmptyState message="No models match the current filters." />
        ) : (
          <EmbeddingModelTable
            options={options}
            selectedEmbeddingModelKey={selectedEmbeddingModelKey}
            onSelectedModelKeyChange={onSelectedModelKeyChange}
          />
        )}
        <InfoNotice>Changing this model rebuilds the semantic search index for your documents.</InfoNotice>
      </div>
    </div>
  )
}

function TranslationModelDialog({
  open,
  translationModelOptions,
  selectedTranslationModel,
  selectedTranslationModelChanged,
  selectedTranslationModelKey,
  isFetchingModels,
  isSaving,
  onConfirm,
  onOpenChange,
  onSelectedModelKeyChange,
}: {
  open: boolean
  translationModelOptions: TranslationModelOption[]
  selectedTranslationModel: TranslationModelOption | null
  selectedTranslationModelChanged: boolean
  selectedTranslationModelKey: string
  isFetchingModels: boolean
  isSaving: boolean
  onConfirm: () => void
  onOpenChange: (open: boolean) => void
  onSelectedModelKeyChange: (key: string) => void
}) {
  const [searchQuery, setSearchQuery] = useState("")
  const [providerFilter, setProviderFilter] = useState("all")
  const [visibilityFilter, setVisibilityFilter] = useState("all")
  const providerOptions = useModelProviderOptions(translationModelOptions)
  const filteredOptions = useMemo(
    () =>
      translationModelOptions.filter((option) =>
        matchesModelFilters({
          baseUrl: option.baseUrl,
          isSelected: option.key === selectedTranslationModelKey,
          model: option.label,
          provider: option.provider,
          providerFilter,
          providerLabel: option.providerLabel,
          searchQuery,
          visibilityFilter,
        }),
      ),
    [providerFilter, searchQuery, selectedTranslationModelKey, translationModelOptions, visibilityFilter],
  )
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100vh-2rem)] overflow-hidden p-0 sm:max-w-2xl">
        <DialogHeader className="border-b px-6 py-5">
          <DialogTitle className="flex items-center gap-2">
            <Languages className="size-5" />
            Configure translation model
          </DialogTitle>
          <DialogDescription>
            Choose the multimodal model used for document translation. Only one translation model can be active.
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-[calc(100vh-13rem)] overflow-y-auto px-6 py-3">
          <div className="space-y-3">
            <div className="grid gap-3 md:grid-cols-[14rem_minmax(0,1fr)] md:items-end">
              <EmbeddingModelFilters
                compact
                showVisibilityFilter={false}
                providerFilter={providerFilter}
                providerOptions={providerOptions}
                searchQuery={searchQuery}
                visibilityFilter={visibilityFilter}
                onProviderFilterChange={setProviderFilter}
                onSearchQueryChange={setSearchQuery}
                onVisibilityFilterChange={setVisibilityFilter}
              />
              <div className="space-y-1.5 [&_input]:h-10">
                <div className="flex items-center justify-between gap-3">
                  <Label htmlFor="translation-model-search">Search</Label>
                  <span className="text-xs text-muted-foreground">
                    {filteredOptions.length.toLocaleString()} {filteredOptions.length === 1 ? "model" : "models"}
                  </span>
                </div>
                <EmbeddingModelSearch
                  id="translation-model-search"
                  searchQuery={searchQuery}
                  onSearchQueryChange={setSearchQuery}
                />
              </div>
            </div>
            {!translationModelOptions.length ? (
              <EmptyState
                message={
                  isFetchingModels
                    ? "Loading available models and provider status..."
                    : "No translation models are selectable from healthy providers."
                }
              />
            ) : filteredOptions.length === 0 ? (
              <EmptyState message="No models match the current filters." />
            ) : (
              <TranslationModelTable
                options={filteredOptions}
                selectedTranslationModelKey={selectedTranslationModelKey}
                onSelectedModelKeyChange={onSelectedModelKeyChange}
              />
            )}
            <InfoNotice>
              Translation uses a multimodal model so Arkivra can process rendered pages and selected visual regions.
            </InfoNotice>
          </div>
        </div>
        <DialogFooter className="items-center border-t px-6 py-4 sm:justify-end">
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button disabled={selectedTranslationModel === null || !selectedTranslationModelChanged || isSaving} onClick={onConfirm}>
              {isSaving ? "Saving..." : "Save translation model"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

interface ModelFiltersProps {
  providerFilter: string
  providerOptions: Array<[string, string]>
  searchQuery: string
  visibilityFilter: string
  onProviderFilterChange: (value: string) => void
  onSearchQueryChange: (value: string) => void
  onVisibilityFilterChange: (value: string) => void
}

function EmbeddingModelFilters({
  compact = false,
  onProviderFilterChange,
  onVisibilityFilterChange,
  providerFilter,
  providerOptions,
  visibilityFilter,
  showVisibilityFilter = true,
  visibilityItems = [
    ["all", "All models"],
    ["selected", "Selected model"],
  ],
}: ModelFiltersProps & { compact?: boolean; showVisibilityFilter?: boolean; visibilityItems?: Array<[string, string]> }) {
  return (
    <div className={cn("grid gap-4", showVisibilityFilter && "md:grid-cols-2")}>
      <div className={cn(compact ? "space-y-1.5" : "space-y-2")}>
        <Label>Provider</Label>
        <Select value={providerFilter} onValueChange={onProviderFilterChange}>
          <SelectTrigger className={cn("w-full", compact ? "data-[size=default]:h-10" : "data-[size=default]:h-12")}>
            <SelectValue placeholder="All Providers" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Providers</SelectItem>
            {providerOptions.map(([provider, label]) => (
              <SelectItem key={provider} value={provider}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {showVisibilityFilter ? (
        <div className="space-y-2">
          <Label>Show</Label>
          <Select value={visibilityFilter} onValueChange={onVisibilityFilterChange}>
            <SelectTrigger className="w-full data-[size=default]:h-12">
              <SelectValue placeholder="All models" />
            </SelectTrigger>
            <SelectContent>
              {visibilityItems.map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}
    </div>
  )
}

function EmbeddingModelSearch({
  id = "embedding-model-search",
  onSearchQueryChange,
  searchQuery,
}: {
  id?: string
  searchQuery: string
  onSearchQueryChange: (query: string) => void
}) {
  return (
    <div className="relative">
      <Search className="text-muted-foreground absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" />
      <Input
        type="text"
        id={id}
        value={searchQuery}
        className="cursor-text pl-9"
        placeholder="Search models..."
        onChange={(event) => onSearchQueryChange(event.currentTarget.value)}
      />
    </div>
  )
}

function ChatModelTable({
  allowedModels,
  defaultModel = "",
  onAllowedChange,
  onDefault,
  options,
}: {
  allowedModels: Set<string>
  defaultModel?: string
  options: ChatModelOption[]
  onAllowedChange: (model: string, checked: boolean) => void
  onDefault?: (model: string) => void
}) {
  return (
    <div className="max-h-[24rem] overflow-auto rounded-md border bg-card [&_[data-slot=table-container]]:overflow-visible">
      <Table className="table-fixed">
        <TableHeader>
          <TableRow>
            <TableHead className="sticky top-0 z-10 bg-card">Model</TableHead>
            <TableHead className="sticky top-0 z-10 hidden w-44 bg-card md:table-cell">Provider</TableHead>
            <TableHead className="sticky top-0 z-10 w-20 bg-card text-right">Access</TableHead>
            <TableHead className="sticky top-0 z-10 hidden w-36 bg-card text-right sm:table-cell">Default</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {options.map((option) => {
            const isDefault = option.value === defaultModel
            const isEnabled = allowedModels.has(option.value)

            return (
              <TableRow key={option.value} data-state={isDefault ? "selected" : undefined}>
                <TableCell className="min-w-0 py-4">
                  <div className="min-w-0">
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <span className="truncate text-sm font-semibold">{option.label}</span>
                    </div>
                    <div className="truncate text-xs text-muted-foreground md:hidden">
                      {option.providerLabel}
                    </div>
                    <div className="mt-2 sm:hidden">
                      {isDefault ? (
                        <Badge>
                          <CheckCircle2 className="size-3" />
                          Default
                        </Badge>
                      ) : (
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={!isEnabled}
                          onClick={() => onDefault?.(option.value)}
                        >
                          Set default
                        </Button>
                      )}
                    </div>
                  </div>
                </TableCell>
                <TableCell className="hidden py-4 text-muted-foreground md:table-cell">
                  {option.providerLabel}
                </TableCell>
                <TableCell className="py-4 text-right">
                  <div className="flex justify-end">
                    <Switch
                      checked={isEnabled}
                      disabled={isDefault}
                      aria-label={`${isEnabled ? "Disable" : "Enable"} ${option.label}`}
                      onCheckedChange={(checked) => onAllowedChange(option.value, checked)}
                    />
                  </div>
                </TableCell>
                <TableCell className="hidden py-4 text-right sm:table-cell">
                  {isDefault ? (
                    <Badge>
                      <CheckCircle2 className="size-3" />
                      Default
                    </Badge>
                  ) : (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={!isEnabled}
                      onClick={() => onDefault?.(option.value)}
                    >
                      Set default
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}

function EmbeddingModelTable({
  onSelectedModelKeyChange,
  options,
  selectedEmbeddingModelKey,
}: {
  options: EmbeddingModelOption[]
  selectedEmbeddingModelKey: string
  onSelectedModelKeyChange: (key: string) => void
}) {
  return (
    <RadioGroup value={selectedEmbeddingModelKey} onValueChange={onSelectedModelKeyChange}>
      <div className="max-h-[18rem] overflow-auto rounded-md border bg-card [&_[data-slot=table-container]]:overflow-visible">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="sticky top-0 z-10 w-12 bg-card" />
              <TableHead className="sticky top-0 z-10 bg-card">Model</TableHead>
              <TableHead className="sticky top-0 z-10 hidden w-44 bg-card md:table-cell">Provider</TableHead>
              <TableHead className="sticky top-0 z-10 hidden w-36 bg-card lg:table-cell">Dimensions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {options.map((option) => {
              const isSelected = option.key === selectedEmbeddingModelKey
              const canSelect = option.isDiscovered

              return (
                <TableRow
                  key={option.key}
                  data-state={isSelected ? "selected" : undefined}
                  className={cn(canSelect && "cursor-pointer", !canSelect && "opacity-70")}
                  onClick={() => {
                    if (canSelect) onSelectedModelKeyChange(option.key)
                  }}
                >
                  <TableCell>
                    <RadioGroupItem
                      value={option.key}
                      disabled={!canSelect}
                      aria-label={`Select ${option.model}`}
                      onClick={(event) => event.stopPropagation()}
                    />
                  </TableCell>
                  <TableCell className="min-w-0 py-4">
                    <div className="min-w-0">
                      <div className="flex min-w-0 flex-wrap items-center gap-2">
                        <span className="truncate text-sm font-semibold">{option.model}</span>
                        {isSelected ? <Badge className="shrink-0">Selected</Badge> : null}
                      </div>
                      <div className="truncate text-xs text-muted-foreground md:hidden">
                        {option.providerLabel} -{" "}
                        {option.dimensions !== null ? formatDimensions(option.dimensions) : "Unknown dims"}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="hidden py-4 text-muted-foreground md:table-cell">
                    {option.providerLabel}
                  </TableCell>
                  <TableCell className="hidden py-4 text-muted-foreground lg:table-cell">
                    {option.dimensions !== null ? formatDimensions(option.dimensions) : "Unknown dims"}
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>
    </RadioGroup>
  )
}

function TranslationModelTable({
  onSelectedModelKeyChange,
  options,
  selectedTranslationModelKey,
}: {
  options: TranslationModelOption[]
  selectedTranslationModelKey: string
  onSelectedModelKeyChange: (key: string) => void
}) {
  return (
    <RadioGroup value={selectedTranslationModelKey} onValueChange={onSelectedModelKeyChange}>
      <div className="max-h-[18rem] overflow-auto rounded-md border bg-card [&_[data-slot=table-container]]:overflow-visible">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="sticky top-0 z-10 w-12 bg-card" />
              <TableHead className="sticky top-0 z-10 bg-card">Model</TableHead>
              <TableHead className="sticky top-0 z-10 hidden w-44 bg-card md:table-cell">Provider</TableHead>
              <TableHead className="sticky top-0 z-10 hidden w-36 bg-card lg:table-cell">Capability</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {options.map((option) => {
              const isSelected = option.key === selectedTranslationModelKey

              return (
                <TableRow
                  key={option.key}
                  data-state={isSelected ? "selected" : undefined}
                  className="cursor-pointer"
                  onClick={() => onSelectedModelKeyChange(option.key)}
                >
                  <TableCell>
                    <RadioGroupItem
                      value={option.key}
                      aria-label={`Select ${option.label}`}
                      onClick={(event) => event.stopPropagation()}
                    />
                  </TableCell>
                  <TableCell className="min-w-0 py-4">
                    <div className="min-w-0">
                      <div className="flex min-w-0 flex-wrap items-center gap-2">
                        <span className="truncate text-sm font-semibold">{option.label}</span>
                        {isSelected ? <Badge className="shrink-0">Selected</Badge> : null}
                      </div>
                      <div className="truncate text-xs text-muted-foreground md:hidden">
                        {option.providerLabel} - Multimodal
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="hidden py-4 text-muted-foreground md:table-cell">
                    {option.providerLabel}
                  </TableCell>
                  <TableCell className="hidden py-4 text-muted-foreground lg:table-cell">
                    Multimodal
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>
    </RadioGroup>
  )
}

function InfoNotice({ children }: { children: ReactNode }) {
  return (
    <div className="mt-auto flex gap-3 rounded-md border bg-card p-3 text-sm text-muted-foreground">
      <Info className="mt-0.5 size-5 shrink-0 text-primary" />
      <div>{children}</div>
    </div>
  )
}

function EmptyState({ message }: { message: string }) {
  return <div className="rounded-md border bg-card p-4 text-sm text-muted-foreground">{message}</div>
}

function StatusProgress({ value, status }: { value: number; status: ProgressStatus }) {
  return (
    <Progress
      value={value}
      className={cn(
        status === "failed" && "[&_[data-slot=progress-indicator]]:bg-destructive",
        status === "paused" && "[&_[data-slot=progress-indicator]]:bg-muted-foreground",
      )}
    />
  )
}

function HealthDot({ healthy }: { healthy: boolean }) {
  return <span className={cn("size-2 rounded-full", healthy ? "bg-primary" : "bg-muted-foreground")} />
}

function StatusBadge({
  children,
  tone,
}: {
  children: ReactNode
  tone: "enabled" | "inactive" | "warning"
}) {
  return (
    <Badge
      variant={tone === "enabled" ? "secondary" : "outline"}
      className={cn(
        "h-6 px-2.5",
        tone === "enabled" && "border-primary/20 bg-primary/10 text-foreground",
        tone === "warning" && "border-border bg-muted text-muted-foreground",
      )}
    >
      {children}
    </Badge>
  )
}

function HeroStatusIcon({ state }: { state: AiSetupState }) {
  return (
    <span
      className={cn(
        "flex size-8 items-center justify-center rounded-full",
        state === "enabled" && "bg-primary text-primary-foreground",
        state === "ready" && "bg-secondary text-secondary-foreground",
        (state === "needs_configuration" || state === "no_providers") && "bg-muted text-muted-foreground",
      )}
      aria-hidden="true"
    >
      {state === "needs_configuration" ? (
        <TriangleAlert className="size-5" />
      ) : state === "no_providers" ? (
        <Package className="size-5" />
      ) : (
        <CheckCircle2 className="size-5" />
      )}
    </span>
  )
}

function getHeroContent(state: AiSetupState): {
  title: string
  badge: string
  description: string
  badgeVariant: "default" | "secondary" | "destructive" | "outline"
  className: string
} {
  if (state === "no_providers") {
    return {
      title: "No AI providers",
      badge: "Unavailable",
      description: "Configure an AI provider before setting up AI features.",
      badgeVariant: "outline",
      className: "border-border bg-muted/50",
    }
  }

  if (state === "needs_configuration") {
    return {
      title: "AI needs setup",
      badge: "Needs setup",
      description: "Choose an embedding model that powers AI search before enabling AI.",
      badgeVariant: "outline",
      className: "border-border bg-muted/50",
    }
  }

  if (state === "ready") {
    return {
      title: "AI is ready",
      badge: "Ready",
      description: "Setup is complete. Enable AI to start indexing your documents and make AI features available.",
      badgeVariant: "secondary",
      className: "border-primary/30 bg-primary/5",
    }
  }

  return {
    title: "AI is enabled",
    badge: "Enabled",
    description: "Configure the AI services below.",
    badgeVariant: "default",
    className: "border-primary/40 bg-primary/10 shadow-sm",
  }
}

function getHealthIssueClassName(severity: HealthSeverity) {
  if (severity === "critical") return "border-destructive/30 bg-destructive/5"
  if (severity === "warning") return "border-border bg-muted/50"
  return "border-primary/30 bg-primary/5"
}

function useModelProviderOptions<TOption extends { provider: string; providerLabel: string }>(options: TOption[]) {
  return useMemo(
    () =>
      Array.from(
        options.reduce((providers, option) => {
          providers.set(option.provider, option.providerLabel)
          return providers
        }, new Map<string, string>()),
      ).sort((left, right) => left[1].localeCompare(right[1])),
    [options],
  )
}

function matchesModelFilters({
  baseUrl,
  isSelected,
  model,
  provider,
  providerFilter,
  providerLabel,
  searchQuery,
  visibilityFilter,
}: {
  baseUrl: string
  isSelected: boolean
  model: string
  provider: string
  providerFilter: string
  providerLabel: string
  searchQuery: string
  visibilityFilter: string
}) {
  const normalizedSearch = searchQuery.trim().toLowerCase()
  const matchesSearch =
    normalizedSearch.length === 0 ||
    model.toLowerCase().includes(normalizedSearch) ||
    providerLabel.toLowerCase().includes(normalizedSearch) ||
    baseUrl.toLowerCase().includes(normalizedSearch)
  const matchesProvider = providerFilter === "all" || provider === providerFilter
  const matchesVisibility = visibilityFilter === "all" || isSelected

  return matchesSearch && matchesProvider && matchesVisibility
}

function getChatModelLabel(options: ChatModelOption[], value: string) {
  return options.find((option) => option.value === value)?.label ?? value
}

function formatDimensions(dimensions: number | null | undefined) {
  return dimensions === null || dimensions === undefined ? "Unknown dims" : `${dimensions.toLocaleString()} dims`
}

function formatRelativeTime(timestamp: number) {
  const elapsedMs = Date.now() - timestamp
  const minutes = Math.max(1, Math.round(elapsedMs / 60_000))

  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`

  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`

  const days = Math.round(hours / 24)
  return `${days} day${days === 1 ? "" : "s"} ago`
}

function formatLastChecked(providers: ProviderSummary[]) {
  const latest = Math.max(...providers.map((provider) => provider.updatedAt))
  if (!Number.isFinite(latest) || latest <= 0) return "not checked"
  return formatRelativeTime(latest)
}

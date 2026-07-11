import { fetchJson } from "@/lib/api"
import type { ModelOption } from "@/app/chat/components/assistant-ui/model-selector"

export interface ChatModelOptions {
  defaultModel: string
  models: string[]
}

export interface ChatModelOptionsResponse {
  options: ChatModelOptions
}

const CHAT_MODEL_OPTIONS_CACHE_KEY = "arkivra.chat.model-options.v1"
const CHAT_MODEL_OPTIONS_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000

interface CachedChatModelOptions {
  cachedAt: number
  value: ChatModelOptionsResponse
}

let memoryCache: CachedChatModelOptions | undefined
let refreshPromise: Promise<ChatModelOptionsResponse> | undefined
let cacheGeneration = 0

function isChatModelOptionsResponse(value: unknown): value is ChatModelOptionsResponse {
  if (!value || typeof value !== "object") return false
  const options = (value as { options?: unknown }).options
  if (!options || typeof options !== "object") return false
  const candidate = options as { defaultModel?: unknown; models?: unknown }
  return (
    typeof candidate.defaultModel === "string" &&
    Array.isArray(candidate.models) &&
    candidate.models.every((model) => typeof model === "string")
  )
}

function readPersistedCache() {
  if (typeof window === "undefined") return undefined

  try {
    const raw = window.localStorage.getItem(CHAT_MODEL_OPTIONS_CACHE_KEY)
    if (!raw) return undefined
    const cached = JSON.parse(raw) as Partial<CachedChatModelOptions>
    if (
      typeof cached.cachedAt !== "number" ||
      Date.now() - cached.cachedAt > CHAT_MODEL_OPTIONS_MAX_AGE_MS ||
      !isChatModelOptionsResponse(cached.value)
    ) {
      window.localStorage.removeItem(CHAT_MODEL_OPTIONS_CACHE_KEY)
      return undefined
    }
    return cached as CachedChatModelOptions
  } catch {
    return undefined
  }
}

export function getCachedChatModelOptions() {
  memoryCache ??= readPersistedCache()
  return memoryCache?.value
}

export function invalidateChatModelOptionsCache() {
  cacheGeneration += 1
  memoryCache = undefined
  refreshPromise = undefined

  try {
    window.localStorage.removeItem(CHAT_MODEL_OPTIONS_CACHE_KEY)
  } catch {
    // The in-memory cache has still been invalidated.
  }
}

function cacheChatModelOptions(value: ChatModelOptionsResponse) {
  const cached = { cachedAt: Date.now(), value }
  memoryCache = cached

  try {
    window.localStorage.setItem(CHAT_MODEL_OPTIONS_CACHE_KEY, JSON.stringify(cached))
  } catch {
    // The in-memory cache still avoids duplicate requests when storage is unavailable.
  }
}

export async function getChatModelOptions() {
  if (refreshPromise) return refreshPromise

  const refreshGeneration = cacheGeneration
  const request = fetchJson<ChatModelOptionsResponse>("/api/chats/options")
    .then((value) => {
      if (refreshGeneration === cacheGeneration) cacheChatModelOptions(value)
      return value
    })
  refreshPromise = request
  const clearRefresh = () => {
    if (refreshPromise === request) refreshPromise = undefined
  }
  void request.then(clearRefresh, clearRefresh)

  return request
}

export function formatChatModelLabel(value: string) {
  const separator = value.indexOf(":")
  const provider = separator > 0 ? value.slice(0, separator) : ""

  if (provider !== "ollama" && provider !== "gemini") {
    return value
  }

  const model = value.slice(separator + 1)
  const providerLabel = provider === "gemini" ? "Gemini" : "Ollama"
  return `${model} · ${providerLabel}`
}

export function formatChatModelName(value: string) {
  const separator = value.indexOf(":")
  const provider = separator > 0 ? value.slice(0, separator) : ""

  if (provider !== "ollama" && provider !== "gemini") {
    return value
  }

  return value.slice(separator + 1)
}

export function formatChatModelProviderLabel(value: string) {
  const separator = value.indexOf(":")
  const provider = separator > 0 ? value.slice(0, separator) : ""

  if (provider === "gemini") return "Gemini"
  if (provider === "ollama") return "Ollama"
  return "Models"
}

export function toModelSelectorOptions(models: string[]): ModelOption[] {
  return models.map((model) => ({
    id: model,
    name: formatChatModelName(model),
    description: formatChatModelProviderLabel(model),
    keywords: [formatChatModelLabel(model), formatChatModelProviderLabel(model)],
  }))
}

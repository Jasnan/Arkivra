import type { ChatResponseMode } from "./chat.api"

export const DEFAULT_CHAT_RESPONSE_MODE: ChatResponseMode = "text"
export const UI_PREFERENCES_CACHE_KEY = "arkivra.uiPreferences"

export function isChatResponseMode(value: unknown): value is ChatResponseMode {
  return value === "text" || value === "multimodal"
}

export function getCachedDefaultChatResponseMode() {
  if (typeof window === "undefined") {
    return DEFAULT_CHAT_RESPONSE_MODE
  }

  try {
    const rawPreferences = window.localStorage.getItem(UI_PREFERENCES_CACHE_KEY)
    if (!rawPreferences) {
      return DEFAULT_CHAT_RESPONSE_MODE
    }

    const preferences = JSON.parse(rawPreferences) as { defaultChatAnswerMode?: unknown }
    return isChatResponseMode(preferences.defaultChatAnswerMode)
      ? preferences.defaultChatAnswerMode
      : DEFAULT_CHAT_RESPONSE_MODE
  } catch {
    return DEFAULT_CHAT_RESPONSE_MODE
  }
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

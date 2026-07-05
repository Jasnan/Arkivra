import { fetchJson } from "@/lib/api"
import type { ModelOption } from "@/app/chat/components/assistant-ui/model-selector"

export interface ChatModelOptions {
  defaultModel: string
  models: string[]
}

export async function getChatModelOptions() {
  return fetchJson<{ options: ChatModelOptions }>("/api/chats/options")
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


import { fetchJson } from "@/lib/api"

export type ChatResponseMode = "text" | "multimodal"

export interface ChatModelOptions {
  defaultModel: string
  models: string[]
}

export interface UserUiPreferences {
  defaultChatAnswerMode?: ChatResponseMode
}

export async function getChatModelOptions() {
  return fetchJson<{ options: ChatModelOptions }>("/api/chats/options")
}

export async function getUserUiPreferences() {
  return fetchJson<{ preferences: UserUiPreferences }>("/api/me/preferences")
}

import type { DraftChatDocument } from "@/app/chat/lib/chat-context-model"
import { fetchJson } from "@/lib/api"

type ChatDraftResponse = {
  conversation: {
    id: string
  }
}

export async function createDocumentChatDraft(document: DraftChatDocument) {
  const { conversation } = await fetchJson<ChatDraftResponse>("/api/chats", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      contextSnapshot: {
        type: "document",
        vaultId: document.vaultId,
        documentId: document.documentId,
        ...(document.vaultName ? { vaultName: document.vaultName } : {}),
        ...(document.name ? { documentName: document.name } : {}),
      },
    }),
  })

  return conversation.id
}

export async function discardChatDraftIfEmpty(chatId: string) {
  await fetchJson<void>(`/api/chats/${encodeURIComponent(chatId)}?discardIfEmpty=true`, {
    method: "DELETE",
    keepalive: true,
  })
}

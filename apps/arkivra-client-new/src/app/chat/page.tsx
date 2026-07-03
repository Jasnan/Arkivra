"use client"

import { useMemo } from "react"
import { useNavigate, useParams, useSearchParams } from "react-router-dom"
import { BaseLayout } from "@/components/layouts/base-layout"
import type { DraftChatContext } from "./chat-context-model"
import { Chat } from "./components/chat"

export default function ChatPage() {
  const navigate = useNavigate()
  const { conversationId } = useParams()
  const [searchParams] = useSearchParams()
  const vaultId = searchParams.get("vaultId")?.trim() ?? ""
  const documentId = searchParams.get("documentId")?.trim() ?? ""
  const documentName = searchParams.get("documentName")?.trim() ?? ""
  const initialContext = useMemo<DraftChatContext>(() => {
    if (vaultId && documentId) {
      return {
        vaults: [],
        documents: [
          {
            vaultId,
            documentId,
            ...(documentName ? { name: documentName } : {}),
          },
        ],
      }
    }

    if (vaultId) {
      return {
        vaults: [{ vaultId }],
        documents: [],
      }
    }

    return { vaults: [], documents: [] }
  }, [documentId, documentName, vaultId])
  const inputPlaceholder = documentId
    ? "Ask about this document..."
    : vaultId
      ? "Ask about documents in this vault..."
      : "Ask across your documents..."

  return (
    <BaseLayout>
      <div className="flex h-[calc(100svh-var(--header-height)-7.5rem)] min-h-0 px-4 md:h-[calc(100svh-var(--header-height)-8.5rem)] md:px-6">
        <Chat
          selectedConversationId={conversationId}
          initialContext={initialContext}
          inputPlaceholder={inputPlaceholder}
          onConversationCreated={(chatId) => navigate(`/chat/${chatId}`, { replace: true })}
          onConversationSelected={(chatId) => navigate(`/chat/${chatId}`)}
          onConversationCleared={() => navigate("/chat", { replace: true })}
        />
      </div>
    </BaseLayout>
  )
}

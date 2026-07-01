"use client"

import { useNavigate, useParams } from "react-router-dom"
import { BaseLayout } from "@/components/layouts/base-layout"
import { Chat } from "./components/chat"

export default function ChatPage() {
  const navigate = useNavigate()
  const { conversationId } = useParams()

  return (
    <BaseLayout>
      <div className="flex h-[calc(100svh-var(--header-height)-7.5rem)] min-h-0 px-4 md:h-[calc(100svh-var(--header-height)-8.5rem)] md:px-6">
        <Chat
          selectedConversationId={conversationId}
          onConversationCreated={(chatId) => navigate(`/chat/${chatId}`, { replace: true })}
          onConversationSelected={(chatId) => navigate(`/chat/${chatId}`)}
          onConversationCleared={() => navigate("/chat", { replace: true })}
        />
      </div>
    </BaseLayout>
  )
}

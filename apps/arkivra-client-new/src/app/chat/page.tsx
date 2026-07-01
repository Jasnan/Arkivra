"use client"

import { useNavigate, useParams } from "react-router-dom"
import { BaseLayout } from "@/components/layouts/base-layout"
import { Chat } from "./components/chat"

export default function ChatPage() {
  const navigate = useNavigate()
  const { conversationId } = useParams()

  return (
    <BaseLayout>
      <div className="px-4 md:px-6">
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

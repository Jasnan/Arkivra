"use client"

import { BaseLayout } from "@/components/layouts/base-layout"
import { Chat } from "./components/chat"

export default function ChatPage() {
  return (
    <BaseLayout>
      <div className="px-4 md:px-6">
        <Chat />
      </div>
    </BaseLayout>
  )
}

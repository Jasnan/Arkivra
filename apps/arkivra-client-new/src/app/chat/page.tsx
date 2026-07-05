"use client"

import { BaseLayout } from "@/components/layouts/base-layout"
import { Base } from "@/app/chat/components/examples/base"
import { ChatRuntimeProvider } from "@/app/chat/components/runtime/chat-runtime-provider"
import { BaseConfigProvider } from "@/app/chat/lib/base/config-provider"
import { defaultBaseConfig } from "@/app/chat/lib/base/defaults"

export default function ChatPage() {
  return (
    <BaseLayout
      title="Chat"
      description="Ask questions about documents and vaults. Backend chat is not connected yet."
      hideHeaderSearch
      contentClassName="overflow-hidden"
    >
      <div className="flex h-[calc(100svh-var(--header-height)-10.5rem)] min-h-[32rem] overflow-hidden px-4 pb-4 lg:px-6">
        <div className="min-h-0 flex-1 overflow-hidden rounded-lg border bg-background">
          <BaseConfigProvider value={defaultBaseConfig}>
            <ChatRuntimeProvider>
              <Base />
            </ChatRuntimeProvider>
          </BaseConfigProvider>
        </div>
      </div>
    </BaseLayout>
  )
}

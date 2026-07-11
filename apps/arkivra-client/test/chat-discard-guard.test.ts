import { describe, expect, test } from "vitest"

import { shouldConfirmChatDiscard } from "../src/app/chat/lib/chat-discard-guard"

const baseInput = {
  hasConversation: false,
  hasNonGlobalContext: false,
  hasChatId: false,
  currentPathname: "/chat",
  nextPathname: "/vaults",
}

describe("chat discard confirmation", () => {
  test("confirms when an empty chat has attached document or vault context", () => {
    expect(shouldConfirmChatDiscard({
      ...baseInput,
      hasNonGlobalContext: true,
    })).toBe(true)
  })

  test("confirms when an empty chat has a persisted chat id", () => {
    expect(shouldConfirmChatDiscard({
      ...baseInput,
      hasChatId: true,
      currentPathname: "/chat/cht_1",
    })).toBe(true)
  })

  test("does not confirm after the thread has a conversation", () => {
    expect(shouldConfirmChatDiscard({
      ...baseInput,
      hasConversation: true,
      hasNonGlobalContext: true,
      hasChatId: true,
    })).toBe(false)
  })

  test("does not confirm when switching between chat routes", () => {
    expect(shouldConfirmChatDiscard({
      ...baseInput,
      hasChatId: true,
      currentPathname: "/chat/cht_1",
      nextPathname: "/chat/cht_2",
    })).toBe(false)
  })

  test("does not confirm for a blank global chat", () => {
    expect(shouldConfirmChatDiscard(baseInput)).toBe(false)
  })
})

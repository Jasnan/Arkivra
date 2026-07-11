import { describe, expect, test } from "vitest"

import { getChatIntentFromRequestMetadata } from "../src/app/chat/components/runtime/chat-runtime.helpers"

describe("chat request intent metadata", () => {
  test.each(["summarize", "compare"] as const)("reads the %s composer intent", (intent) => {
    expect(getChatIntentFromRequestMetadata({ custom: { intent } })).toBe(intent)
  })

  test("ignores unsupported and malformed intent metadata", () => {
    expect(getChatIntentFromRequestMetadata({ custom: { intent: "translate" } })).toBeUndefined()
    expect(getChatIntentFromRequestMetadata({ custom: null })).toBeUndefined()
    expect(getChatIntentFromRequestMetadata(null)).toBeUndefined()
  })
})

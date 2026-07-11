import { afterEach, describe, expect, test, vi } from "vitest"
import { createArkivraThreadListAdapter } from "../src/app/chat/components/runtime/chat-thread-adapter"
import { restoreChatThreadFromUrl } from "../src/app/chat/components/runtime/chat-url-thread-restore"

describe("Arkivra chat thread adapter", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  test("lists refreshed sidebar threads by backend activity timestamps", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      conversations: [
        {
          id: "cht_older",
          title: "Older",
          contextSnapshot: { type: "vault", vaultId: "vlt_1" },
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-02-01T00:00:00.000Z",
        },
        {
          id: "cht_newer",
          title: "Newer",
          contextSnapshot: { type: "vault", vaultId: "vlt_1" },
          createdAt: "2026-01-02T00:00:00.000Z",
          updatedAt: "2026-03-01T00:00:00.000Z",
        },
      ],
    }), {
      headers: { "content-type": "application/json" },
      status: 200,
    }))
    vi.stubGlobal("fetch", fetchMock)

    const result = await createArkivraThreadListAdapter().list()

    expect(fetchMock).toHaveBeenCalledWith("/api/chats", { credentials: "include" })
    expect(result.threads.map(thread => thread.remoteId)).toEqual(["cht_newer", "cht_older"])
    expect(result.threads.map(thread => thread.custom.updatedAt)).toEqual([
      "2026-03-01T00:00:00.000Z",
      "2026-02-01T00:00:00.000Z",
    ])
  })

  test("prepends the active empty document-chat draft", async () => {
    const fetchMock = vi.fn(async (input: string) => {
      if (input === "/api/chats/cht_draft") {
        return new Response(JSON.stringify({
          conversation: {
            id: "cht_draft",
            title: "New chat",
            contextSnapshot: { type: "document", vaultId: "vlt_1", documentId: "doc_1" },
            messages: [],
            createdAt: "2026-04-01T00:00:00.000Z",
            updatedAt: "2026-04-01T00:00:00.000Z",
          },
        }), {
          headers: { "content-type": "application/json" },
          status: 200,
        })
      }

      return new Response(JSON.stringify({
        conversations: [
          {
            id: "cht_existing",
            title: "Existing chat",
            createdAt: "2026-05-01T00:00:00.000Z",
            updatedAt: "2026-05-01T00:00:00.000Z",
          },
        ],
      }), {
        headers: { "content-type": "application/json" },
        status: 200,
      })
    })
    vi.stubGlobal("fetch", fetchMock)

    const result = await createArkivraThreadListAdapter({ ephemeralChatId: "cht_draft" }).list()

    expect(result.threads.map(thread => thread.remoteId)).toEqual(["cht_draft", "cht_existing"])
  })
})

describe("Arkivra chat URL restore", () => {
  test("reloads the backend-sorted thread list after switching to a refreshed URL chat", async () => {
    const calls: string[] = []
    const threads = {
      switchToThread: vi.fn((chatId: string) => {
        calls.push(`switch:${chatId}`)
      }),
      reload: vi.fn(() => {
        calls.push("reload")
      }),
    }

    await restoreChatThreadFromUrl({
      chatId: "cht_recent",
      threads,
    })

    expect(calls).toEqual(["switch:cht_recent", "reload"])
    expect(threads.switchToThread).toHaveBeenCalledWith("cht_recent")
    expect(threads.reload).toHaveBeenCalledTimes(1)
  })

  test("reports list reload failures without failing URL thread restore", async () => {
    const reloadError = new Error("reload failed")
    const onReloadError = vi.fn()
    const threads = {
      switchToThread: vi.fn(),
      reload: vi.fn(() => {
        throw reloadError
      }),
    }

    await expect(restoreChatThreadFromUrl({
      chatId: "cht_recent",
      threads,
      onReloadError,
    })).resolves.toBeUndefined()

    expect(onReloadError).toHaveBeenCalledWith(reloadError)
  })

  test("propagates switch failures so invalid URL chats can be cleared", async () => {
    const switchError = new Error("not found")
    const threads = {
      switchToThread: vi.fn(() => {
        throw switchError
      }),
      reload: vi.fn(),
    }

    await expect(restoreChatThreadFromUrl({
      chatId: "cht_missing",
      threads,
    })).rejects.toThrow(switchError)

    expect(threads.reload).not.toHaveBeenCalled()
  })
})

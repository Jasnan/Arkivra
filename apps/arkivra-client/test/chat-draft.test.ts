import { afterEach, describe, expect, test, vi } from "vitest"

import {
  createDocumentChatDraft,
  discardChatDraftIfEmpty,
} from "../src/app/chat/lib/chat-draft"

describe("document chat drafts", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  test("creates a document-scoped chat and returns its id", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      conversation: { id: "cht_document" },
    }), {
      headers: { "content-type": "application/json" },
      status: 201,
    }))
    vi.stubGlobal("fetch", fetchMock)

    await expect(createDocumentChatDraft({
      vaultId: "vlt_1",
      documentId: "doc_1",
      name: "Report.pdf",
      vaultName: "Finance",
      mimeType: "application/pdf",
    })).resolves.toBe("cht_document")

    expect(fetchMock).toHaveBeenCalledWith("/api/chats", {
      credentials: "include",
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        contextSnapshot: {
          type: "document",
          vaultId: "vlt_1",
          documentId: "doc_1",
          vaultName: "Finance",
          documentName: "Report.pdf",
        },
      }),
    })
  })

  test("requests atomic cleanup only for an empty draft", async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 204 }))
    vi.stubGlobal("fetch", fetchMock)

    await discardChatDraftIfEmpty("cht_document")

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/chats/cht_document?discardIfEmpty=true",
      {
        credentials: "include",
        method: "DELETE",
        keepalive: true,
      },
    )
  })
})

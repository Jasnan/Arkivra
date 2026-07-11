import { describe, expect, test } from "vitest"

import {
  hasUnavailableDraftContext,
  normalizeDraftContext,
  snapshotFromDraftContext,
} from "../src/app/chat/lib/chat-context-model"

describe("chat context normalization", () => {
  test("vaults cover folders and files in the same vault", () => {
    expect(normalizeDraftContext({
      vaults: [{ vaultId: "vlt_1", name: "Finance" }],
      folders: [{ vaultId: "vlt_1", folderId: "fld_1", name: "Invoices" }],
      documents: [{ vaultId: "vlt_1", documentId: "doc_1", name: "January.pdf" }],
    })).toEqual({
      vaults: [{ vaultId: "vlt_1", name: "Finance" }],
      folders: [],
      documents: [],
    })
  })

  test("parent folders cover descendant folders and files independent of selection order", () => {
    const normalized = normalizeDraftContext({
      vaults: [],
      folders: [
        { vaultId: "vlt_1", folderId: "fld_child", ancestorIds: ["fld_parent"] },
        { vaultId: "vlt_1", folderId: "fld_parent", ancestorIds: [] },
      ],
      documents: [{
        vaultId: "vlt_1",
        documentId: "doc_1",
        folderId: "fld_child",
        ancestorFolderIds: ["fld_parent", "fld_child"],
      }],
    })

    expect(normalized.folders.map((folder) => folder.folderId)).toEqual(["fld_parent"])
    expect(normalized.documents).toEqual([])
  })

  test("preserves unavailable tombstones in the persisted selection", () => {
    const context = normalizeDraftContext({
      vaults: [],
      folders: [{
        vaultId: "vlt_1",
        folderId: "fld_deleted",
        name: "Old reports",
        availability: "unavailable",
      }],
      documents: [],
    })

    expect(hasUnavailableDraftContext(context)).toBe(true)
    expect(snapshotFromDraftContext(context)).toMatchObject({
      type: "selection",
      folders: [{ folderId: "fld_deleted", name: "Old reports" }],
    })
  })
})

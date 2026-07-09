import { fetchJson } from "@/lib/api"

export type SearchSortBy = "created_desc" | "created_asc" | "name_asc" | "name_desc"
export type SearchMode = "keyword" | "hybrid"
export type SearchResultMatchType = "keyword" | "semantic" | "title"

export interface SearchResultTag {
  id: string
  name: string
  color: string | null
}

export interface SearchResultItem {
  vaultId: string
  vaultName: string
  documentId: string
  name: string
  originalName: string
  originalSize: number
  mimeType: string
  createdAt: string
  updatedAt: string
  tags?: SearchResultTag[]
  matchedChunksCount: number
  bestChunk: {
    chunkIndex: number
    chunkType: string | null
    pageNumber: number | null
    content: string
    snippet: string
    score: number
    matchType: SearchResultMatchType
  } | null
}

export interface SearchResultPage {
  results: SearchResultItem[]
  resultsCount: number
  pageIndex: number
  pageSize: number
  query: string
}

export interface TagSummary {
  id: string
  name: string
  color: string | null
  documentsCount?: number
}

function localDateToUtcBoundary(value: string, boundary: "start" | "end") {
  if (!value) {
    return null
  }

  const [yearValue, monthValue, dayValue] = value.split("-").map((part) => Number(part))
  if (!yearValue || !monthValue || !dayValue) {
    return value
  }

  const date =
    boundary === "start"
      ? new Date(yearValue, monthValue - 1, dayValue, 0, 0, 0, 0)
      : new Date(yearValue, monthValue - 1, dayValue, 23, 59, 59, 999)

  return Number.isNaN(date.getTime()) ? value : date.toISOString()
}

export async function listTags() {
  return fetchJson<{ tags: TagSummary[] }>("/api/tags")
}

export async function searchAllDocuments({
  query = "",
  pageIndex = 0,
  pageSize = 25,
  vaultIds,
  tagIds,
  dateFrom,
  dateTo,
  sortBy,
  searchMode,
}: {
  query?: string
  pageIndex?: number
  pageSize?: number
  vaultIds?: string[]
  tagIds?: string[]
  dateFrom?: string
  dateTo?: string
  sortBy?: SearchSortBy
  searchMode?: SearchMode
}) {
  const params = new URLSearchParams({
    pageIndex: String(pageIndex),
    pageSize: String(pageSize),
  })

  if (query.trim().length > 0) {
    params.set("q", query.trim())
  }

  if (vaultIds && vaultIds.length > 0) {
    params.set("vaultIds", vaultIds.join(","))
  }

  if (tagIds && tagIds.length > 0) {
    params.set("tagIds", tagIds.join(","))
  }

  if (dateFrom) {
    params.set("dateFrom", localDateToUtcBoundary(dateFrom, "start") ?? dateFrom)
  }

  if (dateTo) {
    params.set("dateTo", localDateToUtcBoundary(dateTo, "end") ?? dateTo)
  }

  if (sortBy) {
    params.set("sortBy", sortBy)
  }

  if (searchMode === "hybrid") {
    params.set("searchMode", searchMode)
  }

  return fetchJson<SearchResultPage>(`/api/search?${params.toString()}`)
}

"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import {
  Archive,
  CalendarDays,
  Check,
  ChevronsUpDown,
  Download,
  FileSearch,
  Grid3X3,
  HardDrive,
  List,
  MoreHorizontal,
  RefreshCcw,
  Search,
  SearchX,
  Sparkles,
  Trash2,
} from "lucide-react"
import { Link, useSearchParams } from "react-router-dom"
import { toast } from "sonner"

import { BaseLayout } from "@/components/layouts/base-layout"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { cn } from "@/lib/utils"
import { getDocumentFileIcon } from "../vaults/document-file-icons"
import {
  getDocumentDownloadUrl,
  getMe,
  listFolderTree,
  listVaults,
  moveDocument,
  renameDocument,
  softDeleteDocument,
  type FolderTreeEntry,
  type VaultSummary,
} from "../vaults/vaults.api"
import {
  listTags,
  searchAllDocuments,
  type SearchMode,
  type SearchResultItem,
  type SearchSortBy,
  type TagSummary,
} from "./search.api"

type SearchView = "list" | "grid"
type DatePreset = "any" | "last_7_days" | "last_30_days" | "custom"

interface MoveDestination {
  id: string | null
  name: string
  label: string
  depth: number
}

const SEARCH_RESULT_LIMIT = 25
const SEARCH_QUERY_DEBOUNCE_MS = 280
const SEARCH_LIST_SEPARATOR = ","
const SEARCH_VIEW_STORAGE_KEY = "arkivra:search-view"
const sortOptions: Array<{ value: SearchSortBy; label: string }> = [
  { value: "created_desc", label: "Recent" },
  { value: "created_asc", label: "Oldest" },
  { value: "name_asc", label: "A to Z" },
  { value: "name_desc", label: "Z to A" },
]

function parseSearchList(value: string | null) {
  return Array.from(
    new Set(
      (value ?? "")
        .split(SEARCH_LIST_SEPARATOR)
        .map((item) => item.trim())
        .filter(Boolean)
    )
  )
}

function joinSearchList(values: string[]) {
  return values.join(SEARCH_LIST_SEPARATOR)
}

function isSearchSortBy(value: string | null): value is SearchSortBy {
  return value === "created_desc" || value === "created_asc" || value === "name_asc" || value === "name_desc"
}

function isSearchMode(value: string | null): value is SearchMode {
  return value === "keyword" || value === "hybrid"
}

function readInitialSearchView(): SearchView {
  if (typeof window === "undefined") {
    return "list"
  }

  return window.localStorage.getItem(SEARCH_VIEW_STORAGE_KEY) === "grid" ? "grid" : "list"
}

function formatBytes(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "0 B"

  const units = ["B", "KB", "MB", "GB", "TB"]
  const exponent = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1)
  const amount = value / 1024 ** exponent
  const formatted = amount >= 10 || exponent === 0 ? Math.round(amount).toString() : amount.toFixed(1)

  return `${formatted} ${units[exponent]}`
}

function formatDate(value: string | null | undefined) {
  if (!value) return "Unknown"

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "Unknown"

  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date)
}

function toInputDateValue(value: Date) {
  const year = value.getFullYear()
  const month = `${value.getMonth() + 1}`.padStart(2, "0")
  const day = `${value.getDate()}`.padStart(2, "0")
  return `${year}-${month}-${day}`
}

function buildPresetRange(preset: Exclude<DatePreset, "custom">) {
  const today = new Date()
  const dateTo = toInputDateValue(today)

  if (preset === "any") {
    return { dateFrom: "", dateTo: "" }
  }

  const start = new Date(today)
  start.setDate(start.getDate() - (preset === "last_7_days" ? 6 : 29))

  return {
    dateFrom: toInputDateValue(start),
    dateTo,
  }
}

const snippetTokenPattern = /(<mark>.*?<\/mark>)/g
const markBoundaryPattern = /^<mark>|<\/mark>$/g
const snippetWhitespacePattern = /\s+/g

function tokenizeSnippet(value: string) {
  return value
    .replace(snippetWhitespacePattern, " ")
    .trim()
    .split(snippetTokenPattern)
    .filter((part) => part.length > 0)
    .map((part, index) => ({
      key: `${index}-${part}`,
      text: part.replace(markBoundaryPattern, ""),
      highlighted: part.startsWith("<mark>") && part.endsWith("</mark>"),
    }))
}

function downloadSearchResultDocument(result: SearchResultItem) {
  const link = window.document.createElement("a")
  link.href = getDocumentDownloadUrl({ vaultId: result.vaultId, documentId: result.documentId })
  link.download = ""
  link.rel = "noopener"
  window.document.body.appendChild(link)
  link.click()
  link.remove()
}

function SearchViewToggle({ value, onValueChange }: { value: SearchView; onValueChange: (value: SearchView) => void }) {
  return (
    <ToggleGroup
      type="single"
      value={value}
      onValueChange={(nextValue) => {
        if (nextValue === "list" || nextValue === "grid") {
          onValueChange(nextValue)
        }
      }}
      variant="outline"
      size="sm"
      aria-label="Search result view"
    >
      <ToggleGroupItem value="list" aria-label="List view">
        <List className="size-4" />
      </ToggleGroupItem>
      <ToggleGroupItem value="grid" aria-label="Grid view">
        <Grid3X3 className="size-4" />
      </ToggleGroupItem>
    </ToggleGroup>
  )
}

function MultiSelectFilter({
  label,
  triggerLabel,
  options,
  selectedValues,
  isLoading,
  onValueChange,
  onClear,
}: {
  label: string
  triggerLabel: string
  options: Array<{ value: string; label: string; color?: string | null; meta?: string }>
  selectedValues: string[]
  isLoading: boolean
  onValueChange: (values: string[]) => void
  onClear: () => void
}) {
  const [query, setQuery] = useState("")
  const selectedSet = useMemo(() => new Set(selectedValues), [selectedValues])
  const filteredOptions = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    if (normalizedQuery.length === 0) return options
    return options.filter((option) => option.label.toLowerCase().includes(normalizedQuery))
  }, [options, query])

  function toggleValue(value: string, checked: boolean) {
    const nextValues = new Set(selectedValues)
    if (checked) {
      nextValues.add(value)
    } else {
      nextValues.delete(value)
    }
    onValueChange(Array.from(nextValues))
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" className="min-w-0 justify-between">
          <span className="truncate">{triggerLabel}</span>
          <ChevronsUpDown className="size-4 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-0">
        <div className="border-b p-3">
          <div className="text-sm font-medium">{label}</div>
          <Input
            value={query}
            className="mt-2"
            placeholder={`Search ${label.toLowerCase()}`}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <div className="max-h-72 overflow-auto p-2">
          {isLoading ? (
            <div className="px-2 py-6 text-center text-sm text-muted-foreground">Loading...</div>
          ) : filteredOptions.length === 0 ? (
            <div className="px-2 py-6 text-center text-sm text-muted-foreground">No results found.</div>
          ) : (
            filteredOptions.map((option) => {
              const checked = selectedSet.has(option.value)
              return (
                <label
                  key={option.value}
                  className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-sm hover:bg-accent"
                >
                  <Checkbox
                    checked={checked}
                    onCheckedChange={(nextChecked) => toggleValue(option.value, nextChecked === true)}
                  />
                  {option.color ? (
                    <span className="size-2.5 rounded-full" style={{ backgroundColor: option.color }} />
                  ) : null}
                  <span className="min-w-0 flex-1 truncate">{option.label}</span>
                  {option.meta ? <span className="text-xs text-muted-foreground">{option.meta}</span> : null}
                </label>
              )
            })
          )}
        </div>
        {selectedValues.length > 0 ? (
          <div className="border-t p-2">
            <Button type="button" variant="ghost" size="sm" className="w-full" onClick={onClear}>
              Clear {label.toLowerCase()}
            </Button>
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  )
}

function SearchModeControl({
  value,
  onValueChange,
}: {
  value: SearchMode
  onValueChange: (value: SearchMode) => void
}) {
  const selectedLabel = value === "hybrid" ? "AI Enhanced" : "Keyword Only"

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="outline" className="justify-between" aria-label={`Search mode: ${selectedLabel}`}>
          <Sparkles className="size-4 text-primary" />
          <span>{selectedLabel}</span>
          <ChevronsUpDown className="size-4 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuRadioGroup value={value} onValueChange={(nextValue) => isSearchMode(nextValue) && onValueChange(nextValue)}>
          <DropdownMenuRadioItem value="hybrid">AI Enhanced</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="keyword">Keyword Only</DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function SearchResultSnippet({ result }: { result: SearchResultItem }) {
  if (!result.bestChunk) return null

  const isSemanticMatch = result.bestChunk.matchType === "semantic"
  const chunkCountLabel = isSemanticMatch ? "related chunk" : "matching chunk"

  return (
    <div className="mt-2 space-y-1">
      <p className="line-clamp-2 text-sm text-muted-foreground">
        {isSemanticMatch
          ? result.bestChunk.snippet.replace(snippetWhitespacePattern, " ").trim()
          : tokenizeSnippet(result.bestChunk.snippet).map((part) =>
              part.highlighted ? (
                <mark key={part.key} className="rounded bg-primary/15 px-1 text-foreground">
                  {part.text}
                </mark>
              ) : (
                <span key={part.key}>{part.text}</span>
              )
            )}
      </p>
      <div className="flex flex-wrap gap-1">
        {isSemanticMatch ? <Badge variant="secondary">Meaning match</Badge> : null}
        {result.bestChunk.pageNumber !== null ? <Badge variant="outline">Page {result.bestChunk.pageNumber}</Badge> : null}
        <Badge variant="outline">
          {result.matchedChunksCount} {chunkCountLabel}
          {result.matchedChunksCount === 1 ? "" : "s"}
        </Badge>
      </div>
    </div>
  )
}

function getTagTextColor(backgroundColor: string) {
  const normalized = backgroundColor.trim().replace(/^#/, "")
  const hex = normalized.length === 3 ? normalized.split("").map((character) => `${character}${character}`).join("") : normalized
  if (!/^[\dA-F]{6}$/i.test(hex)) return "#111827"

  const red = Number.parseInt(hex.slice(0, 2), 16)
  const green = Number.parseInt(hex.slice(2, 4), 16)
  const blue = Number.parseInt(hex.slice(4, 6), 16)
  const luminance = (0.299 * red + 0.587 * green + 0.114 * blue) / 255
  return luminance > 0.58 ? "#111827" : "#FFFFFF"
}

function SearchResultTags({ result, compact = false }: { result: SearchResultItem; compact?: boolean }) {
  const tags = result.tags ?? []
  if (tags.length === 0) {
    return compact ? null : <span className="text-sm text-muted-foreground">-</span>
  }

  const visibleTags = tags.slice(0, compact ? 2 : 3)
  const remainingCount = tags.length - visibleTags.length

  return (
    <div className="flex min-w-0 flex-wrap gap-1">
      {visibleTags.map((tag) => {
        const backgroundColor = tag.color ?? "#94a3b8"
        return (
          <Badge
            key={tag.id}
            className="max-w-28 truncate border px-1.5 py-0.5 text-xs normal-case"
            style={{
              backgroundColor,
              color: getTagTextColor(backgroundColor),
              borderColor: backgroundColor.toUpperCase() === "#FFFFFF" ? "hsl(var(--border))" : backgroundColor,
            }}
          >
            <span className="truncate">{tag.name}</span>
          </Badge>
        )
      })}
      {remainingCount > 0 ? <Badge variant="outline">+{remainingCount}</Badge> : null}
    </div>
  )
}

function ResultActions({
  result,
  canMutate,
  onRename,
  onMove,
  onTrash,
}: {
  result: SearchResultItem
  canMutate: boolean
  onRename: () => void
  onMove: () => void
  onTrash: () => void
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="ghost" size="icon" aria-label={`Actions for ${result.name}`}>
          <MoreHorizontal className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem asChild>
          <Link to={`/vaults/${result.vaultId}/${result.documentId}`}>Open</Link>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => downloadSearchResultDocument(result)}>
          <Download className="size-4" />
          Download
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled={!canMutate} onSelect={onRename}>
          Rename
        </DropdownMenuItem>
        <DropdownMenuItem disabled={!canMutate} onSelect={onMove}>
          Move to
        </DropdownMenuItem>
        <DropdownMenuItem disabled={!canMutate} variant="destructive" onSelect={onTrash}>
          <Trash2 className="size-4" />
          Trash
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function SearchResultList({
  results,
  vaults,
  onRename,
  onMove,
  onTrash,
}: {
  results: SearchResultItem[]
  vaults: VaultSummary[]
  onRename: (result: SearchResultItem) => void
  onMove: (result: SearchResultItem) => void
  onTrash: (result: SearchResultItem) => void
}) {
  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead className="hidden w-52 md:table-cell">Vault</TableHead>
            <TableHead className="hidden w-48 lg:table-cell">Tags</TableHead>
            <TableHead className="hidden w-28 md:table-cell">Size</TableHead>
            <TableHead className="hidden w-36 lg:table-cell">Modified</TableHead>
            <TableHead className="w-12" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {results.map((result) => {
            const DocumentIcon = getDocumentFileIcon(result)
            const vault = vaults.find((candidate) => candidate.id === result.vaultId)
            const canMutate = vault?.isAdmin === true || vault?.role === "owner" || vault?.role === "editor"

            return (
              <TableRow key={`${result.vaultId}-${result.documentId}`}>
                <TableCell className="min-w-0 py-4 whitespace-normal">
                  <Link to={`/vaults/${result.vaultId}/${result.documentId}`} className="flex min-w-0 gap-3">
                    <div className="flex size-9 shrink-0 items-center justify-center rounded-md border bg-background text-muted-foreground">
                      <DocumentIcon className="size-5" strokeWidth={1.9} />
                    </div>
                    <div className="min-w-0">
                      <h2 className="truncate font-medium">{result.name}</h2>
                      {result.originalName !== result.name ? (
                        <p className="mt-1 truncate text-xs text-muted-foreground">{result.originalName}</p>
                      ) : null}
                      <div className="mt-1 flex min-w-0 items-center gap-2 text-xs text-muted-foreground md:hidden">
                        <Archive className="size-3.5 shrink-0" />
                        <span className="truncate">{result.vaultName}</span>
                        <span className="shrink-0">·</span>
                        <span className="shrink-0">{formatBytes(result.originalSize)}</span>
                      </div>
                      <div className="mt-2 lg:hidden">
                        <SearchResultTags result={result} compact />
                      </div>
                      <SearchResultSnippet result={result} />
                    </div>
                  </Link>
                </TableCell>
                <TableCell className="hidden min-w-0 py-4 md:table-cell">
                  <div className="flex min-w-0 items-center gap-2">
                    <Archive className="size-4 shrink-0 text-muted-foreground" />
                    <span className="truncate">{result.vaultName}</span>
                  </div>
                </TableCell>
                <TableCell className="hidden py-4 lg:table-cell">
                  <SearchResultTags result={result} />
                </TableCell>
                <TableCell className="hidden py-4 text-muted-foreground md:table-cell">{formatBytes(result.originalSize)}</TableCell>
                <TableCell className="hidden py-4 text-muted-foreground lg:table-cell">{formatDate(result.updatedAt)}</TableCell>
                <TableCell className="py-4">
                  <ResultActions
                    result={result}
                    canMutate={canMutate}
                    onRename={() => onRename(result)}
                    onMove={() => onMove(result)}
                    onTrash={() => onTrash(result)}
                  />
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}

function SearchResultGrid({
  results,
  vaults,
  onRename,
  onMove,
  onTrash,
}: {
  results: SearchResultItem[]
  vaults: VaultSummary[]
  onRename: (result: SearchResultItem) => void
  onMove: (result: SearchResultItem) => void
  onTrash: (result: SearchResultItem) => void
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
      {results.map((result) => {
        const DocumentIcon = getDocumentFileIcon(result)
        const vault = vaults.find((candidate) => candidate.id === result.vaultId)
        const canMutate = vault?.isAdmin === true || vault?.role === "owner" || vault?.role === "editor"

        return (
          <article
            key={`${result.vaultId}-${result.documentId}`}
            className="group rounded-md border bg-background p-4 transition-colors hover:border-primary/40 hover:bg-accent/30"
          >
            <div className="flex items-start justify-between gap-2">
              <Link to={`/vaults/${result.vaultId}/${result.documentId}`} className="min-w-0 flex-1 text-center">
                <div className="mx-auto flex size-11 items-center justify-center rounded-md border bg-background text-muted-foreground">
                  <DocumentIcon className="size-5" strokeWidth={1.9} />
                </div>
                <h2 className="mt-3 truncate text-sm font-semibold">{result.name}</h2>
              </Link>
              <ResultActions
                result={result}
                canMutate={canMutate}
                onRename={() => onRename(result)}
                onMove={() => onMove(result)}
                onTrash={() => onTrash(result)}
              />
            </div>
            <div className="mt-3 flex min-w-0 items-center justify-center gap-1 text-xs text-muted-foreground">
              <Archive className="size-3.5" />
              <span className="truncate">{result.vaultName}</span>
            </div>
            <SearchResultSnippet result={result} />
          </article>
        )
      })}
    </div>
  )
}

function MoveDocumentDialog({
  open,
  target,
  value,
  folders,
  isLoading,
  isPending,
  onValueChange,
  onOpenChange,
  onSubmit,
}: {
  open: boolean
  target: SearchResultItem | null
  value: string | null
  folders: FolderTreeEntry[]
  isLoading: boolean
  isPending: boolean
  onValueChange: (value: string | null) => void
  onOpenChange: (open: boolean) => void
  onSubmit: () => void
}) {
  const [query, setQuery] = useState("")
  const destinations = useMemo<MoveDestination[]>(
    () => [
      { id: null, name: "Vault root", label: "Vault root", depth: 0 },
      ...folders.map((folder) => ({
        id: folder.id,
        name: folder.name,
        label: folder.path,
        depth: folder.depth + 1,
      })),
    ],
    [folders]
  )
  const filteredDestinations = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    if (!normalizedQuery) return destinations
    return destinations.filter((destination) => `${destination.name} ${destination.label}`.toLowerCase().includes(normalizedQuery))
  }, [destinations, query])
  const selectedDestination = destinations.find((destination) => destination.id === value) ?? destinations[0] ?? null
  const canSubmit = target !== null && selectedDestination !== null && selectedDestination.id === value

  useEffect(() => {
    if (!open) setQuery("")
  }, [open])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{target ? `Move ${target.name}` : "Move document"}</DialogTitle>
          <DialogDescription>Select the folder where this document should live.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              disabled={isLoading || isPending}
              className="pl-9"
              placeholder="Find a destination"
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          <div role="listbox" aria-label="Move destination" className="h-80 overflow-auto rounded-md border bg-background">
            {isLoading ? (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Loading folders...</div>
            ) : filteredDestinations.length === 0 ? (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">No folders found.</div>
            ) : (
              filteredDestinations.map((destination) => {
                const isSelected = destination.id === value
                const isCurrent = destination.id === target?.documentId
                return (
                  <button
                    key={destination.id ?? "__vault_root__"}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    disabled={isPending}
                    className={cn(
                      "flex min-h-12 w-full items-center gap-3 border-b px-3 py-2 text-left transition-colors last:border-b-0 hover:bg-accent",
                      isSelected && "bg-accent"
                    )}
                    onClick={() => onValueChange(destination.id)}
                  >
                    <div className="flex min-w-0 flex-1 items-center gap-3" style={{ paddingLeft: `${Math.min(destination.depth, 8) * 0.75}rem` }}>
                      <div className="flex size-7 shrink-0 items-center justify-center rounded-md border bg-background text-muted-foreground">
                        {destination.id === null ? <HardDrive className="size-4" /> : <Archive className="size-4" />}
                      </div>
                      <div className="min-w-0">
                        <div className="flex min-w-0 items-center gap-2">
                          <span className="truncate text-sm font-medium">{destination.name}</span>
                          {isCurrent ? <span className="text-xs text-muted-foreground">Current</span> : null}
                        </div>
                        {destination.label !== destination.name ? <p className="truncate text-xs text-muted-foreground">{destination.label}</p> : null}
                      </div>
                    </div>
                    <Check className={cn("size-4 shrink-0", isSelected ? "text-primary" : "text-transparent")} />
                  </button>
                )
              })
            )}
          </div>
          {selectedDestination ? <p className="text-sm text-muted-foreground">Destination: {selectedDestination.label}</p> : null}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" disabled={isPending} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" disabled={!canSubmit || isPending} onClick={onSubmit}>
            {isPending ? "Moving..." : "Move"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default function SearchPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [query, setQuery] = useState(searchParams.get("q") ?? "")
  const [debouncedQuery, setDebouncedQuery] = useState(query.trim())
  const [datePreset, setDatePreset] = useState<DatePreset>(searchParams.get("dateFrom") || searchParams.get("dateTo") ? "custom" : "any")
  const [view, setViewState] = useState<SearchView>(readInitialSearchView)
  const [vaults, setVaults] = useState<VaultSummary[]>([])
  const [tags, setTags] = useState<TagSummary[]>([])
  const [aiFeaturesEnabled, setAiFeaturesEnabled] = useState(false)
  const [loadingFilters, setLoadingFilters] = useState(true)
  const [results, setResults] = useState<SearchResultItem[]>([])
  const [loadingSearch, setLoadingSearch] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [renameTarget, setRenameTarget] = useState<SearchResultItem | null>(null)
  const [renameValue, setRenameValue] = useState("")
  const [moveTarget, setMoveTarget] = useState<SearchResultItem | null>(null)
  const [moveDestinationId, setMoveDestinationId] = useState<string | null>(null)
  const [moveFolders, setMoveFolders] = useState<FolderTreeEntry[]>([])
  const [loadingMoveFolders, setLoadingMoveFolders] = useState(false)
  const [pendingTrashItem, setPendingTrashItem] = useState<SearchResultItem | null>(null)
  const [itemMutationPending, setItemMutationPending] = useState(false)

  const selectedVaultIds = useMemo(() => parseSearchList(searchParams.get("vaultIds") ?? searchParams.get("vaultId")), [searchParams])
  const selectedTagIds = useMemo(() => parseSearchList(searchParams.get("tagIds") ?? searchParams.get("tagId")), [searchParams])
  const dateFrom = searchParams.get("dateFrom") ?? ""
  const dateTo = searchParams.get("dateTo") ?? ""
  const sortByParam = searchParams.get("sortBy")
  const sortBy: SearchSortBy = isSearchSortBy(sortByParam) ? sortByParam : "created_desc"
  const searchModeParam = searchParams.get("searchMode")
  const requestedSearchMode: SearchMode | null = isSearchMode(searchModeParam) ? searchModeParam : null
  const fullAiVaultIds = useMemo(
    () =>
      new Set(
        vaults
          .filter((vault) => vault.aiAccessLevel === "full" || !("aiAccessLevel" in vault))
          .map((vault) => vault.id)
      ),
    [vaults]
  )
  const semanticSearchAvailable =
    aiFeaturesEnabled &&
    (selectedVaultIds.length > 0
      ? selectedVaultIds.every((vaultId) => fullAiVaultIds.has(vaultId))
      : fullAiVaultIds.size > 0 || vaults.length === 0)
  const selectedSearchMode: SearchMode = semanticSearchAvailable ? requestedSearchMode ?? "hybrid" : "keyword"
  const effectiveSearchMode: SearchMode = selectedSearchMode === "hybrid" && debouncedQuery.length > 0 ? "hybrid" : "keyword"
  const hasSearchCriteria =
    debouncedQuery.length > 0 ||
    selectedVaultIds.length > 0 ||
    selectedTagIds.length > 0 ||
    dateFrom.length > 0 ||
    dateTo.length > 0
  const selectedVaults = useMemo(() => vaults.filter((vault) => selectedVaultIds.includes(vault.id)), [selectedVaultIds, vaults])
  const selectedTags = useMemo(() => tags.filter((tag) => selectedTagIds.includes(tag.id)), [selectedTagIds, tags])
  const selectedVaultsLabel =
    selectedVaults.length === 0
      ? "All vaults"
      : selectedVaults.length <= 2
        ? selectedVaults.map((vault) => vault.name).join(", ")
        : `${selectedVaults[0]?.name}, ${selectedVaults[1]?.name} +${selectedVaults.length - 2}`
  const selectedTagsLabel =
    selectedTags.length === 0
      ? "All tags"
      : selectedTags.length <= 2
        ? selectedTags.map((tag) => tag.name).join(", ")
        : `${selectedTags[0]?.name}, ${selectedTags[1]?.name} +${selectedTags.length - 2}`

  function updateParams(nextValues: Record<string, string>) {
    setSearchParams((previousParams) => {
      const nextParams = new URLSearchParams(previousParams)
      for (const [key, value] of Object.entries(nextValues)) {
        if (value) {
          nextParams.set(key, value)
        } else {
          nextParams.delete(key)
        }
      }
      return nextParams
    }, { replace: true })
  }

  const refreshSearch = useCallback(async () => {
    if (!hasSearchCriteria || loadingFilters) {
      setResults([])
      return
    }

    setLoadingSearch(true)
    setSearchError(null)
    try {
      const result = await searchAllDocuments({
        query: debouncedQuery,
        pageIndex: 0,
        pageSize: SEARCH_RESULT_LIMIT,
        vaultIds: selectedVaultIds.length > 0 ? selectedVaultIds : undefined,
        tagIds: selectedTagIds.length > 0 ? selectedTagIds : undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        sortBy,
        searchMode: effectiveSearchMode,
      })
      setResults(result.results)
    } catch (error) {
      setSearchError(error instanceof Error ? error.message : "Unable to search your vaults.")
    } finally {
      setLoadingSearch(false)
    }
  }, [dateFrom, dateTo, debouncedQuery, effectiveSearchMode, hasSearchCriteria, loadingFilters, selectedTagIds, selectedVaultIds, sortBy])

  useEffect(() => {
    const timeout = window.setTimeout(() => setDebouncedQuery(query.trim()), SEARCH_QUERY_DEBOUNCE_MS)
    return () => window.clearTimeout(timeout)
  }, [query])

  useEffect(() => {
    if ((searchParams.get("q") ?? "") === debouncedQuery) {
      return
    }
    updateParams({ q: debouncedQuery })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedQuery])

  useEffect(() => {
    let ignore = false
    async function loadFilters() {
      setLoadingFilters(true)
      try {
        const [vaultResult, tagResult, meResult] = await Promise.all([listVaults(), listTags(), getMe()])
        if (!ignore) {
          setVaults(vaultResult.vaults)
          setTags(tagResult.tags)
          setAiFeaturesEnabled(Boolean(meResult.aiFeaturesEnabled))
        }
      } catch (error) {
        if (!ignore) {
          toast.error(error instanceof Error ? error.message : "Unable to load search filters.")
        }
      } finally {
        if (!ignore) setLoadingFilters(false)
      }
    }
    void loadFilters()
    return () => {
      ignore = true
    }
  }, [])

  useEffect(() => {
    void refreshSearch()
  }, [refreshSearch])

  useEffect(() => {
    let ignore = false
    async function loadMoveFolders() {
      if (!moveTarget) {
        setMoveFolders([])
        return
      }

      setLoadingMoveFolders(true)
      try {
        const result = await listFolderTree({ vaultId: moveTarget.vaultId })
        if (!ignore) {
          setMoveFolders(result.folders)
        }
      } catch (error) {
        if (!ignore) {
          toast.error(error instanceof Error ? error.message : "Unable to load folders.")
        }
      } finally {
        if (!ignore) setLoadingMoveFolders(false)
      }
    }
    void loadMoveFolders()
    return () => {
      ignore = true
    }
  }, [moveTarget])

  function setView(nextView: SearchView) {
    setViewState(nextView)
    window.localStorage.setItem(SEARCH_VIEW_STORAGE_KEY, nextView)
  }

  function resetFilters() {
    setDatePreset("any")
    setQuery("")
    updateParams({
      q: "",
      vaultId: "",
      vaultIds: "",
      tagId: "",
      tagIds: "",
      dateFrom: "",
      dateTo: "",
      sortBy: "created_desc",
      searchMode: "",
    })
  }

  function setPresetDateFilter(value: DatePreset) {
    setDatePreset(value)
    if (value === "custom") return
    updateParams(buildPresetRange(value))
  }

  async function handleRenameSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!renameTarget || renameValue.trim().length === 0 || itemMutationPending) return

    setItemMutationPending(true)
    try {
      await renameDocument({ vaultId: renameTarget.vaultId, documentId: renameTarget.documentId, name: renameValue.trim() })
      setRenameTarget(null)
      setRenameValue("")
      await refreshSearch()
      toast.success("Document renamed.")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not rename document.")
    } finally {
      setItemMutationPending(false)
    }
  }

  async function handleMoveSubmit() {
    if (!moveTarget || itemMutationPending) return

    setItemMutationPending(true)
    try {
      await moveDocument({ vaultId: moveTarget.vaultId, documentId: moveTarget.documentId, folderId: moveDestinationId })
      setMoveTarget(null)
      setMoveDestinationId(null)
      await refreshSearch()
      toast.success("Document moved.")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not move document.")
    } finally {
      setItemMutationPending(false)
    }
  }

  async function confirmPendingTrash() {
    if (!pendingTrashItem || itemMutationPending) return

    setItemMutationPending(true)
    try {
      await softDeleteDocument({ vaultId: pendingTrashItem.vaultId, documentId: pendingTrashItem.documentId })
      setPendingTrashItem(null)
      await refreshSearch()
      toast.success("Document moved to trash.")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not move document to trash.")
    } finally {
      setItemMutationPending(false)
    }
  }

  const activeFilterCount = selectedVaultIds.length + selectedTagIds.length + (dateFrom || dateTo ? 1 : 0)
  const isSearchFiltered = query.trim().length > 0 || activeFilterCount > 0 || sortBy !== "created_desc" || requestedSearchMode !== null
  const searchControls = (
    <div className="space-y-4">
      <div className="grid gap-3 lg:grid-cols-[minmax(0,2fr)_auto_auto_auto]">
        <Input
          value={query}
          className="w-full cursor-text"
          aria-label="Search documents"
          placeholder="Search documents"
          onChange={(event) => setQuery(event.target.value)}
        />
        {semanticSearchAvailable ? <SearchModeControl value={selectedSearchMode} onValueChange={(value) => updateParams({ searchMode: value })} /> : null}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="outline" className="justify-between">
              Sort: {sortOptions.find((option) => option.value === sortBy)?.label ?? "Recent"}
              <ChevronsUpDown className="size-4 text-muted-foreground" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Sort results</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuRadioGroup value={sortBy} onValueChange={(value) => isSearchSortBy(value) && updateParams({ sortBy: value })}>
              {sortOptions.map((option) => (
                <DropdownMenuRadioItem key={option.value} value={option.value}>
                  {option.label}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
        <div className="flex lg:justify-end">
          <SearchViewToggle value={view} onValueChange={setView} />
        </div>
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto]">
        <MultiSelectFilter
          label="Vaults"
          triggerLabel={selectedVaultsLabel}
          options={vaults.map((vault) => ({ value: vault.id, label: vault.name }))}
          selectedValues={selectedVaultIds}
          isLoading={loadingFilters}
          onValueChange={(values) => updateParams({ vaultId: "", vaultIds: joinSearchList(values) })}
          onClear={() => updateParams({ vaultId: "", vaultIds: "" })}
        />
        <MultiSelectFilter
          label="Tags"
          triggerLabel={selectedTagsLabel}
          options={tags.map((tag) => ({
            value: tag.id,
            label: tag.name,
            color: tag.color,
            meta: typeof tag.documentsCount === "number" ? `${tag.documentsCount} doc${tag.documentsCount === 1 ? "" : "s"}` : undefined,
          }))}
          selectedValues={selectedTagIds}
          isLoading={loadingFilters}
          onValueChange={(values) => updateParams({ tagId: "", tagIds: joinSearchList(values) })}
          onClear={() => updateParams({ tagId: "", tagIds: "" })}
        />
        <Popover>
          <PopoverTrigger asChild>
            <Button type="button" variant="outline" className="justify-start">
              <CalendarDays className="size-4" />
              <span className="truncate">{dateFrom || dateTo ? "Date filtered" : "Any time"}</span>
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-80">
            <div className="space-y-4">
              <div className="text-sm font-medium">Date modified</div>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { value: "any", label: "Any time" },
                  { value: "last_7_days", label: "Last 7 days" },
                  { value: "last_30_days", label: "Last 30 days" },
                  { value: "custom", label: "Custom" },
                ].map((option) => (
                  <Button
                    key={option.value}
                    type="button"
                    variant={datePreset === option.value ? "default" : "outline"}
                    size="sm"
                    onClick={() => setPresetDateFilter(option.value as DatePreset)}
                  >
                    {option.label}
                  </Button>
                ))}
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="space-y-1">
                  <label htmlFor="search-date-from" className="text-xs text-muted-foreground">From</label>
                  <Input id="search-date-from" type="date" value={dateFrom} onChange={(event) => { setDatePreset("custom"); updateParams({ dateFrom: event.target.value }) }} />
                </div>
                <div className="space-y-1">
                  <label htmlFor="search-date-to" className="text-xs text-muted-foreground">To</label>
                  <Input id="search-date-to" type="date" value={dateTo} onChange={(event) => { setDatePreset("custom"); updateParams({ dateTo: event.target.value }) }} />
                </div>
              </div>
            </div>
          </PopoverContent>
        </Popover>
        <Button type="button" variant="outline" className="px-3 cursor-pointer" disabled={!isSearchFiltered} onClick={resetFilters}>
          <RefreshCcw className="h-4 w-4" />
          <span className="hidden lg:block">Reset Filters</span>
        </Button>
      </div>
    </div>
  )

  return (
    <BaseLayout hideHeaderSearch>
      <div className="px-4 lg:px-6">
        <Card>
          <CardHeader>
            <CardTitle>Search Results</CardTitle>
            <CardDescription>
              View, filter, and manage documents across vaults you can access.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {searchControls}
            {!hasSearchCriteria ? (
              <div className="flex min-h-[24rem] flex-col items-center justify-center rounded-md border p-8 text-center">
                <FileSearch className="size-10 text-muted-foreground" />
                <h2 className="mt-4 text-lg font-semibold">Search your documents</h2>
              </div>
            ) : searchError ? (
              <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">{searchError}</div>
            ) : loadingSearch ? (
              <div className="flex h-64 items-center justify-center rounded-md border text-sm text-muted-foreground">Searching...</div>
            ) : results.length === 0 ? (
              <div className="flex min-h-[24rem] flex-col items-center justify-center rounded-md border p-8 text-center">
                <SearchX className="size-8 text-muted-foreground" />
                <h2 className="mt-4 text-lg font-semibold">No matches found</h2>
                <p className="mt-2 max-w-md text-sm text-muted-foreground">Adjust the query or filters and try again.</p>
              </div>
            ) : view === "list" ? (
              <SearchResultList
                results={results}
                vaults={vaults}
                onRename={(result) => {
                  setRenameTarget(result)
                  setRenameValue(result.name)
                }}
                onMove={(result) => {
                  setMoveTarget(result)
                  setMoveDestinationId(null)
                }}
                onTrash={setPendingTrashItem}
              />
            ) : (
              <div>
                <SearchResultGrid
                  results={results}
                  vaults={vaults}
                  onRename={(result) => {
                    setRenameTarget(result)
                    setRenameValue(result.name)
                  }}
                  onMove={(result) => {
                    setMoveTarget(result)
                    setMoveDestinationId(null)
                  }}
                  onTrash={setPendingTrashItem}
                />
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={renameTarget !== null} onOpenChange={(open) => !open && setRenameTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename document</DialogTitle>
            <DialogDescription>Update the display name for this document.</DialogDescription>
          </DialogHeader>
          <form id="rename-search-document-form" onSubmit={handleRenameSubmit}>
            <Input value={renameValue} maxLength={255} onChange={(event) => setRenameValue(event.target.value)} />
          </form>
          <DialogFooter>
            <Button type="button" variant="outline" disabled={itemMutationPending} onClick={() => setRenameTarget(null)}>
              Cancel
            </Button>
            <Button type="submit" form="rename-search-document-form" disabled={renameValue.trim().length === 0 || itemMutationPending}>
              {itemMutationPending ? "Renaming..." : "Rename"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <MoveDocumentDialog
        open={moveTarget !== null}
        target={moveTarget}
        value={moveDestinationId}
        folders={moveFolders}
        isLoading={loadingMoveFolders}
        isPending={itemMutationPending}
        onValueChange={setMoveDestinationId}
        onOpenChange={(open) => {
          if (!open && !itemMutationPending) {
            setMoveTarget(null)
            setMoveDestinationId(null)
          }
        }}
        onSubmit={handleMoveSubmit}
      />

      <Dialog open={pendingTrashItem !== null} onOpenChange={(open) => !open && setPendingTrashItem(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{pendingTrashItem ? `Move "${pendingTrashItem.name}" to trash?` : "Move document to trash?"}</DialogTitle>
            <DialogDescription>This document will be moved to Trash.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" disabled={itemMutationPending} onClick={() => setPendingTrashItem(null)}>
              Cancel
            </Button>
            <Button type="button" variant="destructive" disabled={itemMutationPending} onClick={() => void confirmPendingTrash()}>
              {itemMutationPending ? "Moving..." : "Move to trash"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </BaseLayout>
  )
}

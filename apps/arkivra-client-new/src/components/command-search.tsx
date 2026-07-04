"use client"

import * as React from "react"
import { useNavigate } from "react-router-dom"
import { Command as CommandPrimitive } from "cmdk"
import {
  Archive,
  ArrowRight,
  MessageCircle,
  Search,
  ShieldCheck,
  Tags,
  Trash2,
  User,
  Users,
  DatabaseBackup,
  Palette,
  Info,
  ClipboardList,
  Bot,
  FileText,
  type LucideIcon,
} from "lucide-react"

import { searchAllDocuments, type SearchResultItem } from "@/app/search/search.api"
import { getDocumentFileIcon } from "@/app/vaults/document-file-icons"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { cn } from "@/lib/utils"

const DOCUMENT_SEARCH_DEBOUNCE_MS = 280
const DOCUMENT_SEARCH_RESULT_LIMIT = 8

type DocumentSearchStatus = "idle" | "loading" | "success" | "error"

const snippetTokenPattern = /(<mark>.*?<\/mark>)/g
const markBoundaryPattern = /^<mark>|<\/mark>$/g
const snippetWhitespacePattern = /\s+/g

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

const Command = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive>
>(({ className, ...props }, ref) => (
  <CommandPrimitive
    ref={ref}
    className={cn(
      "flex h-full w-full flex-col overflow-hidden rounded-xl bg-white dark:bg-zinc-950 text-zinc-950 dark:text-zinc-50",
      className
    )}
    {...props}
  />
))
Command.displayName = CommandPrimitive.displayName

const CommandInput = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive.Input>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.Input>
>(({ className, ...props }, ref) => (
  <CommandPrimitive.Input
    ref={ref}
    className={cn(
      "flex h-12 w-full border-none bg-transparent px-4 py-3 text-[17px] outline-none placeholder:text-zinc-500 dark:placeholder:text-zinc-400 border-b border-zinc-200 dark:border-zinc-800 mb-4",
      className
    )}
    {...props}
  />
))
CommandInput.displayName = CommandPrimitive.Input.displayName

const CommandList = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.List>
>(({ className, ...props }, ref) => (
  <CommandPrimitive.List
    ref={ref}
    className={cn("max-h-[400px] overflow-y-auto overflow-x-hidden pb-2", className)}
    {...props}
  />
))
CommandList.displayName = CommandPrimitive.List.displayName

const CommandGroup = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive.Group>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.Group>
>(({ className, ...props }, ref) => (
  <CommandPrimitive.Group
    ref={ref}
    className={cn(
      "overflow-hidden px-2 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-2 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-zinc-500 dark:[&_[cmdk-group-heading]]:text-zinc-400 [&:not(:first-child)]:mt-2",
      className
    )}
    {...props}
  />
))
CommandGroup.displayName = CommandPrimitive.Group.displayName

const CommandItem = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.Item>
>(({ className, ...props }, ref) => (
  <CommandPrimitive.Item
    ref={ref}
    className={cn(
      "relative flex h-12 cursor-pointer select-none items-center gap-2 rounded-lg px-4 text-sm text-zinc-700 dark:text-zinc-300 outline-none transition-colors data-[disabled=true]:pointer-events-none data-[selected=true]:bg-zinc-100 dark:data-[selected=true]:bg-zinc-800 data-[selected=true]:text-zinc-900 dark:data-[selected=true]:text-zinc-100 data-[disabled=true]:opacity-50 [&+[cmdk-item]]:mt-1",
      className
    )}
    {...props}
  />
))
CommandItem.displayName = CommandPrimitive.Item.displayName

interface SearchItem {
  title: string
  url: string
  group: string
  icon?: LucideIcon
}

interface CommandSearchProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  isAdmin: boolean
}

export function CommandSearch({ open, onOpenChange, isAdmin }: CommandSearchProps) {
  const navigate = useNavigate()
  const commandRef = React.useRef<HTMLDivElement>(null)
  const [query, setQuery] = React.useState("")
  const [debouncedQuery, setDebouncedQuery] = React.useState("")
  const [documentResults, setDocumentResults] = React.useState<SearchResultItem[]>([])
  const [documentSearchStatus, setDocumentSearchStatus] = React.useState<DocumentSearchStatus>("idle")

  const searchItems: SearchItem[] = [
    // Pages
    { title: "Vaults", url: "/vaults", group: "Pages", icon: Archive },
    { title: "Search", url: "/search", group: "Pages", icon: Search },
    { title: "Tags", url: "/tags", group: "Pages", icon: Tags },
    { title: "Chat", url: "/chat", group: "Pages", icon: MessageCircle },
    { title: "Trash", url: "/trash", group: "Pages", icon: Trash2 },

    // Settings
    { title: "Profile", url: "/settings/account", group: "Settings", icon: User },
    { title: "Security", url: "/settings/security", group: "Settings", icon: ShieldCheck },
    { title: "Appearance", url: "/settings/appearance", group: "Settings", icon: Palette },
    { title: "About", url: "/settings/about", group: "Settings", icon: Info },

    ...(isAdmin
      ? [
          // Admin
          { title: "Users", url: "/admin/users", group: "Admin", icon: Users },
          { title: "Backups", url: "/admin/backups", group: "Admin", icon: DatabaseBackup },
          { title: "Office Converter", url: "/admin/office-converter", group: "Admin", icon: FileText },
          { title: "Audit Log", url: "/admin/audit-log", group: "Admin", icon: ClipboardList },
          { title: "AI Settings", url: "/admin/ai-settings", group: "Admin", icon: Bot },
        ]
      : []),
  ]

  const normalizedQuery = query.trim().toLowerCase()
  const groupedItems = searchItems.reduce((acc, item) => {
    const searchableValue = `${item.title} ${item.group} ${item.url}`.toLowerCase()
    if (normalizedQuery.length > 0 && !searchableValue.includes(normalizedQuery)) {
      return acc
    }

    if (!acc[item.group]) {
      acc[item.group] = []
    }
    acc[item.group].push(item)
    return acc
  }, {} as Record<string, SearchItem[]>)

  React.useEffect(() => {
    if (!open) {
      setDebouncedQuery("")
      return
    }

    const trimmedQuery = query.trim()
    if (trimmedQuery.length === 0) {
      setDebouncedQuery("")
      setDocumentResults([])
      setDocumentSearchStatus("idle")
      return
    }

    setDocumentResults([])
    setDocumentSearchStatus("loading")

    const timeout = window.setTimeout(() => setDebouncedQuery(trimmedQuery), DOCUMENT_SEARCH_DEBOUNCE_MS)
    return () => window.clearTimeout(timeout)
  }, [open, query])

  React.useEffect(() => {
    if (!open || debouncedQuery.length === 0) {
      setDocumentResults([])
      setDocumentSearchStatus("idle")
      return
    }

    let cancelled = false
    setDocumentSearchStatus("loading")

    searchAllDocuments({
      query: debouncedQuery,
      pageIndex: 0,
      pageSize: DOCUMENT_SEARCH_RESULT_LIMIT,
    })
      .then((page) => {
        if (cancelled) return
        setDocumentResults(page.results)
        setDocumentSearchStatus("success")
      })
      .catch(() => {
        if (cancelled) return
        setDocumentResults([])
        setDocumentSearchStatus("error")
      })

    return () => {
      cancelled = true
    }
  }, [debouncedQuery, open])

  const hasDocumentResults = documentResults.length > 0

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      setQuery("")
      setDebouncedQuery("")
      setDocumentResults([])
      setDocumentSearchStatus("idle")
    }

    onOpenChange(nextOpen)
  }

  const handleSelect = (url: string) => {
    navigate(url)
    handleOpenChange(false)
    // Bounce effect like Vercel
    if (commandRef.current) {
      commandRef.current.style.transform = 'scale(0.96)'
      setTimeout(() => {
        if (commandRef.current) {
          commandRef.current.style.transform = ''
        }
      }, 100)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="overflow-hidden p-0 shadow-2xl border border-zinc-200 dark:border-zinc-800 max-w-[640px]">
        <DialogTitle className="sr-only">Command Search</DialogTitle>
        <Command
          ref={commandRef}
          shouldFilter={false}
          className="transition-transform duration-100 ease-out"
        >
          <CommandInput
            value={query}
            onValueChange={setQuery}
            placeholder="Search commands or documents..."
            autoFocus
          />
          <CommandList>
            {Object.entries(groupedItems).map(([group, items]) => (
              <CommandGroup key={group} heading={group}>
                {items.map((item) => {
                  const Icon = item.icon
                  return (
                    <CommandItem
                      key={item.url}
                      value={item.title}
                      onSelect={() => handleSelect(item.url)}
                    >
                      {Icon && <Icon className="mr-2 h-4 w-4" />}
                      {item.title}
                    </CommandItem>
                  )
                })}
              </CommandGroup>
            ))}
            {normalizedQuery.length > 0 ? (
              <CommandGroup heading="Documents">
                {documentSearchStatus === "loading" ? (
                  <CommandItem disabled value="documents-loading">
                    Searching documents...
                  </CommandItem>
                ) : null}
                {documentSearchStatus === "error" ? (
                  <CommandItem disabled value="documents-error">
                    Unable to run document search.
                  </CommandItem>
                ) : null}
                {documentSearchStatus === "success" && !hasDocumentResults ? (
                  <CommandItem disabled value="documents-empty">
                    No matching documents.
                  </CommandItem>
                ) : null}
                {documentResults.map((result) => {
                  const DocumentIcon = getDocumentFileIcon(result)
                  const snippet = result.bestChunk?.snippet
                  const pageNumber = result.bestChunk?.pageNumber

                  return (
                    <CommandItem
                      key={`${result.vaultId}-${result.documentId}`}
                      value={`document ${result.name} ${result.vaultName} ${snippet ?? ""}`}
                      className="h-auto min-h-16 items-start py-3"
                      onSelect={() => handleSelect(`/vaults/${result.vaultId}/${result.documentId}`)}
                    >
                      <DocumentIcon className="mt-0.5 h-4 w-4 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <div className="flex min-w-0 items-center gap-2">
                          <span className="truncate font-medium">{result.name}</span>
                          <ArrowRight className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
                        </div>
                        <div className="mt-1 truncate text-xs text-zinc-500 dark:text-zinc-400">
                          {result.vaultName} · Updated {formatDate(result.updatedAt)}
                          {pageNumber !== null && pageNumber !== undefined ? ` · Page ${pageNumber}` : ""}
                        </div>
                        {snippet ? (
                          <div className="mt-1 line-clamp-2 text-xs text-zinc-500 dark:text-zinc-400">
                            {tokenizeSnippet(snippet).map((part) =>
                              part.highlighted ? (
                                <mark
                                  key={`${result.documentId}-${part.key}`}
                                  className="rounded-sm bg-primary/15 px-0.5 text-primary"
                                >
                                  {part.text}
                                </mark>
                              ) : (
                                <span key={`${result.documentId}-${part.key}`}>{part.text}</span>
                              )
                            )}
                          </div>
                        ) : null}
                      </div>
                    </CommandItem>
                  )
                })}
              </CommandGroup>
            ) : null}
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  )
}

export function SearchTrigger({
  className,
  onClick,
}: {
  className?: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground h-8 px-3 py-1 relative w-full justify-start text-muted-foreground sm:pr-12 md:w-36 lg:w-56",
        className
      )}
    >
      <Search className="mr-2 h-3.5 w-3.5" />
      <span className="hidden lg:inline-flex">Search...</span>
      <span className="inline-flex lg:hidden">Search...</span>
      <kbd className="pointer-events-none absolute right-2 top-1/2 hidden h-4 -translate-y-1/2 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium opacity-100 sm:flex">
        <span className="text-xs">⌘</span>K
      </kbd>
    </button>
  )
}

"use client"

import {
  FileText,
  FolderOpen,
  Search,
  Sparkles,
} from "lucide-react"

import { DotPattern } from "@/components/dot-pattern"
import { Card, CardContent } from "@/components/ui/card"

const documentPillars = [
  {
    title: "Organize",
    description:
      "Turn scattered files into vaults, folders, and tags that match how you think about your documents.",
    visual: "organize",
  },
  {
    title: "Search",
    description:
      "Find related document content by meaning, then narrow results with tags and metadata as your archive grows.",
    visual: "search",
  },
  {
    title: "Understand",
    description:
      "Use optional AI to ask focused questions, summarize context, and translate content when it helps.",
    visual: "understand",
  },
]

export function StatsSection() {
  return (
    <section className="relative py-16 sm:py-24">
      <div className="absolute inset-0 bg-gradient-to-r from-primary/8 via-transparent to-secondary/20" />
      <DotPattern className="opacity-75" size="md" fadeStyle="circle" />

      <div className="container relative mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="text-3xl font-bold tracking-tight text-balance sm:text-4xl">
            More than a folder of files.
          </h2>
          <p className="mx-auto mt-5 max-w-2xl text-lg text-muted-foreground text-pretty">
            Arkivra helps you structure what you store, search across it quickly, and use AI to work with the content
            inside.
          </p>
        </div>

        <div className="mt-10 grid grid-cols-1 gap-6 lg:grid-cols-3">
          {documentPillars.map((pillar) => (
            <Card key={pillar.title} className="overflow-hidden py-0 shadow-xs">
              <CardContent className="flex h-full flex-col p-0">
                <div className="relative flex h-52 items-center justify-center overflow-hidden border-b bg-background/50 p-6">
                  <DotPattern className="opacity-75" size="sm" fadeStyle="ellipse" />
                  <div className="relative flex h-full w-full items-center">
                    {pillar.visual === "organize" && <OrganizePreview />}
                    {pillar.visual === "search" && <SearchPreview />}
                    {pillar.visual === "understand" && <UnderstandPreview />}
                  </div>
                </div>

                <div className="flex flex-1 flex-col items-center p-6 text-center">
                  <h3 className="text-xl font-medium text-balance">{pillar.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">{pillar.description}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  )
}

function OrganizePreview() {
  return (
    <div className="flex h-32 w-full flex-col justify-center rounded-xl bg-background/70 p-3">
      <div className="space-y-1.5 text-xs text-muted-foreground">
        <div className="flex items-center gap-2 text-foreground">
          <span className="size-2 rounded-full bg-primary/40" />
          My Vault
        </div>
        <div className="ml-5 flex items-center gap-2">
          <FolderOpen className="size-3.5 text-primary" />
          Projects
        </div>
        <div className="ml-10 flex items-center gap-2">
          <FolderOpen className="size-3.5 text-primary" />
          Design
        </div>
        <div className="ml-10 flex items-center gap-2">
          <FolderOpen className="size-3.5 text-primary" />
          Research
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <span className="rounded-md bg-primary/10 px-2 py-1 text-xs text-primary">important</span>
        <span className="rounded-md bg-emerald-500/10 px-2 py-1 text-xs text-emerald-700 dark:text-emerald-300">
          2024
        </span>
        <span className="rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground">client</span>
      </div>
    </div>
  )
}

function SearchPreview() {
  return (
    <div className="flex h-32 w-full flex-col justify-center rounded-xl bg-background/70 p-3">
      <div className="flex items-center gap-2 rounded-lg border bg-background px-3 py-2 text-sm text-muted-foreground">
        <Search className="size-4 text-primary" />
        <span>Zahlungsfrist</span>
      </div>
      <div className="mt-3 rounded-lg bg-primary/5 p-3">
        <div className="flex items-start gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
            <FileText className="size-4" />
          </div>
          <div className="min-w-0 flex-1">
            <span className="block truncate text-xs font-medium text-foreground">service agreement.pdf</span>
            <div className="mt-2 space-y-1.5">
              <div className="h-1.5 w-5/6 rounded-full bg-primary/20" />
              <div className="h-1.5 w-2/3 rounded-full bg-muted" />
            </div>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <span className="rounded-md bg-background px-2 py-1 text-[10px] text-muted-foreground">payment deadline</span>
          <span className="rounded-md bg-background px-2 py-1 text-[10px] text-muted-foreground">due date</span>
          <span className="rounded-md bg-background px-2 py-1 text-[10px] text-muted-foreground">net 30</span>
        </div>
      </div>
    </div>
  )
}

function UnderstandPreview() {
  return (
    <div className="flex h-32 w-full flex-col justify-center rounded-xl bg-background/70 p-3">
      <div className="ml-auto w-fit rounded-lg bg-primary/10 px-3 py-2 text-xs text-primary">
        What are the key terms in this contract?
      </div>
      <div className="mt-3 rounded-lg border bg-background p-3">
        <div className="mb-2 flex items-center gap-2 text-primary">
          <Sparkles className="size-4" />
          <span className="text-xs font-medium">AI summary</span>
        </div>
        <div className="space-y-2">
          <div className="h-2 w-5/6 rounded-full bg-primary/20" />
          <div className="h-2 w-3/4 rounded-full bg-primary/20" />
          <div className="h-2 w-1/2 rounded-full bg-primary/20" />
        </div>
      </div>
    </div>
  )
}

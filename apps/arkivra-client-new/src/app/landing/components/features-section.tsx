"use client"

import {
  ArrowRight,
  Brain,
  FileText,
  Folder,
  History,
  Languages,
  MessageCircle,
  Search,
  SlidersHorizontal,
  Tag,
  Users,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Image3D } from "@/components/image-3d"

const docsUrl = "https://docs.arkivra.app/"

const documentFeatures = [
  {
    icon: Folder,
    title: "Vault organization",
    description: "Create vaults to group documents the way that makes sense to you.",
  },
  {
    icon: Tag,
    title: "Tags & metadata",
    description: "Use tags, filters, and metadata to keep your documents structured and easy to find.",
  },
  {
    icon: History,
    title: "Version history",
    description: "Track document changes over time and restore previous versions when needed.",
  },
  {
    icon: Users,
    title: "Access control",
    description: "Manage vault members, roles, and permissions around document collections.",
  },
]

const retrievalFeatures = [
  {
    icon: Search,
    title: "Full-text search",
    description: "Search the content of your documents, not just file names.",
  },
  {
    icon: FileText,
    title: "Scanned document support",
    description: "Extract searchable text from many scanned PDFs and images.",
  },
  {
    icon: SlidersHorizontal,
    title: "Filters and metadata",
    description: "Narrow results with tags, vaults, document metadata, and processing state.",
  },
  {
    icon: Brain,
    title: "Semantic search",
    description: "Optionally find relevant information by meaning, not just exact keywords.",
  },
]

const optionalAiFeatures = [
  {
    icon: MessageCircle,
    title: "Chat with documents",
    description: "Ask questions and get answers from selected documents or entire vaults.",
  },
  {
    icon: Brain,
    title: "Provider-configured AI",
    description: "Connect local models or supported cloud providers when AI fits your workflow.",
  },
  {
    icon: Languages,
    title: "Document translation",
    description: "Translate documents into multiple languages when translation is enabled.",
  },
]

export function FeaturesSection() {
  return (
    <section id="features" className="bg-muted/30 py-24 sm:py-32">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mx-auto mb-16 max-w-3xl text-center">
          <Badge variant="outline" className="mb-4">
            Document workflows
          </Badge>
          <h2 className="mb-4 text-3xl font-bold tracking-tight text-balance sm:text-4xl">
            Built for everyday document management.
          </h2>
          <p className="text-lg text-muted-foreground text-pretty">
            Practical tools for organizing documents, finding information, and working with knowledge stored across
            your vaults.
          </p>
        </div>

        <div className="mb-24 grid items-center gap-12 lg:grid-cols-2 lg:gap-8 xl:gap-16">
          <Image3D lightSrc="feature-1-light.png" darkSrc="feature-1-dark.png" alt="Document management workspace" direction="left" />

          <div className="space-y-6">
            <div className="space-y-4">
              <h3 className="text-2xl font-semibold tracking-tight text-balance sm:text-3xl">
                Organize documents around real collections
              </h3>
              <p className="text-base text-muted-foreground text-pretty">
                Arkivra is built around vaults, folders, tags, versions, and permissions so document collections stay
                structured as they grow.
              </p>
            </div>

            <ul className="grid gap-4 sm:grid-cols-2">
              {documentFeatures.map((feature) => (
                <li key={feature.title} className="flex items-start gap-3 rounded-lg p-2 transition-colors hover:bg-accent/5">
                  <feature.icon className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
                  <div>
                    <h3 className="font-medium text-foreground">{feature.title}</h3>
                    <p className="mt-1 text-sm text-muted-foreground">{feature.description}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-8 xl:gap-16">
          <div className="order-2 space-y-6 lg:order-1">
            <div className="space-y-4">
              <h3 className="text-2xl font-semibold tracking-tight text-balance sm:text-3xl">
                Document management with search and optional AI
              </h3>
              <p className="text-base text-muted-foreground text-pretty">
                Core document management and full-text search work without AI. Optional AI features can add semantic
                retrieval, chat, and translation through operator-configured providers.
              </p>
            </div>

            <ul className="grid gap-4 sm:grid-cols-2">
              {[...retrievalFeatures, ...optionalAiFeatures].map((feature) => (
                <li key={feature.title} className="flex items-start gap-3 rounded-lg p-2 transition-colors hover:bg-accent/5">
                  <feature.icon className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
                  <div>
                    <h3 className="font-medium text-foreground">{feature.title}</h3>
                    <p className="mt-1 text-sm text-muted-foreground">{feature.description}</p>
                  </div>
                </li>
              ))}
            </ul>

            <div className="flex flex-col gap-4 pe-4 pt-2 sm:flex-row">
              <Button size="lg" asChild>
                <a href={docsUrl} target="_blank" rel="noopener noreferrer" className="flex items-center">
                  View documentation
                  <ArrowRight className="ms-2 size-4" aria-hidden="true" />
                </a>
              </Button>
            </div>
          </div>

          <Image3D
            lightSrc="feature-2-light.png"
            darkSrc="feature-2-dark.png"
            alt="Search and retrieval workspace"
            direction="right"
            className="order-1 lg:order-2"
          />
        </div>
      </div>
    </section>
  )
}

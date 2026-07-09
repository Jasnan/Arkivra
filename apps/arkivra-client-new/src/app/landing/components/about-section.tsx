"use client"

import { Brain, ClipboardList, GitFork, LockKeyhole, RotateCcw, Server } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { CardDecorator } from "@/components/ui/card-decorator"

const values = [
  {
    icon: GitFork,
    title: "Open Source",
    description: "AGPL-3.0 licensed and community driven. Transparent, auditable, and built for the long term.",
  },
  {
    icon: Server,
    title: "Self-Hostable",
    description: "Deploy with Docker and run Arkivra on your own servers or private infrastructure.",
  },
  {
    icon: Brain,
    title: "Use with or without AI",
    description:
      "Arkivra works on its own. Enable AI for smarter search and answers, using local models or supported cloud providers.",
  },
  {
    icon: LockKeyhole,
    title: "Document Encryption",
    description:
      "Uploaded originals and stored extracted assets are encrypted by Arkivra. Database records follow your PostgreSQL deployment controls.",
  },
  {
    icon: ClipboardList,
    title: "Audit & Activity",
    description: "Track user activity, access events, and document changes with detailed audit logs.",
  },
  {
    icon: RotateCcw,
    title: "Backups & Recovery",
    description: "Back up your data regularly and restore when needed using your self-hosted deployment workflow.",
  },
]

export function AboutSection() {
  return (
    <section id="about" className="py-24 sm:py-32">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mx-auto mb-16 max-w-4xl text-center">
          <Badge variant="outline" className="mb-4">
            About Arkivra
          </Badge>
          <h2 className="mb-6 text-3xl font-bold tracking-tight text-balance sm:text-4xl">
            Open source. Self-hostable.
          </h2>
          <p className="text-lg text-muted-foreground text-pretty">
            Deploy Arkivra wherever you want and decide how your documents and AI integrations are handled.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-x-8 gap-y-12 sm:grid-cols-2 xl:grid-cols-3">
          {values.map((value) => (
            <Card key={value.title} className="py-2 shadow-xs">
              <CardContent className="p-8">
                <div className="flex flex-col items-center text-center">
                  <CardDecorator>
                    <value.icon className="h-6 w-6" aria-hidden />
                  </CardDecorator>
                  <h3 className="mt-6 font-medium text-balance">{value.title}</h3>
                  <p className="mt-3 text-sm text-muted-foreground">{value.description}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  )
}

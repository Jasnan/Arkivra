"use client"

import * as React from "react"
import { BookOpen, ExternalLink, Github, Globe, Info, Scale } from "lucide-react"

import { BaseLayout } from "@/components/layouts/base-layout"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { getHealth } from "@/lib/api"

const repositoryUrl = "https://github.com/Jasnan/Arkivra"
const licenseUrl = "https://github.com/Jasnan/Arkivra/blob/main/LICENSE"
const authorUrl = "https://jasnan.xyz"

const appLinks = [
  {
    description: "Product site and project overview",
    href: "https://arkivra.app",
    icon: Globe,
    label: "Website",
  },
  {
    description: "User guides and API reference",
    href: "https://docs.arkivra.app",
    icon: BookOpen,
    label: "Documentation",
  },
  {
    description: "Source code and issue tracker",
    href: repositoryUrl,
    icon: Github,
    label: "GitHub",
  },
  {
    description: "Open-source license terms",
    href: licenseUrl,
    icon: Scale,
    label: "License",
  },
]

function formatVersion(version: string) {
  return version.startsWith("v") ? version : `v${version}`
}

export default function AboutSettingsPage() {
  const [version, setVersion] = React.useState<string | null>(null)
  const [versionUnavailable, setVersionUnavailable] = React.useState(false)

  React.useEffect(() => {
    let ignore = false

    getHealth()
      .then((health) => {
        if (!ignore) {
          setVersion(formatVersion(health.version))
          setVersionUnavailable(false)
        }
      })
      .catch(() => {
        if (!ignore) {
          setVersion(null)
          setVersionUnavailable(true)
        }
      })

    return () => {
      ignore = true
    }
  }, [])

  return (
    <BaseLayout>
      <div className="space-y-6 px-4 lg:px-6">
        <header className="border-b pb-4">
          <div className="space-y-1.5">
            <h1 className="text-3xl font-bold tracking-tight">About Arkivra</h1>
            <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
              Arkivra is an open-source, self-hostable document management system for organizing documents in vaults, searching across files, and using optional configured AI features.
            </p>
          </div>
        </header>

        <div className="max-w-4xl space-y-6">
          <Card className="rounded-md">
            <CardHeader>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="space-y-1.5">
                  <CardTitle className="text-xl">Application</CardTitle>
                  <CardDescription>Running instance details.</CardDescription>
                </div>
                <Badge variant="secondary" className="rounded-full px-3 py-1">
                  <span className="size-1.5 rounded-full bg-current" />
                  Version
                  <span>{version ?? (versionUnavailable ? "Unavailable" : "Loading...")}</span>
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
                Use this page to find the running version and project resources for this Arkivra installation.
              </p>
            </CardContent>
          </Card>

          <section className="space-y-4">
            <div>
              <h2 className="text-lg font-semibold tracking-tight">Links</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Project resources, documentation, source code, and license terms.
              </p>
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              {appLinks.map((link) => {
                const Icon = link.icon

                return (
                  <a
                    key={link.label}
                    href={link.href}
                    target="_blank"
                    rel="noreferrer"
                    className="group rounded-md border bg-card p-4 text-card-foreground transition-colors hover:border-primary/60 hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  >
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex min-w-0 items-center gap-3">
                        <div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                          <Icon className="size-5" />
                        </div>
                        <div className="min-w-0">
                          <div className="truncate font-semibold">{link.label}</div>
                          <div className="mt-1 truncate text-sm text-muted-foreground">{link.description}</div>
                        </div>
                      </div>
                      <ExternalLink className="size-4 shrink-0 text-muted-foreground transition-colors group-hover:text-foreground" />
                    </div>
                  </a>
                )
              })}
            </div>
          </section>

          <Card className="rounded-md">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Info className="size-4" />
                Credits
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Arkivra is maintained by{" "}
                <a
                  href={authorUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="font-medium text-foreground underline underline-offset-4"
                >
                  Jasnan Thachaparamban
                </a>
                .
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </BaseLayout>
  )
}

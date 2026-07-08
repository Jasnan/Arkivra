"use client"

import { ArrowRight, Github, Search, Vault } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { DotPattern } from "@/components/dot-pattern"

const selfHostingGuideUrl = "https://docs.arkivra.app/self-hosting/using-docker-compose/"
const githubUrl = "https://github.com/Jasnan/Arkivra"

const vaults = [
  {
    title: "IDs & Passports",
    description: "Passports, national IDs, visas",
    files: "31 files",
    size: "23.3 MB",
  },
  {
    title: "Insurance",
    description: "Health, home, car, travel policies",
    files: "186 files",
    size: "558.0 MB",
  },
  {
    title: "Vehicles",
    description: "Registration, service, manuals",
    files: "161 files",
    size: "724.5 MB",
  },
  {
    title: "Travel",
    description: "Trip plans, bookings, tickets",
    files: "216 files",
    size: "729.0 MB",
  },
  {
    title: "Home Inventory",
    description: "Valuables, warranties, serial numbers",
    files: "56 files",
    size: "63.0 MB",
  },
  {
    title: "Work",
    description: "Work related documents",
    files: "71 files",
    size: "319.5 MB",
  },
]

export function HeroSection() {
  return (
    <section id="hero" className="relative overflow-hidden pt-16 pb-16 sm:pt-20 lg:pb-24">
      <div className="absolute inset-0">
        <DotPattern className="opacity-100" size="md" fadeStyle="ellipse" />
      </div>

      <div className="container relative mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid items-center gap-12 lg:grid-cols-[0.92fr_1.08fr] lg:gap-16">
          <div className="mx-auto max-w-2xl text-center lg:mx-0 lg:text-left">
            <div className="mb-6 flex flex-wrap justify-center gap-2 lg:justify-start">
              <Badge variant="outline" className="border-foreground/40 px-4 py-2">
                Open-source
              </Badge>
              <Badge variant="secondary" className="px-4 py-2">
                Self-hostable
              </Badge>
            </div>

            <h1 className="mb-6 text-4xl font-bold tracking-tight text-balance sm:text-6xl lg:text-7xl">
              Your documents, finally under control.
            </h1>

            <p className="mb-10 text-lg text-muted-foreground text-pretty sm:text-xl">
              Store, organize, and search everything from personal records to work documents. Self-host Arkivra and
              turn scattered files into information you can actually use.
            </p>

            <div className="flex flex-col gap-4 sm:flex-row sm:justify-center lg:justify-start">
              <Button size="lg" className="text-base" asChild>
                <a href={selfHostingGuideUrl} target="_blank" rel="noopener noreferrer">
                  Self-host Arkivra
                  <ArrowRight className="ml-2 h-4 w-4" />
                </a>
              </Button>
              <Button variant="outline" size="lg" className="text-base" asChild>
                <a href={githubUrl} target="_blank" rel="noopener noreferrer">
                  <Github className="mr-2 h-4 w-4" />
                  View on GitHub
                </a>
              </Button>
            </div>
          </div>

          <Card className="relative overflow-hidden border-border/70 bg-card/80 shadow-2xl backdrop-blur">
            <CardContent className="p-3 sm:p-4">
              <div className="mb-3 flex items-center gap-2 rounded-lg border bg-background px-3 py-2 text-sm text-muted-foreground">
                <Search className="size-4" />
                invoice from acme 2024
              </div>

              <div className="grid h-[360px] grid-cols-2 gap-3 overflow-hidden sm:grid-cols-3 lg:h-[430px]">
                {vaults.map((vault) => (
                  <article
                    key={vault.title}
                    className="flex min-h-0 flex-col justify-center rounded-lg border bg-background/80 px-3 py-4 text-center"
                  >
                    <Vault className="mx-auto mb-2 size-6 text-primary" strokeWidth={1.8} />
                    <h3 className="text-sm font-semibold leading-tight">{vault.title}</h3>
                    <p className="mt-1 truncate text-xs text-muted-foreground">{vault.description}</p>
                    <p className="mt-3 text-xs text-muted-foreground">
                      {vault.files} · {vault.size}
                    </p>
                  </article>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </section>
  )
}

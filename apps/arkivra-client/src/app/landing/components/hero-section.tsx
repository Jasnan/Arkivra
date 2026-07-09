"use client"

import { ArrowRight, Github } from "lucide-react"

import vaultsScreenshotGridDark from "@/assets/vaults_screenshot_grid_dark.png"
import vaultsScreenshotGridLight from "@/assets/vaults_screenshot_grid_light.png"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { DotPattern } from "@/components/dot-pattern"

const selfHostingGuideUrl = "https://docs.arkivra.app/self-hosting/using-docker-compose/"
const githubUrl = "https://github.com/Jasnan/Arkivra"

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

          <div className="relative overflow-hidden rounded-xl border border-border/70 bg-card/80 p-2 shadow-2xl backdrop-blur sm:p-3">
            <img
              src={vaultsScreenshotGridLight}
              alt="Arkivra vaults grid view"
              className="aspect-[2480/1364] w-full rounded-lg object-cover dark:hidden"
              loading="eager"
              decoding="async"
            />
            <img
              src={vaultsScreenshotGridDark}
              alt="Arkivra vaults grid view"
              className="hidden aspect-[2480/1364] w-full rounded-lg object-cover dark:block"
              loading="eager"
              decoding="async"
            />
          </div>
        </div>
      </div>
    </section>
  )
}

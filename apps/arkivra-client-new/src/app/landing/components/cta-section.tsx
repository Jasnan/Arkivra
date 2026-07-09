"use client"

import { ArrowRight, Github, Server } from "lucide-react"

import { Button } from "@/components/ui/button"

const selfHostingGuideUrl = "https://docs.arkivra.app/self-hosting/using-docker-compose/"
const githubUrl = "https://github.com/Jasnan/Arkivra"

export function CTASection() {
  return (
    <section className="bg-muted/80 py-16 lg:py-24">
      <div className="container mx-auto px-4 lg:px-8">
        <div className="mx-auto max-w-4xl text-center">
          <div className="space-y-8">
            <div className="space-y-6">
              <h1 className="text-4xl font-bold tracking-tight text-balance sm:text-5xl lg:text-6xl">
                Ready to organize your documents?
              </h1>

              <p className="mx-auto max-w-2xl text-balance text-muted-foreground lg:text-xl">
                Start with the self-hosting guide, review the code, and decide how Arkivra fits your document workflow.
              </p>
            </div>

            <div className="flex flex-col justify-center gap-4 sm:flex-row sm:gap-6">
              <Button size="lg" className="px-8 py-6 text-lg font-medium" asChild>
                <a href={selfHostingGuideUrl} target="_blank" rel="noopener noreferrer">
                  <Server className="me-2 size-5" />
                  Self-host Arkivra
                </a>
              </Button>
              <Button variant="outline" size="lg" className="group px-8 py-6 text-lg font-medium" asChild>
                <a href={githubUrl} target="_blank" rel="noopener noreferrer">
                  <Github className="me-2 size-5" />
                  View on GitHub
                  <ArrowRight className="ms-2 size-4 transition-transform group-hover:translate-x-1" />
                </a>
              </Button>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

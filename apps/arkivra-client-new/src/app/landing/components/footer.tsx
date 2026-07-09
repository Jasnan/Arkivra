"use client"

import { Github, Heart, Mail, Rss } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { Logo } from "@/components/logo"

const footerLinks = {
  project: [
    { name: "Features", href: "#features" },
    { name: "FAQ", href: "#faq" },
  ],
  resources: [
    { name: "Documentation", href: "https://docs.arkivra.app/" },
    { name: "Docker guide", href: "https://docs.arkivra.app/self-hosting/using-docker-compose/" },
    { name: "GitHub", href: "https://github.com/Jasnan/Arkivra" },
  ],
  legal: [
    { name: "Privacy Policy", href: "/privacy" },
    { name: "Terms of Service", href: "/terms-of-service" },
  ],
}

const socialLinks = [
  { name: "GitHub", href: "https://github.com/Jasnan/Arkivra", icon: Github },
  { name: "Email", href: "mailto:contact@arkivra.app", icon: Mail },
  { name: "RSS", href: "/rss.xml", icon: Rss },
]

export function LandingFooter() {
  return (
    <footer className="border-t bg-background">
      <div className="container mx-auto px-4 py-16 sm:px-6 lg:px-8">
        <div className="grid grid-cols-4 gap-8 lg:grid-cols-6">
          <div className="col-span-4 max-w-2xl lg:col-span-3">
            <a href="#hero" className="mb-4 flex items-center space-x-2 max-lg:justify-center">
              <Logo size={32} />
              <span className="text-xl font-bold">Arkivra</span>
            </a>
            <p className="mb-6 text-muted-foreground max-lg:text-center">
              Open-source document management system with powerful search and optional AI.
            </p>
            <div className="flex space-x-4 max-lg:justify-center">
              {socialLinks.map((social) => (
                <Button key={social.name} variant="ghost" size="icon" asChild>
                  <a
                    href={social.href}
                    aria-label={social.name}
                    target={social.href.startsWith("http") ? "_blank" : undefined}
                    rel="noopener noreferrer"
                  >
                    <social.icon className="h-4 w-4" />
                  </a>
                </Button>
              ))}
            </div>
          </div>

          <div className="max-md:col-span-2 lg:col-span-1">
            <h4 className="mb-4 font-semibold">Project</h4>
            <ul className="space-y-3">
              {footerLinks.project.map((link) => (
                <li key={link.name}>
                  <a href={link.href} className="text-muted-foreground transition-colors hover:text-foreground">
                    {link.name}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          <div className="max-md:col-span-2 lg:col-span-1">
            <h4 className="mb-4 font-semibold">Resources</h4>
            <ul className="space-y-3">
              {footerLinks.resources.map((link) => (
                <li key={link.name}>
                  <a
                    href={link.href}
                    className="text-muted-foreground transition-colors hover:text-foreground"
                    target={link.href.startsWith("http") ? "_blank" : undefined}
                    rel="noopener noreferrer"
                  >
                    {link.name}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          <div className="max-md:col-span-2 lg:col-span-1">
            <h4 className="mb-4 font-semibold">Legal</h4>
            <ul className="space-y-3">
              {footerLinks.legal.map((link) => (
                <li key={link.name}>
                  <a href={link.href} className="text-muted-foreground transition-colors hover:text-foreground">
                    {link.name}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <Separator className="my-8" />

        <div className="flex flex-col items-center justify-between gap-2 text-sm text-muted-foreground lg:flex-row">
          <span className="flex flex-wrap items-center justify-center gap-1.5">
            Created and maintained
            <Heart className="size-4 fill-red-500 text-red-500" aria-label="love" />
            by
            <a
              href="https://jasnan.xyz/"
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-foreground transition-colors hover:text-primary"
            >
              Jasnan Thachaparamban
            </a>
            .
          </span>
          <span>© {new Date().getFullYear()} Arkivra</span>
        </div>
      </div>
    </footer>
  )
}

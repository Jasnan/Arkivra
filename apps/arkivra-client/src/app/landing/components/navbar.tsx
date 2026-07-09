"use client"

import { useState } from "react"
import { Archive, Github, Menu, Moon, Sun, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { Logo } from "@/components/logo"
import { ModeToggle } from "@/components/mode-toggle"
import { useTheme } from "@/hooks/use-theme"

const docsUrl = "https://docs.arkivra.app/"
const githubUrl = "https://github.com/Jasnan/Arkivra"

const navigationItems = [
  { name: "Home", href: "#hero" },
  { name: "About", href: "#about" },
  { name: "Features", href: "#features" },
  { name: "FAQ", href: "#faq" },
]

const smoothScrollTo = (targetId: string) => {
  if (!targetId.startsWith("#")) return

  const element = document.querySelector(targetId)
  if (element) {
    element.scrollIntoView({
      behavior: "smooth",
      block: "start",
    })
  }
}

export function LandingNavbar() {
  const [isOpen, setIsOpen] = useState(false)
  const { setTheme, theme } = useTheme()

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/80 backdrop-blur-xl supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto flex h-16 items-center justify-between px-4 sm:px-6 lg:px-8">
        <a href="#hero" className="flex items-center space-x-2" onClick={(event) => {
          event.preventDefault()
          smoothScrollTo("#hero")
        }}>
          <Logo size={32} />
          <span className="font-bold">Arkivra</span>
        </a>

        <nav className="hidden items-center xl:flex">
          {navigationItems.map((item) => (
            <a
              key={item.name}
              href={item.href}
              className="inline-flex h-10 items-center justify-center px-4 py-2 text-sm font-medium transition-colors hover:text-primary focus:text-primary focus:outline-none"
              onClick={(event) => {
                event.preventDefault()
                smoothScrollTo(item.href)
              }}
            >
              {item.name}
            </a>
          ))}
        </nav>

        <div className="hidden items-center space-x-2 xl:flex">
          <ModeToggle variant="ghost" />
          <Button variant="ghost" size="icon" asChild>
            <a href={githubUrl} target="_blank" rel="noopener noreferrer" aria-label="GitHub Repository">
              <Github className="h-5 w-5" />
            </a>
          </Button>
          <Button variant="outline" asChild>
            <a href={docsUrl} target="_blank" rel="noopener noreferrer">
              Documentation
            </a>
          </Button>
          <Button asChild>
            <a href="https://docs.arkivra.app/self-hosting/using-docker-compose/" target="_blank" rel="noopener noreferrer">
              <Archive className="mr-2 h-4 w-4" />
              Self-host
            </a>
          </Button>
        </div>

        <Sheet open={isOpen} onOpenChange={setIsOpen}>
          <SheetTrigger asChild className="xl:hidden">
            <Button variant="ghost" size="icon">
              <Menu className="h-5 w-5" />
              <span className="sr-only">Toggle menu</span>
            </Button>
          </SheetTrigger>
          <SheetContent side="right" className="flex w-full flex-col gap-0 overflow-hidden p-0 sm:w-[400px] [&>button]:hidden">
            <div className="flex h-full flex-col">
              <SheetHeader className="space-y-0 border-b p-4 pb-2">
                <div className="flex items-center gap-2">
                  <div className="rounded-lg bg-primary/10 p-2">
                    <Logo size={16} />
                  </div>
                  <SheetTitle className="text-lg font-semibold">Arkivra</SheetTitle>
                  <div className="ml-auto flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setTheme(theme === "light" ? "dark" : "light")}
                      className="h-8 w-8"
                    >
                      <Moon className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
                      <Sun className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
                    </Button>
                    <Button variant="ghost" size="icon" asChild className="h-8 w-8">
                      <a href={githubUrl} target="_blank" rel="noopener noreferrer" aria-label="GitHub Repository">
                        <Github className="h-4 w-4" />
                      </a>
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => setIsOpen(false)} className="h-8 w-8">
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </SheetHeader>

              <div className="flex-1 overflow-y-auto">
                <nav className="space-y-1 p-6">
                  {navigationItems.map((item) => (
                    <a
                      key={item.name}
                      href={item.href}
                      className="flex items-center rounded-lg px-4 py-3 text-base font-medium transition-colors hover:bg-accent hover:text-accent-foreground"
                      onClick={(event) => {
                        event.preventDefault()
                        setIsOpen(false)
                        setTimeout(() => smoothScrollTo(item.href), 100)
                      }}
                    >
                      {item.name}
                    </a>
                  ))}
                </nav>
              </div>

              <div className="space-y-4 border-t p-6">
                <Button variant="outline" size="lg" asChild className="w-full">
                  <a href={docsUrl} target="_blank" rel="noopener noreferrer">
                    Documentation
                  </a>
                </Button>
                <Button size="lg" asChild className="w-full">
                  <a href="https://docs.arkivra.app/self-hosting/using-docker-compose/" target="_blank" rel="noopener noreferrer">
                    Self-host Arkivra
                  </a>
                </Button>
              </div>
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </header>
  )
}

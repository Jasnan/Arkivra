"use client"

import { CircleHelp } from "lucide-react"

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { Badge } from "@/components/ui/badge"

type FaqItem = {
  value: string
  question: string
  answer: string
}

const faqItems: FaqItem[] = [
  {
    value: "item-1",
    question: "Do I need AI to use Arkivra?",
    answer:
      "No. Arkivra works without AI. Upload documents, organize vaults, search content, manage versions, restore files, and create backups without connecting any AI provider.",
  },
  {
    value: "item-2",
    question: "What does optional AI mean?",
    answer:
      "AI features are disabled by default. If you want AI-assisted features such as semantic search, chat, or translation, you can connect local models or supported cloud providers using your own configuration.",
  },
  {
    value: "item-3",
    question: "Do my documents leave my computer?",
    answer:
      "Arkivra is self-hosted, so documents stay within the infrastructure you choose to run it on. Core document management and full-text search do not require any AI provider. If you configure remote AI providers, remote storage, or off-site backups, the content required for those features may be sent to those services according to your configuration.",
  },
  {
    value: "item-4",
    question: "What happens when I use a remote AI provider?",
    answer:
      "Arkivra only sends the content required for the AI feature being used. Depending on configuration, this may include document text for indexing or document context for chat and other AI-assisted workflows.",
  },
  {
    value: "item-5",
    question: "What is semantic search?",
    answer:
      "Regular search looks for matching words. Semantic search looks for matching meaning, so a search for car insurance may also find documents that mention vehicle coverage.",
  },
  {
    value: "item-6",
    question: "Can Arkivra search scanned PDFs and documents?",
    answer:
      "Yes. Arkivra can extract searchable text from many scanned PDFs and images. Results depend on scan quality and the configured document processing pipeline.",
  },
  {
    value: "item-7",
    question: "What license is Arkivra released under?",
    answer:
      "Arkivra is open source under the AGPL-3.0 license. The source code, issue tracker, and project roadmap are available on GitHub.",
  },
]

const FaqSection = () => {
  return (
    <section id="faq" className="py-24 sm:py-32">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mx-auto mb-16 max-w-2xl text-center">
          <Badge variant="outline" className="mb-4">
            FAQ
          </Badge>
          <h2 className="mb-4 text-3xl font-bold tracking-tight sm:text-4xl">Frequently asked questions</h2>
          <p className="text-lg text-muted-foreground">
            Answers to the questions people usually ask before running Arkivra.
          </p>
        </div>

        <div className="mx-auto max-w-4xl">
          <Accordion type="single" collapsible className="space-y-5">
            {faqItems.map((item) => (
              <AccordionItem key={item.value} value={item.value} className="rounded-md !border bg-transparent">
                <AccordionTrigger className="items-center gap-4 rounded-none bg-transparent py-2 ps-3 pe-4 hover:no-underline data-[state=open]:border-b">
                  <div className="flex items-center gap-4">
                    <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                      <CircleHelp className="size-5" />
                    </div>
                    <span className="text-start font-semibold">{item.question}</span>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="bg-transparent p-4">{item.answer}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </div>
    </section>
  )
}

export { FaqSection }

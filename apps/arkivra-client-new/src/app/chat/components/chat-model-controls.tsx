"use client"

import { Brain, Check, ChevronDown } from "lucide-react"
import { useMemo, useState } from "react"

import type { ChatResponseMode } from "../chat.api"
import {
  formatChatModelLabel,
  formatChatModelName,
  formatChatModelProviderLabel,
} from "../chat-model-utils"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { cn } from "@/lib/utils"

const responseModeOptions = [
  {
    title: "Plain answer",
    value: "text",
    description: "Answer without inline citations or source previews.",
  },
  {
    title: "Cited answer",
    value: "multimodal",
    description: "Answer with inline citations and source evidence.",
  },
] satisfies Array<{ title: string; value: ChatResponseMode; description: string }>

interface ModelSelectItem {
  label: string
  value: string
  category: string
}

export function ChatModelControls({
  responseMode,
  modelOptions,
  selectedModel,
  isLoadingModels,
  modelOptionsError,
  disabled,
  onResponseModeChange,
  onSelectedModelChange,
}: {
  responseMode: ChatResponseMode
  modelOptions: string[]
  selectedModel: string
  isLoadingModels?: boolean
  modelOptionsError?: string | null
  disabled?: boolean
  onResponseModeChange: (nextValue: ChatResponseMode) => void
  onSelectedModelChange: (nextValue: string) => void
}) {
  const [isAnswerModeOpen, setIsAnswerModeOpen] = useState(false)
  const responseModeLabel =
    responseModeOptions.find((option) => option.value === responseMode)?.title ?? "Answer mode"
  const modelLabel = selectedModel
    ? formatChatModelLabel(selectedModel)
    : isLoadingModels
      ? "Loading models"
      : "No model"
  const modelCategories = useMemo(() => {
    const categories = new Map<string, ModelSelectItem[]>()

    for (const model of modelOptions) {
      const item = {
        value: model,
        label: formatChatModelName(model),
        category: formatChatModelProviderLabel(model),
      }
      categories.set(item.category, [...(categories.get(item.category) ?? []), item])
    }

    return Array.from(categories.entries())
  }, [modelOptions])

  function handleResponseModeChange(nextValue: string) {
    if (nextValue !== "text" && nextValue !== "multimodal") {
      return
    }

    onResponseModeChange(nextValue)
    setIsAnswerModeOpen(false)
  }

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={disabled || isLoadingModels || modelOptions.length === 0}
            aria-label="Select model"
            title={modelOptionsError ?? "Select model"}
            className="h-9 w-9 min-w-0 justify-center gap-2 rounded-md px-0 text-muted-foreground shadow-none hover:text-foreground sm:w-48 sm:justify-between sm:px-2.5 lg:w-56"
          >
            <span className="flex min-w-0 items-center gap-2">
              <Brain className="size-4 shrink-0" />
              <span className="hidden min-w-0 truncate text-sm font-medium sm:inline">{modelLabel}</span>
            </span>
            <ChevronDown className="hidden size-4 shrink-0 sm:block" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-80">
          {modelCategories.length > 0 ? (
            <DropdownMenuRadioGroup value={selectedModel} onValueChange={onSelectedModelChange}>
              {modelCategories.map(([category, items], categoryIndex) => (
                <div key={category}>
                  {categoryIndex > 0 ? <DropdownMenuSeparator /> : null}
                  <DropdownMenuLabel className="text-xs text-muted-foreground">
                    {category}
                  </DropdownMenuLabel>
                  {items.map((item) => (
                    <DropdownMenuRadioItem
                      key={item.value}
                      value={item.value}
                      className="cursor-pointer"
                    >
                      <span className="min-w-0 flex-1 truncate">{item.label}</span>
                      {selectedModel === item.value ? (
                        <Check className="ml-auto size-4 text-primary" />
                      ) : null}
                    </DropdownMenuRadioItem>
                  ))}
                </div>
              ))}
            </DropdownMenuRadioGroup>
          ) : (
            <div className="px-2 py-1.5 text-sm text-muted-foreground">
              {isLoadingModels ? "Loading models..." : "No models available"}
            </div>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <Popover open={isAnswerModeOpen} onOpenChange={setIsAnswerModeOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled}
            aria-label="Select answer mode"
            title="Select answer mode"
            className="h-9 w-[8.75rem] justify-between rounded-md bg-background px-3 font-medium shadow-none"
          >
            <span className="truncate">{responseModeLabel}</span>
            <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-80 p-3">
          <RadioGroup
            value={responseMode}
            onValueChange={handleResponseModeChange}
            className="gap-2"
          >
            <div className="px-1 text-xs font-medium text-muted-foreground">Answer mode</div>
            {responseModeOptions.map((option) => (
              <label
                key={option.value}
                className={cn(
                  "grid cursor-pointer grid-cols-[auto_minmax(0,1fr)] gap-3 rounded-md border p-3 transition-colors",
                  responseMode === option.value
                    ? "border-primary/40 bg-primary/5"
                    : "border-border hover:bg-accent"
                )}
              >
                <RadioGroupItem value={option.value} className="mt-0.5" />
                <span className="min-w-0 space-y-1">
                  <span className="block text-sm font-medium">{option.title}</span>
                  <span className="block text-xs leading-5 text-muted-foreground">
                    {option.description}
                  </span>
                </span>
              </label>
            ))}
          </RadioGroup>
        </PopoverContent>
      </Popover>
    </div>
  )
}

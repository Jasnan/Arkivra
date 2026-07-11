"use client";

import {
  ComposerAttachments,
  UserMessageAttachments,
} from "@/app/chat/components/assistant-ui/attachment";
import { ChatContextPicker } from "@/app/chat/components/chat-context-picker";
import { CitationData } from "@/app/chat/components/assistant-ui/citations";
import { MarkdownText } from "@/app/chat/components/assistant-ui/markdown-text";
import { DotMatrix } from "@/app/chat/components/assistant-ui/dot-matrix";
import { MessageTiming } from "@/app/chat/components/assistant-ui/message-timing";
import { ToolFallback } from "@/app/chat/components/assistant-ui/tool-fallback";
import {
  ToolGroupContent,
  ToolGroupRoot,
  ToolGroupTrigger,
} from "@/app/chat/components/assistant-ui/tool-group";
import { ThreadList } from "@/app/chat/components/assistant-ui/thread-list";
import { TooltipIconButton } from "@/app/chat/components/assistant-ui/tooltip-icon-button";
import {
  Reasoning,
  ReasoningContent,
  ReasoningRoot,
  ReasoningText,
  ReasoningTrigger,
} from "@/app/chat/components/assistant-ui/reasoning";
import { Button } from "@/components/ui/button";
import {
  getCachedChatModelOptions,
  getChatModelOptions,
  toModelSelectorOptions,
} from "@/app/chat/lib/chat-model-options";
import { useBaseConfig } from "@/app/chat/lib/base/config-provider";
import {
  draftContextFromAttachments,
  draftContextFromSnapshot,
  hasUnavailableDraftContext,
  type ComposerContextAttachment,
} from "@/app/chat/lib/chat-context-model";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import {
  ComposerQuotePreview,
  QuoteBlock,
  SelectionToolbar,
} from "@/app/chat/components/assistant-ui/quote";
import { ComposerTriggerPopover } from "@/app/chat/components/assistant-ui/composer-trigger-popover";
import { DirectiveText } from "@/app/chat/components/assistant-ui/directive-text";
import {
  ActionBarMorePrimitive,
  ActionBarPrimitive,
  AuiIf,
  type AssistantState,
  BranchPickerPrimitive,
  ComposerPrimitive,
  ErrorPrimitive,
  groupPartByType,
  MessagePrimitive,
  ThreadListPrimitive,
  ThreadPrimitive,
  unstable_useSlashCommandAdapter,
  useAui,
  useAuiState,
  type Unstable_SlashCommand,
} from "@assistant-ui/react";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  Columns2Icon,
  CopyIcon,
  DownloadIcon,
  FileTextIcon,
  MicIcon,
  MoreHorizontalIcon,
  PencilIcon,
  PlusIcon,
  QuoteIcon,
  RefreshCwIcon,
  SlashIcon,
  SquareIcon,
  TriangleAlertIcon,
  VaultIcon,
  XIcon,
} from "lucide-react";
import { useEffect, useId, useMemo, useState, type FC } from "react";
import { ModelSelector } from "@/app/chat/components/assistant-ui/model-selector";

const CHAT_CITATIONS_PREFERENCE_KEY = "arkivra.chat.include-citations.v1";

function getInitialCitationsPreference() {
  if (typeof window === "undefined") return true;

  try {
    const stored = window.localStorage.getItem(CHAT_CITATIONS_PREFERENCE_KEY);
    return stored === null ? true : stored === "true";
  } catch {
    return true;
  }
}

const ModelPicker: FC = () => {
  const cachedOptions = useMemo(() => getCachedChatModelOptions()?.options, []);
  const [models, setModels] = useState<string[]>(cachedOptions?.models ?? []);
  const [defaultModel, setDefaultModel] = useState<string | undefined>(
    cachedOptions?.defaultModel || cachedOptions?.models[0] || undefined,
  );
  const [selectedModel, setSelectedModel] = useState<string | undefined>(
    cachedOptions?.defaultModel || cachedOptions?.models[0] || undefined,
  );
  const [includeCitations, setIncludeCitations] = useState(
    getInitialCitationsPreference,
  );
  const citationsSwitchId = useId();
  const [modelOptionsError, setModelOptionsError] = useState<string | null>(
    null,
  );

  useEffect(() => {
    let ignore = false;
    getChatModelOptions()
      .then((result) => {
        if (ignore) return;
        const nextModels = result.options.models;
        const nextDefaultModel =
          result.options.defaultModel || nextModels[0] || undefined;
        setModels(nextModels);
        setDefaultModel(nextDefaultModel);
        setSelectedModel((current) =>
          current && nextModels.includes(current) ? current : nextDefaultModel,
        );
        setModelOptionsError(null);
      })
      .catch((error) => {
        if (ignore) return;
        // Keep cached metadata usable when a background refresh fails.
        setModelOptionsError(
          error instanceof Error ? error.message : "Unable to load chat models.",
        );
      });

    return () => {
      ignore = true;
    };
  }, []);

  const modelOptions = useMemo(() => {
    if (modelOptionsError && models.length === 0) {
      return [{ id: "__error__", name: "Models unavailable", disabled: true }];
    }

    if (models.length === 0) {
      return [{ id: "__empty__", name: "No models available", disabled: true }];
    }

    return toModelSelectorOptions(models);
  }, [modelOptionsError, models]);
  const requestConfig = useMemo(() => ({ includeCitations }), [includeCitations]);

  function updateCitationsPreference(checked: boolean) {
    setIncludeCitations(checked);
    try {
      window.localStorage.setItem(
        CHAT_CITATIONS_PREFERENCE_KEY,
        String(checked),
      );
    } catch {
      // The preference still applies for the current page session.
    }
  }

  return (
    <>
      <ModelSelector
        models={modelOptions}
        value={selectedModel}
        defaultValue={defaultModel}
        onValueChange={setSelectedModel}
        requestConfig={requestConfig}
        variant="ghost"
        size="sm"
        className="h-7 rounded-full"
        contentClassName="min-w-72"
        searchable={models.length > 8}
        footer={
          <label
            htmlFor={citationsSwitchId}
            className="flex cursor-pointer items-center justify-between gap-4 rounded-md py-1"
          >
            <span className="flex min-w-0 flex-col">
              <span className="text-sm font-medium">Cite sources</span>
              <span className="text-muted-foreground text-xs">
                Include source references in answers
              </span>
            </span>
            <Switch
              id={citationsSwitchId}
              checked={includeCitations}
              onCheckedChange={updateCitationsPreference}
              aria-label="Cite sources"
            />
          </label>
        }
      />
      {includeCitations && (
        <span
          role="status"
          aria-label="Cite sources enabled. Change this in model options."
          title="Cite sources enabled. Change this in model options."
          className="bg-primary/10 text-primary inline-flex size-7 items-center justify-center rounded-full"
        >
          <QuoteIcon className="size-3.5" />
        </span>
      )}
    </>
  );
};

// Startup exposes a loading placeholder thread; treat it as a new chat so
// the composer mounts centered. Loads after startup keep the docked layout.
const isNewChatView = (s: AssistantState) =>
  s.thread.messages.length === 0 &&
  (!s.thread.isLoading || s.threads.isLoading);

type ChatAvailability = "loading" | "available" | "disabled" | "needs-setup" | "access-denied";

function getChatAvailabilityNotice(availability: ChatAvailability) {
  if (availability === "disabled") {
    return {
      title: "AI chat is disabled",
      description: "AI features are disabled for this Arkivra instance. Contact your administrator to enable them.",
    };
  }

  if (availability === "access-denied") {
    return {
      title: "AI chat is unavailable",
      description: "Your account does not have permission to use AI features. Contact your administrator for access.",
    };
  }

  if (availability === "needs-setup") {
    return {
      title: "AI chat needs setup",
      description: "No chat models are currently available. Contact your administrator to complete AI setup.",
    };
  }

  return null;
}

const Thread: FC<{ chatAvailability: ChatAvailability }> = ({ chatAvailability }) => {
  const isEmpty = useAuiState(isNewChatView);
  const availabilityNotice = getChatAvailabilityNotice(chatAvailability);

  return (
    <ThreadPrimitive.Root
      className="aui-root aui-thread-root bg-background @container flex h-full flex-col"
      style={{
        ["--thread-max-width" as string]: "44rem",
        ["--composer-bg" as string]:
          "color-mix(in oklab, var(--color-muted) 30%, var(--color-background))",
        ["--composer-radius" as string]: "1.5rem",
        ["--composer-padding" as string]: "8px",
      }}
    >
      <ThreadPrimitive.Viewport
        turnAnchor="top"
        data-slot="aui_thread-viewport"
        className={cn(
          "relative flex flex-1 flex-col overflow-x-auto overflow-y-scroll scroll-smooth px-4 pt-4",
          isEmpty && "justify-center",
        )}
      >
        <AuiIf condition={isNewChatView}>
          <ThreadWelcome />
        </AuiIf>

        <div
          data-slot="aui_message-group"
          className="mb-14 flex flex-col gap-y-6 empty:hidden"
        >
          <ThreadPrimitive.Messages>
            {({ message }) => {
              if (message.composer.isEditing) return <EditComposer />;
              if (message.role === "user") return <UserMessage />;
              return <AssistantMessage />;
            }}
          </ThreadPrimitive.Messages>
        </div>

        <ThreadPrimitive.ViewportFooter
          className={cn(
            "aui-thread-viewport-footer bg-background mx-auto flex w-full max-w-(--thread-max-width) flex-col gap-4 overflow-visible pb-4 md:pb-6",
            !isEmpty && "sticky bottom-0 mt-auto rounded-t-(--composer-radius)",
          )}
        >
          <ThreadScrollToBottom />
          {availabilityNotice ? (
            <div
              role="alert"
              className="flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm"
            >
              <TriangleAlertIcon className="mt-0.5 size-4 shrink-0 text-amber-700 dark:text-amber-400" />
              <div className="min-w-0">
                <p className="font-medium text-foreground">{availabilityNotice.title}</p>
                <p className="mt-0.5 text-muted-foreground">{availabilityNotice.description}</p>
              </div>
            </div>
          ) : null}
          <Composer
            disabled={
              chatAvailability === "disabled" ||
              chatAvailability === "needs-setup" ||
              chatAvailability === "access-denied"
            }
          />
        </ThreadPrimitive.ViewportFooter>
      </ThreadPrimitive.Viewport>

      <SelectionToolbar />
    </ThreadPrimitive.Root>
  );
};

const ThreadScrollToBottom: FC = () => {
  return (
    <ThreadPrimitive.ScrollToBottom asChild>
      <TooltipIconButton
        tooltip="Scroll to bottom"
        className="aui-thread-scroll-to-bottom absolute -top-14 z-30 size-10 self-center rounded-full border bg-background p-0 text-foreground shadow-md hover:bg-accent hover:text-accent-foreground disabled:invisible"
      >
        <ArrowDownIcon className="size-4" />
      </TooltipIconButton>
    </ThreadPrimitive.ScrollToBottom>
  );
};

const ThreadWelcome: FC = () => {
  const { assistant } = useBaseConfig();

  return (
    <div className="aui-thread-welcome-root mx-auto mb-6 flex w-full max-w-(--thread-max-width) flex-col items-center px-4 text-center">
      <h1 className="aui-thread-welcome-message-inner fade-in slide-in-from-bottom-1 animate-in fill-mode-both text-primary text-2xl font-semibold duration-200">
        {assistant.welcome.headline}
      </h1>
      {assistant.welcome.body && (
        <p className="text-muted-foreground mt-2 max-w-lg text-sm">
          {assistant.welcome.body}
        </p>
      )}
    </div>
  );
};

const slashIconMap: Record<string, FC<{ className?: string }>> = {
  FileText: FileTextIcon,
  Columns2: Columns2Icon,
};

type ComposerChatIntent = "summarize" | "compare";

function getComposerChatIntent(value: unknown): ComposerChatIntent | undefined {
  return value === "summarize" || value === "compare" ? value : undefined;
}

const Composer: FC<{ disabled?: boolean }> = ({ disabled = false }) => {
  const { assistant } = useBaseConfig();
  const aui = useAui();
  const activeIntent = useAuiState((state) =>
    getComposerChatIntent(state.composer.runConfig.custom?.intent),
  );
  const compareTargetCount = useAuiState((state) => {
    const context = draftContextFromAttachments(
      state.composer.attachments as readonly ComposerContextAttachment[],
    );
    return context.vaults.length + context.folders.length + context.documents.length;
  });
  const hasUnavailableAttachments = useAuiState((state) => hasUnavailableDraftContext(
    draftContextFromAttachments(state.composer.attachments as readonly ComposerContextAttachment[]),
  ));
  const isCompareSelectionIncomplete = activeIntent === "compare" && compareTargetCount < 2;
  function setComposerIntent(intent: ComposerChatIntent | undefined) {
    const composer = aui.composer();
    const runConfig = composer.getState().runConfig;
    const custom = Object.fromEntries(
      Object.entries(runConfig.custom ?? {}).filter(([key]) => key !== "intent"),
    );
    composer.setRunConfig({
      ...runConfig,
      custom: intent ? { ...custom, intent } : custom,
    });
  }

  const slash = unstable_useSlashCommandAdapter({
    commands: assistant.slashCommands.map<Unstable_SlashCommand>((command) => ({
      id: command.id,
      description: command.description,
      icon: command.icon,
      execute: () => setComposerIntent(command.id),
    })),
    removeOnExecute: true,
    iconMap: slashIconMap,
    fallbackIcon: SlashIcon,
  });
  const composerPlaceholder =
    activeIntent === "summarize"
      ? "What should I summarize?"
      : activeIntent === "compare"
        ? "Which documents should I compare?"
        : assistant.labels.composerPlaceholder;
  const ActiveIntentIcon = activeIntent === "compare" ? Columns2Icon : FileTextIcon;
  const activeIntentLabel = activeIntent === "compare" ? "Compare" : "Summarize";

  return (
    <ComposerPrimitive.Unstable_TriggerPopoverRoot>
      <ComposerPrimitive.Root className="aui-composer-root relative flex w-full flex-col">
        <ComposerPrimitive.AttachmentDropzone asChild>
          <fieldset
            data-slot="aui_composer-shell"
            disabled={disabled}
            aria-disabled={disabled}
            className="border-primary/25 data-[dragging=true]:border-ring focus-within:border-primary/60 dark:border-primary/25 dark:focus-within:border-primary/70 flex min-w-0 w-full flex-col gap-2 rounded-(--composer-radius) border bg-(--composer-bg) p-(--composer-padding) shadow-[0_4px_16px_-8px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.04)] transition-[border-color,box-shadow] focus-within:shadow-[0_0_0_1px_var(--color-primary),0_8px_28px_-12px_var(--color-primary)] data-[dragging=true]:border-dashed data-[dragging=true]:bg-[color-mix(in_oklab,var(--color-primary)_12%,var(--color-background))] disabled:cursor-not-allowed disabled:opacity-60 dark:shadow-none"
          >
            {activeIntent && (
              <div className="px-1 pt-1">
                <span className="bg-primary/10 text-primary inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium">
                  <ActiveIntentIcon className="size-3.5" />
                  {activeIntentLabel}
                  <button
                    type="button"
                    onClick={() => setComposerIntent(undefined)}
                    aria-label={`Clear ${activeIntentLabel.toLowerCase()} mode`}
                    className="hover:bg-primary/15 -me-1 inline-flex size-5 items-center justify-center rounded-full transition-colors"
                  >
                    <XIcon className="size-3" />
                  </button>
                </span>
                {isCompareSelectionIncomplete && (
                  <span className="text-muted-foreground ms-2 text-xs">
                    Select at least two attachments
                  </span>
                )}
              </div>
            )}
            <ComposerQuotePreview />
            <ComposerAttachments />
            <ComposerPrimitive.Input
              placeholder={composerPlaceholder}
              onKeyDown={(event) => {
                if (isCompareSelectionIncomplete && event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                }
              }}
              className="aui-composer-input placeholder:text-muted-foreground/80 max-h-32 min-h-10 w-full resize-none bg-transparent px-2.5 py-1 text-base outline-none"
            />
            <ComposerAction
              sendDisabled={isCompareSelectionIncomplete || hasUnavailableAttachments}
              sendDisabledReason={hasUnavailableAttachments
                ? "Remove unavailable attachments to continue"
                : undefined}
            />
          </fieldset>
        </ComposerPrimitive.AttachmentDropzone>

        <ComposerTriggerPopover
          char="/"
          {...slash}
          emptyItemsLabel="No matching commands"
        />
      </ComposerPrimitive.Root>
    </ComposerPrimitive.Unstable_TriggerPopoverRoot>
  );
};

const ComposerAction: FC<{ sendDisabled?: boolean; sendDisabledReason?: string }> = ({
  sendDisabled = false,
  sendDisabledReason,
}) => {
  return (
    <div className="aui-composer-action-wrapper relative flex items-center justify-between">
      <div className="flex items-center gap-1">
        <ChatContextPicker />
        <ModelPicker />
      </div>
      <div className="flex items-center gap-1.5">
        <AuiIf condition={(s) => s.thread.capabilities.dictation}>
          <AuiIf condition={(s) => s.composer.dictation == null}>
            <ComposerPrimitive.Dictate asChild>
              <TooltipIconButton
                tooltip="Voice input"
                side="bottom"
                type="button"
                variant="ghost"
                size="icon"
                className="aui-composer-dictate size-7 rounded-full"
                aria-label="Start voice input"
              >
                <MicIcon className="aui-composer-dictate-icon size-4" />
              </TooltipIconButton>
            </ComposerPrimitive.Dictate>
          </AuiIf>
          <AuiIf condition={(s) => s.composer.dictation != null}>
            <ComposerPrimitive.StopDictation asChild>
              <TooltipIconButton
                tooltip="Stop dictation"
                side="bottom"
                type="button"
                variant="ghost"
                size="icon"
                className="aui-composer-stop-dictation text-destructive size-7 rounded-full"
                aria-label="Stop voice input"
              >
                <SquareIcon className="aui-composer-stop-dictation-icon size-3.5 animate-pulse fill-current" />
              </TooltipIconButton>
            </ComposerPrimitive.StopDictation>
          </AuiIf>
        </AuiIf>
        <AuiIf condition={(s) => !s.thread.isRunning}>
          <ComposerPrimitive.Send asChild>
            <TooltipIconButton
              tooltip={sendDisabled ? sendDisabledReason ?? "Select at least two attachments" : "Send message"}
              side="bottom"
              type="button"
              variant="default"
              size="icon"
              className="aui-composer-send size-7 rounded-full"
              aria-label="Send message"
              disabled={sendDisabled}
            >
              <ArrowUpIcon className="aui-composer-send-icon size-4.5" />
            </TooltipIconButton>
          </ComposerPrimitive.Send>
        </AuiIf>
        <AuiIf condition={(s) => s.thread.isRunning}>
          <ComposerPrimitive.Cancel asChild>
            <Button
              type="button"
              variant="default"
              size="icon"
              className="aui-composer-cancel size-7 rounded-full"
              aria-label="Stop generating"
            >
              <SquareIcon className="aui-composer-cancel-icon size-3.5 fill-current" />
            </Button>
          </ComposerPrimitive.Cancel>
        </AuiIf>
      </div>
    </div>
  );
};

const MessageError: FC = () => {
  return (
    <MessagePrimitive.Error>
      <ErrorPrimitive.Root className="aui-message-error-root border-destructive bg-destructive/10 text-destructive dark:bg-destructive/5 mt-2 rounded-md border p-3 text-sm dark:text-red-200">
        <ErrorPrimitive.Message className="aui-message-error-message line-clamp-2" />
      </ErrorPrimitive.Root>
    </MessagePrimitive.Error>
  );
};

const AssistantWorkingIndicator: FC = () => {
  const isEmpty = useAuiState((s) => s.message.content.length === 0);
  if (isEmpty) {
    return (
      <span
        data-slot="aui_assistant-message-indicator"
        className="text-muted-foreground inline-flex items-center gap-2 align-middle"
      >
        <DotMatrix state="connecting" aria-hidden />
        <span className="text-sm">Connecting</span>
      </span>
    );
  }
  return (
    <span
      data-slot="aui_assistant-message-indicator"
      className="animate-pulse font-sans"
      aria-label="Assistant is working"
    >
      {"●"}
    </span>
  );
};

const AssistantMessage: FC = () => {
  // reserves space for action bar and compensates with `-mb` for consistent msg spacing
  // keeps hovered action bar from shifting layout (autohide doesn't support absolute positioning well)
  // for pt-[n] use -mb-[n + 6] & min-h-[n + 6] to preserve compensation
  const ACTION_BAR_PT = "pt-1.5";
  const ACTION_BAR_HEIGHT = `-mb-7.5 min-h-7.5 ${ACTION_BAR_PT}`;

  return (
    <MessagePrimitive.Root
      data-slot="aui_assistant-message-root"
      data-role="assistant"
      className="fade-in slide-in-from-bottom-1 animate-in relative mx-auto w-full max-w-(--thread-max-width) duration-150"
    >
      <div
        data-slot="aui_assistant-message-content"
        className="text-foreground px-2 leading-relaxed wrap-break-word"
      >
        <MessagePrimitive.GroupedParts
          groupBy={groupPartByType({
            reasoning: ["group-chainOfThought", "group-reasoning"],
            "tool-call": ["group-chainOfThought", "group-tool"],
            "standalone-tool-call": [],
          })}
        >
          {({ part, children }) => {
            switch (part.type) {
              case "group-chainOfThought":
                return <div data-slot="aui_chain-of-thought">{children}</div>;
              case "group-tool":
                return (
                  <ToolGroupRoot variant="ghost">
                    <ToolGroupTrigger
                      count={part.indices.length}
                      active={part.status.type === "running"}
                    />
                    <ToolGroupContent>{children}</ToolGroupContent>
                  </ToolGroupRoot>
                );
              case "group-reasoning": {
                const running = part.status.type === "running";
                return (
                  <ReasoningRoot streaming={running}>
                    <ReasoningTrigger active={running} />
                    <ReasoningContent aria-busy={running}>
                      <ReasoningText>{children}</ReasoningText>
                    </ReasoningContent>
                  </ReasoningRoot>
                );
              }
              case "text":
                return <MarkdownText />;
              case "reasoning":
                return <Reasoning {...part} />;
              case "tool-call":
                return part.toolUI ?? <ToolFallback {...part} />;
              case "indicator":
                return <AssistantWorkingIndicator />;
              case "data":
                if (part.name === "citations") return <CitationData data={part.data} />;
                return part.dataRendererUI;
              default:
                return null;
            }
          }}
        </MessagePrimitive.GroupedParts>
        <MessageError />
      </div>

      <div
        data-slot="aui_assistant-message-footer"
        className={cn("ml-2 flex items-center", ACTION_BAR_HEIGHT)}
      >
        <BranchPicker />
        <AssistantActionBar />
      </div>
    </MessagePrimitive.Root>
  );
};

const AssistantActionBar: FC = () => {
  return (
    <ActionBarPrimitive.Root
      hideWhenRunning
      autohide="not-last"
      className="aui-assistant-action-bar-root text-muted-foreground animate-in fade-in col-start-3 row-start-2 -ml-1 flex gap-1 duration-200"
    >
      <ActionBarPrimitive.Copy asChild>
        <TooltipIconButton tooltip="Copy">
          <AuiIf condition={(s) => s.message.isCopied}>
            <CheckIcon className="animate-in zoom-in-50 fade-in duration-200 ease-out" />
          </AuiIf>
          <AuiIf condition={(s) => !s.message.isCopied}>
            <CopyIcon className="animate-in zoom-in-75 fade-in duration-150" />
          </AuiIf>
        </TooltipIconButton>
      </ActionBarPrimitive.Copy>
      <ActionBarPrimitive.Reload asChild>
        <TooltipIconButton tooltip="Refresh">
          <RefreshCwIcon />
        </TooltipIconButton>
      </ActionBarPrimitive.Reload>
      <ActionBarMorePrimitive.Root>
        <ActionBarMorePrimitive.Trigger asChild>
          <TooltipIconButton
            tooltip="More"
            className="data-[state=open]:bg-accent"
          >
            <MoreHorizontalIcon />
          </TooltipIconButton>
        </ActionBarMorePrimitive.Trigger>
        <ActionBarMorePrimitive.Content
          side="bottom"
          align="start"
          sideOffset={6}
          className="aui-action-bar-more-content bg-popover/95 text-popover-foreground data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[state=open]:animate-in data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=closed]:animate-out data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 z-50 min-w-[8rem] overflow-hidden rounded-xl border p-1.5 shadow-lg backdrop-blur-sm"
        >
          <ActionBarPrimitive.ExportMarkdown asChild>
            <ActionBarMorePrimitive.Item className="aui-action-bar-more-item hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm outline-none select-none">
              <DownloadIcon className="size-4" />
              Export as Markdown
            </ActionBarMorePrimitive.Item>
          </ActionBarPrimitive.ExportMarkdown>
        </ActionBarMorePrimitive.Content>
      </ActionBarMorePrimitive.Root>
      <MessageTiming />
    </ActionBarPrimitive.Root>
  );
};

const UserMessage: FC = () => {
  return (
    <MessagePrimitive.Root
      data-slot="aui_user-message-root"
      data-role="user"
      className="fade-in slide-in-from-bottom-1 animate-in mx-auto grid w-full max-w-(--thread-max-width) auto-rows-auto grid-cols-[minmax(72px,1fr)_auto] content-start gap-y-2 px-2 duration-150 [&:where(>*)]:col-start-2"
    >
      <UserMessageAttachments>
        <UserMessageContextAttachments />
      </UserMessageAttachments>

      <div className="aui-user-message-content-wrapper relative col-start-2 min-w-0">
        <div className="aui-user-message-content peer bg-muted text-foreground rounded-xl px-4 py-2 wrap-break-word empty:hidden">
          <MessagePrimitive.Quote>
            {(quote) => <QuoteBlock {...quote} />}
          </MessagePrimitive.Quote>
          <MessagePrimitive.Parts components={{ Text: DirectiveText }} />
        </div>
        <div className="aui-user-action-bar-wrapper absolute top-1/2 left-0 -translate-x-full -translate-y-1/2 pr-2 peer-empty:hidden">
          <UserActionBar />
        </div>
      </div>

      <BranchPicker
        data-slot="aui_user-branch-picker"
        className="col-span-full col-start-1 row-start-3 -mr-1 justify-end"
      />
    </MessagePrimitive.Root>
  );
};

const UserMessageContextAttachments: FC = () => {
  const contextSnapshot = useAuiState((state) => {
    const metadata = state.message.metadata as
      | { custom?: { contextSnapshot?: unknown } }
      | undefined;
    return metadata?.custom?.contextSnapshot;
  });
  const context = useMemo(
    () => draftContextFromSnapshot(contextSnapshot),
    [contextSnapshot],
  );
  const isGlobalContext =
    contextSnapshot !== null &&
    typeof contextSnapshot === "object" &&
    !Array.isArray(contextSnapshot) &&
    (contextSnapshot as { type?: unknown }).type === "global";

  if (isGlobalContext) return null;

  return (
    <>
      {context.vaults.map((vault) => (
        <div
          key={`vault:${vault.vaultId}`}
          className="flex h-14 max-w-52 items-center gap-2 rounded-md border bg-background px-3 text-sm shadow-sm"
          title={vault.name ?? "Vault"}
        >
          <VaultIcon className="size-5 shrink-0 text-muted-foreground" />
          <span className="truncate font-medium">{vault.name ?? "Vault"}</span>
        </div>
      ))}
      {context.documents.map((document) => (
        <div
          key={`document:${document.vaultId}:${document.documentId}`}
          className="flex h-14 max-w-52 items-center gap-2 rounded-md border bg-background px-3 text-sm shadow-sm"
          title={document.name ?? "Document"}
        >
          <FileTextIcon className="size-5 shrink-0 text-muted-foreground" />
          <span className="truncate font-medium">{document.name ?? "Document"}</span>
        </div>
      ))}
    </>
  );
};

const UserActionBar: FC = () => {
  return (
    <ActionBarPrimitive.Root
      hideWhenRunning
      autohide="not-last"
      className="aui-user-action-bar-root flex flex-col items-end"
    >
      <ActionBarPrimitive.Edit asChild>
        <TooltipIconButton tooltip="Edit" className="aui-user-action-edit">
          <PencilIcon />
        </TooltipIconButton>
      </ActionBarPrimitive.Edit>
    </ActionBarPrimitive.Root>
  );
};

const EditComposer: FC = () => {
  return (
    <MessagePrimitive.Root
      data-slot="aui_edit-composer-wrapper"
      className="mx-auto flex w-full max-w-(--thread-max-width) flex-col px-2"
    >
      <ComposerPrimitive.Unstable_TriggerPopoverRoot>
        <ComposerPrimitive.Root className="aui-edit-composer-root border-border/60 dark:border-muted-foreground/15 ml-auto flex w-full max-w-[85%] flex-col rounded-(--composer-radius) border bg-(--composer-bg) shadow-[0_4px_16px_-8px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.04)] dark:shadow-none">
          <ComposerPrimitive.Input
            autoFocus
            className="aui-edit-composer-input text-foreground min-h-14 w-full resize-none bg-transparent px-4 pt-3 pb-1 text-base outline-none"
          />
          <div className="aui-edit-composer-footer mx-2.5 mb-2.5 flex items-center gap-1.5 self-end">
            <ComposerPrimitive.Cancel asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 rounded-full px-3.5"
              >
                Cancel
              </Button>
            </ComposerPrimitive.Cancel>
            <ComposerPrimitive.Send asChild>
              <Button size="sm" className="h-8 rounded-full px-3.5">
                Update
              </Button>
            </ComposerPrimitive.Send>
          </div>
        </ComposerPrimitive.Root>
      </ComposerPrimitive.Unstable_TriggerPopoverRoot>
    </MessagePrimitive.Root>
  );
};

const BranchPicker: FC<BranchPickerPrimitive.Root.Props> = ({
  className,
  ...rest
}) => {
  return (
    <BranchPickerPrimitive.Root
      hideWhenSingleBranch
      className={cn(
        "aui-branch-picker-root text-muted-foreground mr-2 -ml-2 inline-flex items-center text-xs",
        className,
      )}
      {...rest}
    >
      <BranchPickerPrimitive.Previous asChild>
        <TooltipIconButton tooltip="Previous">
          <ChevronLeftIcon />
        </TooltipIconButton>
      </BranchPickerPrimitive.Previous>
      <span className="aui-branch-picker-state font-medium">
        <BranchPickerPrimitive.Number /> / <BranchPickerPrimitive.Count />
      </span>
      <BranchPickerPrimitive.Next asChild>
        <TooltipIconButton tooltip="Next">
          <ChevronRightIcon />
        </TooltipIconButton>
      </BranchPickerPrimitive.Next>
    </BranchPickerPrimitive.Root>
  );
};

export const Base: FC<{ chatAvailability: ChatAvailability }> = ({ chatAvailability }) => {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  return (
    <div className="bg-background flex h-full min-h-0 w-full">
      <aside
        className={cn(
          "bg-muted/20 hidden min-h-0 shrink-0 flex-col border-r transition-[width] duration-200 md:flex",
          sidebarCollapsed ? "w-12" : "w-72",
        )}
      >
        <div
          className={cn(
            "flex shrink-0 items-center border-b transition-[padding] duration-200",
            sidebarCollapsed ? "justify-center px-2 py-3" : "gap-3 px-4 py-3",
          )}
        >
          {!sidebarCollapsed && (
            <div className="min-w-0 flex-1">
              <h2 className="text-sm font-medium">Conversations</h2>
            </div>
          )}
          <TooltipIconButton
            tooltip={
              sidebarCollapsed ? "Show conversations" : "Hide conversations"
            }
            side="bottom"
            variant="ghost"
            size="icon"
            className="size-8 shrink-0"
            onClick={() => setSidebarCollapsed((value) => !value)}
          >
            {sidebarCollapsed ? (
              <ChevronRightIcon className="size-4" />
            ) : (
              <ChevronLeftIcon className="size-4" />
            )}
          </TooltipIconButton>
        </div>
        {sidebarCollapsed ? (
          <div className="flex flex-col items-center gap-1 p-2">
            <ThreadListPrimitive.New asChild>
              <TooltipIconButton
                tooltip="New thread"
                side="right"
                variant="ghost"
                size="icon"
                className="size-8"
              >
                <PlusIcon className="size-4" />
              </TooltipIconButton>
            </ThreadListPrimitive.New>
          </div>
        ) : (
          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            <ThreadList />
          </div>
        )}
      </aside>
      <main className="min-w-0 flex-1 overflow-hidden">
        <Thread chatAvailability={chatAvailability} />
      </main>
    </div>
  );
};

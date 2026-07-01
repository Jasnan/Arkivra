"use client"

import { useEffect, useRef, useState } from "react"
import { Menu, MessageSquarePlus, X } from "lucide-react"

import { TooltipProvider } from "@/components/ui/tooltip"
import { Button } from "@/components/ui/button"
import {
  addDocumentsToDraftContext,
  addVaultsToDraftContext,
  createEmptyDraftContext,
  hydrateDraftContextLabels,
  removeDocumentFromDraftContext,
  removeVaultFromDraftContext,
  type DraftChatContext,
} from "../chat-context-model"
import {
  DocumentSelectionDialog,
  useChatContextVaults,
  VaultSelectionDialog,
} from "./chat-context-dialogs"
import { ConversationList } from "./conversation-list"
import { ChatHeader } from "./chat-header"
import { MessageList } from "./message-list"
import { MessageInput } from "./message-input"
import {
  getChatModelOptions,
  getUserUiPreferences,
  type ChatResponseMode,
} from "../chat.api"
import {
  DEFAULT_CHAT_RESPONSE_MODE,
  getCachedDefaultChatResponseMode,
  isChatResponseMode,
} from "../chat-model-utils"
import { useChat, type Conversation, type Message, type User } from "@/app/chat/use-chat"

const NEW_CHAT_DRAFT_ID = "__new_chat_draft__"

interface ChatProps {
  conversations: Conversation[]
  messages: Record<string, Message[]>
  users: User[]
}

export function Chat({
  conversations,
  messages,
  users,
}: ChatProps) {
  const {
    conversations: chatConversations,
    messages: chatMessages,
    users: chatUsers,
    selectedConversation,
    setSelectedConversation,
    setConversations,
    addConversation,
    setMessages,
    setUsers,
    addMessage,
    toggleMute,
  } = useChat()

  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  const [draftContext, setDraftContext] = useState<DraftChatContext>(() => createEmptyDraftContext())
  const [isVaultDialogOpen, setIsVaultDialogOpen] = useState(false)
  const [isDocumentDialogOpen, setIsDocumentDialogOpen] = useState(false)
  const [responseMode, setResponseMode] = useState<ChatResponseMode>(() =>
    getCachedDefaultChatResponseMode()
  )
  const [selectedModel, setSelectedModel] = useState("")
  const [availableModels, setAvailableModels] = useState<string[]>([])
  const [defaultModel, setDefaultModel] = useState("")
  const [isLoadingModels, setIsLoadingModels] = useState(true)
  const [modelOptionsError, setModelOptionsError] = useState<string | null>(null)
  const [hasManualResponseMode, setHasManualResponseMode] = useState(false)
  const hasInitializedChatRef = useRef(false)
  const vaultsQuery = useChatContextVaults()
  const hydratedDraftContext = hydrateDraftContextLabels({
    context: draftContext,
    vaults: vaultsQuery.vaults,
  })
  const resolvedSelectedModel =
    selectedModel && availableModels.includes(selectedModel)
      ? selectedModel
      : defaultModel && availableModels.includes(defaultModel)
        ? defaultModel
        : ""

  // Close sidebar when clicking outside on mobile
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 1024) { // lg breakpoint
        setIsSidebarOpen(false)
      }
    }

    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  // Initialize data
  useEffect(() => {
    if (hasInitializedChatRef.current) {
      return
    }

    hasInitializedChatRef.current = true
    setConversations(conversations)
    setUsers(users)
    
    // Set messages for all conversations
    Object.entries(messages).forEach(([conversationId, conversationMessages]) => {
      setMessages(conversationId, conversationMessages)
    })

    // Auto-select first conversation if none selected
    if (!selectedConversation && conversations.length > 0) {
      setSelectedConversation(conversations[0].id)
    }
  }, [conversations, messages, users, selectedConversation, setConversations, setMessages, setUsers, setSelectedConversation])

  useEffect(() => {
    let isCurrent = true

    async function loadDefaultResponseMode() {
      try {
        const result = await getUserUiPreferences()
        const defaultChatAnswerMode = result.preferences.defaultChatAnswerMode
        if (!isCurrent || hasManualResponseMode || !isChatResponseMode(defaultChatAnswerMode)) {
          return
        }

        setResponseMode(defaultChatAnswerMode)
      } catch {
        if (!isCurrent || hasManualResponseMode) {
          return
        }

        setResponseMode((current) => current ?? DEFAULT_CHAT_RESPONSE_MODE)
      }
    }

    void loadDefaultResponseMode()

    return () => {
      isCurrent = false
    }
  }, [hasManualResponseMode])

  useEffect(() => {
    let isCurrent = true

    async function loadChatModelOptions() {
      setIsLoadingModels(true)
      setModelOptionsError(null)

      try {
        const result = await getChatModelOptions()
        if (!isCurrent) return

        setAvailableModels(result.options.models)
        setDefaultModel(result.options.defaultModel)
      } catch (error) {
        if (!isCurrent) return

        setAvailableModels([])
        setDefaultModel("")
        setModelOptionsError(
          error instanceof Error
            ? error.message
            : "Could not load available models for this chat."
        )
      } finally {
        if (isCurrent) {
          setIsLoadingModels(false)
        }
      }
    }

    void loadChatModelOptions()

    return () => {
      isCurrent = false
    }
  }, [])

  const currentConversation = chatConversations.find(conv => conv.id === selectedConversation)
  const currentMessages = selectedConversation ? chatMessages[selectedConversation] || [] : []

  const handleCreateConversation = () => {
    const existingDraft = chatConversations.find((conversation) => conversation.id === NEW_CHAT_DRAFT_ID)

    if (existingDraft) {
      setSelectedConversation(existingDraft.id)
      setIsSidebarOpen(false)
      return
    }

    const now = new Date().toISOString()
    const draftConversation: Conversation = {
      id: NEW_CHAT_DRAFT_ID,
      type: "direct",
      participants: [],
      name: "New chat",
      avatar: "",
      lastMessage: {
        id: "",
        content: "",
        timestamp: now,
        senderId: "current-user",
      },
      unreadCount: 0,
      isPinned: false,
      isMuted: false,
    }

    addConversation(draftConversation)
    setSelectedConversation(draftConversation.id)
    setDraftContext(createEmptyDraftContext())
    setIsSidebarOpen(false)
  }

  const handleSendMessage = (content: string) => {
    if (!selectedConversation) return

    if (selectedConversation === NEW_CHAT_DRAFT_ID) {
      const title = content.length > 60 ? `${content.slice(0, 57)}...` : content
      setConversations(
        chatConversations.map((conversation) =>
          conversation.id === NEW_CHAT_DRAFT_ID
            ? { ...conversation, name: title || "New chat" }
            : conversation
        )
      )
    }

    const newMessage = {
      id: `msg-${Date.now()}`,
      content,
      timestamp: new Date().toISOString(),
      senderId: "current-user",
      type: "text" as const,
      isEdited: false,
      reactions: [],
      replyTo: null,
    }

    addMessage(selectedConversation, newMessage)
  }

  const handleToggleMute = () => {
    if (selectedConversation) {
      toggleMute(selectedConversation)
    }
  }

  return (
    <TooltipProvider delayDuration={0}>
      <div className="h-full min-h-[600px] max-h-[calc(100vh-200px)] flex rounded-lg border overflow-hidden bg-background">
        {/* Mobile Sidebar Overlay */}
        {isSidebarOpen && (
          <div 
            className="fixed inset-0 bg-black/50 z-40 lg:hidden"
            onClick={() => setIsSidebarOpen(false)}
          />
        )}

        {/* Conversations Sidebar - Responsive */}
        <div className={`
          w-100 border-r bg-background flex-shrink-0
          ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
          lg:relative lg:block
          fixed inset-y-0 left-0 z-50
          transition-transform duration-300 ease-in-out
        `}>
          {/* Sidebar Header with Close Button (Mobile Only) */}
          <div className="lg:hidden p-4 border-b flex items-center justify-between bg-background">
            <h2 className="text-lg font-semibold">Messages</h2>
            <div className="flex items-center gap-1">
              <Button
                type="button"
                variant="outline"
                size="icon"
                aria-label="New chat"
                title="New chat"
                onClick={handleCreateConversation}
                className="h-8 w-8 cursor-pointer"
              >
                <MessageSquarePlus className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsSidebarOpen(false)}
                className="cursor-pointer"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <ConversationList
            conversations={chatConversations}
            selectedConversation={selectedConversation}
            onSelectConversation={(id) => {
              setSelectedConversation(id)
              setIsSidebarOpen(false) // Close sidebar on mobile after selection
            }}
            onCreateConversation={handleCreateConversation}
          />
        </div>

        {/* Chat Panel - Flexible Width */}
        <div className="flex-1 flex flex-col min-w-0 bg-background">
          {/* Chat Header with Hamburger Menu */}
          <div className="flex items-center h-16 px-4 border-b bg-background">
            {/* Hamburger Menu Button - Only visible when sidebar is hidden on mobile */}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsSidebarOpen(true)}
              className="cursor-pointer lg:hidden mr-2"
            >
              <Menu className="h-4 w-4" />
            </Button>

            <div className="flex-1">
              <ChatHeader
                conversation={currentConversation || null}
                responseMode={responseMode}
                modelOptions={availableModels}
                selectedModel={resolvedSelectedModel}
                isLoadingModels={isLoadingModels}
                modelOptionsError={modelOptionsError}
                onResponseModeChange={(nextValue) => {
                  setHasManualResponseMode(true)
                  setResponseMode(nextValue)
                }}
                onSelectedModelChange={setSelectedModel}
                onToggleMute={handleToggleMute}
              />
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 flex flex-col min-h-0">
            {selectedConversation ? (
              <>
                <MessageList
                  messages={currentMessages}
                  users={chatUsers}
                />
                
                {/* Message Input */}
                <MessageInput
                  onSendMessage={handleSendMessage}
                  placeholder={`Message ${currentConversation?.name || ""}...`}
                  context={hydratedDraftContext}
                  onAddVaults={() => setIsVaultDialogOpen(true)}
                  onAddDocuments={() => setIsDocumentDialogOpen(true)}
                  onRemoveVault={(vault) =>
                    setDraftContext((current) =>
                      removeVaultFromDraftContext(current, vault.vaultId)
                    )
                  }
                  onRemoveDocument={(document) =>
                    setDraftContext((current) =>
                      removeDocumentFromDraftContext(current, document)
                    )
                  }
                />
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center">
                <div className="text-center">
                  <h3 className="text-lg font-semibold mb-2">Welcome to Chat</h3>
                  <p className="text-muted-foreground">
                    Select a conversation to start messaging
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <VaultSelectionDialog
        open={isVaultDialogOpen}
        vaults={vaultsQuery.vaults}
        isLoading={vaultsQuery.isLoading}
        error={vaultsQuery.error}
        onOpenChange={setIsVaultDialogOpen}
        onConfirm={(vaults) =>
          setDraftContext((current) => addVaultsToDraftContext(current, vaults))
        }
      />
      <DocumentSelectionDialog
        open={isDocumentDialogOpen}
        context={hydratedDraftContext}
        vaults={vaultsQuery.vaults}
        onOpenChange={setIsDocumentDialogOpen}
        onConfirm={(documents) =>
          setDraftContext((current) => addDocumentsToDraftContext(current, documents))
        }
      />
    </TooltipProvider>
  )
}

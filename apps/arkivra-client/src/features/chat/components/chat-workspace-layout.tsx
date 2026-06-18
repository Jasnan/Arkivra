import type { ComponentProps } from 'react';
import {
  Box,
  CloseButton,
  Drawer,
  Flex,
  Portal,
  Skeleton,
  Status,
  Text,
} from '@chakra-ui/react';
import { AlertCircle, MessageSquare, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { AssistantChatRuntimeState } from './assistant-chat-runtime';
import { ChatConversationRail } from './chat-conversation-rail';
import type { DraftChatContext, DraftChatDocument, DraftChatVault } from './chat-context-selector';
import {
  ConversationForkDialog,
  DocumentSelectionDialog,
  VaultSelectionDialog,
} from './chat-context-selector';
import type { VaultSummary } from '@/features/vaults/vaults.types';

type ChatConversationRailProps = ComponentProps<typeof ChatConversationRail>;

export function ChatWorkspaceBanners({
  aiAccessMessage,
  canUseChat,
  contextUnavailableMessage,
  isContextReadOnly,
  runtimeState,
  showContextReadOnlyBanner,
  onDismissContextWarning,
}: {
  aiAccessMessage: string;
  canUseChat: boolean;
  contextUnavailableMessage: string;
  isContextReadOnly: boolean;
  runtimeState: AssistantChatRuntimeState;
  showContextReadOnlyBanner: boolean;
  onDismissContextWarning: () => void;
}) {
  return (
    <Box minH="0">
      {runtimeState.error ? (
        <Flex
          align="center"
          gap="2"
          borderBottomWidth="1px"
          borderColor="border"
          bg="bg.error"
          px="4"
          py="3"
          fontSize="sm"
          color="fg.error"
          sm={{ px: '6' }}
        >
          <AlertCircle size={16} />
          {runtimeState.error.message}
        </Flex>
      ) : null}
      {showContextReadOnlyBanner ? (
        <Box px="4" pt={{ base: '4', md: '5' }} sm={{ px: '6' }}>
          <Flex
            align="flex-start"
            gap="4"
            mx="auto"
            maxW="72rem"
            rounded="xl"
            borderWidth="1px"
            borderColor="orange.muted"
            bg="orange.subtle"
            px={{ base: '4', md: '5' }}
            py="4"
            color="fg"
            shadow="xs"
          >
            <Flex
              mt="0.5"
              boxSize="7"
              align="center"
              justify="center"
              rounded="full"
              color="orange.fg"
              flexShrink="0"
            >
              <AlertCircle size={22} />
            </Flex>
            <Box minW="0" flex="1">
              <Text fontSize="sm" fontWeight="semibold" color="orange.fg">
                Source context unavailable
              </Text>
              <Text mt="1.5" fontSize="sm" color="fg">
                {contextUnavailableMessage}
              </Text>
            </Box>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Dismiss source document warning"
              color="fg.muted"
              flexShrink="0"
              style={{ height: '2rem', width: '2rem', borderRadius: '0.5rem' }}
              onClick={onDismissContextWarning}
            >
              <X size={18} />
            </Button>
          </Flex>
        </Box>
      ) : null}
      {!canUseChat && !isContextReadOnly ? (
        <Flex
          align="center"
          gap="2"
          borderBottomWidth="1px"
          borderColor="border"
          bg="bg.warning"
          px="4"
          py="3"
          fontSize="sm"
          color="fg.warning"
          sm={{ px: '6' }}
        >
          <AlertCircle size={16} />
          {aiAccessMessage}
        </Flex>
      ) : null}
    </Box>
  );
}

export function ChatMobileConversationDrawer({
  open,
  railProps,
  onOpenChange,
}: {
  open: boolean;
  railProps: ChatConversationRailProps;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Box
      display={{ base: 'block', lg: 'none' }}
      w="full"
      maxW="full"
      borderBottomWidth="1px"
      borderColor="border.surface"
      px="4"
      py="3"
      minW="0"
      overflowX="hidden"
      sm={{ px: '6' }}
    >
      <Drawer.Root
        open={open}
        placement="bottom"
        size="full"
        onOpenChange={(event) => onOpenChange(event.open)}
      >
        <Drawer.Trigger asChild>
          <Button
            type="button"
            variant="ghost"
            w="full"
            justifyContent="space-between"
            px="0"
            color="fg"
            _hover={{ bg: 'transparent', color: 'teal.fg' }}
          >
            <Flex align="center" gap="2" minW="0" fontSize="sm" fontWeight="semibold">
              <MessageSquare size={16} color="var(--chakra-colors-teal-fg)" />
              <Text as="span">Conversations</Text>
            </Flex>
            <Text as="span" flexShrink="0" fontSize="sm" fontWeight="medium" color="fg.muted">
              Show history
            </Text>
          </Button>
        </Drawer.Trigger>
        <Portal>
          <Drawer.Backdrop bg="blackAlpha.500" />
          <Drawer.Positioner>
            <Drawer.Content maxH="84vh" roundedTop="xl" bg="bg.sidebar">
              <Drawer.Header borderBottomWidth="1px" borderColor="border.surface" px="5" py="4">
                <Flex align="center" justify="space-between" gap="4" pr="8">
                  <Box minW="0">
                    <Drawer.Title fontSize="lg" fontWeight="semibold">
                      Conversations
                    </Drawer.Title>
                    <Drawer.Description srOnly>Chat conversation history</Drawer.Description>
                  </Box>
                </Flex>
              </Drawer.Header>
              <Drawer.Body
                display="flex"
                minH="0"
                flexDirection="column"
                overflow="hidden"
                px="5"
                py="4"
              >
                <ChatConversationRail {...railProps} />
              </Drawer.Body>
              <Drawer.CloseTrigger asChild>
                <CloseButton
                  size="sm"
                  position="absolute"
                  top="3"
                  right="3"
                  aria-label="Close conversations"
                />
              </Drawer.CloseTrigger>
            </Drawer.Content>
          </Drawer.Positioner>
        </Portal>
      </Drawer.Root>
    </Box>
  );
}

export function ChatWorkspaceContextDialogs({
  context,
  createConversationPending,
  documentDialogOpen,
  forkDialogOpen,
  nextContext,
  vaultDialogOpen,
  vaults,
  onConfirmDocuments,
  onConfirmFork,
  onConfirmVaults,
  onDocumentDialogOpenChange,
  onForkDialogOpenChange,
  onVaultDialogOpenChange,
}: {
  context: DraftChatContext;
  createConversationPending: boolean;
  documentDialogOpen: boolean;
  forkDialogOpen: boolean;
  nextContext: DraftChatContext;
  vaultDialogOpen: boolean;
  vaults: VaultSummary[];
  onConfirmDocuments: (documents: DraftChatDocument[]) => void;
  onConfirmFork: () => void;
  onConfirmVaults: (vaults: DraftChatVault[]) => void;
  onDocumentDialogOpenChange: (open: boolean) => void;
  onForkDialogOpenChange: (open: boolean) => void;
  onVaultDialogOpenChange: (open: boolean) => void;
}) {
  return (
    <>
      <VaultSelectionDialog
        open={vaultDialogOpen}
        context={context}
        vaults={vaults}
        onOpenChange={onVaultDialogOpenChange}
        onConfirm={onConfirmVaults}
      />
      <DocumentSelectionDialog
        open={documentDialogOpen}
        context={context}
        vaults={vaults}
        onOpenChange={onDocumentDialogOpenChange}
        onConfirm={onConfirmDocuments}
      />
      <ConversationForkDialog
        open={forkDialogOpen}
        isPending={createConversationPending}
        currentContext={context}
        nextContext={nextContext}
        onOpenChange={onForkDialogOpenChange}
        onConfirm={onConfirmFork}
      />
    </>
  );
}

export function ChatConversationSkeleton() {
  return (
    <Flex
      direction="column"
      gap="5"
      mx="auto"
      w="100%"
      maxW="72rem"
      px="4"
      py={{ base: '5', md: '6' }}
      sm={{ px: '6' }}
    >
      <Status.Root colorPalette="teal" size="sm" color="fg.muted">
        <Status.Indicator />
        Loading conversation
      </Status.Root>

      <Flex gap="3" align="flex-start">
        <Skeleton boxSize="9" rounded="lg" flexShrink="0" />
        <Box
          w="100%"
          maxW="44rem"
          rounded="lg"
          borderWidth="1px"
          borderColor="border.surface"
          bg="bg.surface"
          px="5"
          py="4"
        >
          <Skeleton h="4" maxW="82%" mb="3" />
          <Skeleton h="4" maxW="96%" mb="3" />
          <Skeleton h="4" maxW="64%" />
        </Box>
      </Flex>

      <Flex gap="3" justify="flex-end">
        <Box w="100%" maxW="32rem" rounded="xl" bg="teal.subtle" px="4" py="3">
          <Skeleton h="4" maxW="92%" mb="3" />
          <Skeleton h="4" maxW="54%" />
        </Box>
        <Skeleton boxSize="9" rounded="lg" flexShrink="0" />
      </Flex>
    </Flex>
  );
}

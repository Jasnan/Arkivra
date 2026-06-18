import type { ReactNode } from 'react';
import { Box, CloseButton, Flex, Stack, Text } from '@chakra-ui/react';
import { FileText, Vault } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  documentKey,
  isDraftContextEmpty,
  normalizeDraftContext,
  vaultKey,
} from './chat-context-model';
import type { DraftChatContext } from './chat-context-model';

export function ConversationForkDialog({
  open,
  isPending,
  currentContext,
  nextContext,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  isPending?: boolean;
  currentContext: DraftChatContext;
  nextContext: DraftChatContext;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={open} size="md" onOpenChange={onOpenChange}>
      <DialogContent hideCloseButton>
        <DialogClose asChild>
          <CloseButton
            size="sm"
            position="absolute"
            top="3"
            right="3"
            aria-label="Close context change dialog"
          />
        </DialogClose>
        <DialogHeader style={{ padding: '1.25rem 3.5rem 0.75rem 1.25rem' }}>
          <DialogTitle>Start a new conversation with updated context?</DialogTitle>
          <DialogDescription>
            Conversations preserve their original document and vault context to keep references,
            retrieval results, and answers consistent over time.
          </DialogDescription>
        </DialogHeader>
        <DialogBody asChild>
          <Stack gap="4" px="5" pb="4">
            <Stack gap="2" color="fg.muted" fontSize="sm" lineHeight="1.55">
              <Text>
                Adding or removing documents or vaults creates a new conversation with the updated
                context.
              </Text>
              <Text>Your current conversation will remain unchanged.</Text>
            </Stack>
            <ConversationContextPreview
              title="Current Conversation Context"
              context={currentContext}
            />
            <ConversationContextPreview
              title="New Conversation Context"
              context={nextContext}
              emphasized
            />
          </Stack>
        </DialogBody>
        <DialogFooter style={{ padding: '0 1.25rem 1.25rem' }}>
          <Button
            type="button"
            variant="outline"
            disabled={isPending}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button type="button" disabled={isPending} onClick={onConfirm}>
            New conversation
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ConversationContextPreview({
  title,
  context,
  emphasized,
}: {
  title: string;
  context: DraftChatContext;
  emphasized?: boolean;
}) {
  const normalized = normalizeDraftContext(context);
  const hasContext = !isDraftContextEmpty(normalized);

  return (
    <Box
      rounded="lg"
      borderWidth="1px"
      borderColor={emphasized ? 'teal.muted' : 'border.surface'}
      bg={emphasized ? 'teal.subtle' : 'bg.subtle'}
      px="3.5"
      py="3"
    >
      <Text mb="2" fontSize="xs" fontWeight="semibold" color="fg.muted">
        {title}
      </Text>
      <Flex
        role="list"
        aria-label={title}
        maxH="7.5rem"
        overflowY="auto"
        gap="2"
        flexWrap="wrap"
        pr="1"
      >
        {hasContext ? (
          <>
            {normalized.vaults.map((vault) => (
              <ContextPreviewChip
                key={vaultKey(vault)}
                icon={<Vault size={14} />}
                label={vault.name ?? vault.vaultId}
                typeLabel="Vault"
              />
            ))}
            {normalized.documents.map((document) => (
              <ContextPreviewChip
                key={documentKey(document)}
                icon={<FileText size={14} />}
                label={document.name ?? document.documentId}
                detail={document.vaultName}
                typeLabel="Document"
              />
            ))}
          </>
        ) : (
          <ContextPreviewChip
            icon={<Vault size={14} />}
            label="All accessible vaults"
            typeLabel="Global context"
          />
        )}
      </Flex>
    </Box>
  );
}

function ContextPreviewChip({
  icon,
  label,
  detail,
  typeLabel,
}: {
  icon: ReactNode;
  label: string;
  detail?: string;
  typeLabel: string;
}) {
  const accessibleLabel = detail ? `${typeLabel}: ${label}, ${detail}` : `${typeLabel}: ${label}`;

  return (
    <Flex
      role="listitem"
      aria-label={accessibleLabel}
      align="center"
      gap="1.5"
      minW="0"
      maxW="100%"
      rounded="full"
      borderWidth="1px"
      borderColor="border.surface"
      bg="bg.surface"
      px="2.5"
      py="1.5"
      color="fg"
      fontSize="xs"
      fontWeight="medium"
    >
      <Box as="span" color="fg.muted" flexShrink="0">
        {icon}
      </Box>
      <Text as="span" minW="0" truncate>
        {label}
      </Text>
      {detail ? (
        <Text as="span" display={{ base: 'none', sm: 'inline' }} color="fg.muted" truncate>
          {detail}
        </Text>
      ) : null}
    </Flex>
  );
}

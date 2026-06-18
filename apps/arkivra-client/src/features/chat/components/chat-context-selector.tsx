/* eslint-disable react-refresh/only-export-components, import/consistent-type-specifier-style */
import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { Box, CloseButton, Flex, Stack, Text, chakra } from '@chakra-ui/react';
import { FileText, Lock, Paperclip, Vault, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  addDocumentsToDraftContext,
  addVaultsToDraftContext,
  contextSnapshotFromDraft,
  createEmptyDraftContext,
  documentKey,
  draftContextFromSnapshot,
  getDraftContextFromScope,
  getDraftContextSummary,
  getEffectiveDraftDocuments,
  groupDocumentSelectionItems,
  hydrateDraftContextLabels,
  isDocumentCoveredByVault,
  isDraftContextEmpty,
  normalizeDraftContext,
  removeDocumentFromDraftContext,
  removeVaultFromDraftContext,
  type DraftChatContext,
  type DraftChatDocument,
  type DraftChatVault,
  vaultKey,
} from './chat-context-model';
export {
  addDocumentsToDraftContext,
  addVaultsToDraftContext,
  contextSnapshotFromDraft,
  createEmptyDraftContext,
  draftContextFromSnapshot,
  getDraftContextFromScope,
  getDraftContextSummary,
  getEffectiveDraftDocuments,
  groupDocumentSelectionItems,
  hydrateDraftContextLabels,
  isDocumentCoveredByVault,
  isDraftContextEmpty,
  normalizeDraftContext,
  removeDocumentFromDraftContext,
  removeVaultFromDraftContext,
};
export type { DraftChatContext, DraftChatDocument, DraftChatVault };
export function ChatContextAddMenu({
  disabled,
  onAddVaults,
  onAddDocuments,
}: {
  disabled?: boolean;
  onAddVaults: () => void;
  onAddDocuments: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Add vaults and documents into context"
          title="Add vaults and documents into context"
          disabled={disabled}
          flexShrink="0"
          style={{ width: '2.25rem', height: '2.25rem', borderRadius: '0.5rem' }}
        >
          <Paperclip size={17} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuItem value="add-vaults" onSelect={onAddVaults}>
          <Vault size={16} />
          Add vaults
        </DropdownMenuItem>
        <DropdownMenuItem value="add-documents" onSelect={onAddDocuments}>
          <FileText size={16} />
          Add files
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function ContextChipList({
  context,
  locked,
  disabled,
  onRemoveVault,
  onRemoveDocument,
}: {
  context: DraftChatContext;
  locked: boolean;
  disabled?: boolean;
  onRemoveVault: (vault: DraftChatVault) => void;
  onRemoveDocument: (document: DraftChatDocument) => void;
}) {
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const normalized = normalizeDraftContext(context);
  const summary = getDraftContextSummary(normalized);

  useEffect(() => {
    if (disabled) setIsDetailsOpen(false);
  }, [disabled]);

  return (
    <>
      <Flex
        align="center"
        gap="2"
        minW="0"
        pb="2"
        color="fg.muted"
        aria-label="Active conversation context"
      >
        <Text as="span" flexShrink="0" fontSize="xs" fontWeight="semibold">
          Context:
        </Text>
        {locked ? <Lock size={13} style={{ flexShrink: 0 }} /> : null}
        <Text as="span" minW="0" truncate fontSize="xs" fontWeight="medium">
          {summary.label}
        </Text>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          flexShrink="0"
          h="7"
          minH="7"
          px="2"
          color="fg.muted"
          fontSize="xs"
          disabled={disabled}
          onClick={() => setIsDetailsOpen(true)}
        >
          View all
        </Button>
      </Flex>
      <ContextDetailsDialog
        open={isDetailsOpen}
        context={normalized}
        locked={locked}
        onOpenChange={setIsDetailsOpen}
        onRemoveVault={onRemoveVault}
        onRemoveDocument={onRemoveDocument}
      />
    </>
  );
}

function ContextDetailsDialog({
  open,
  context,
  locked,
  onOpenChange,
  onRemoveVault,
  onRemoveDocument,
}: {
  open: boolean;
  context: DraftChatContext;
  locked: boolean;
  onOpenChange: (open: boolean) => void;
  onRemoveVault: (vault: DraftChatVault) => void;
  onRemoveDocument: (document: DraftChatDocument) => void;
}) {
  const normalized = normalizeDraftContext(context);
  const summary = getDraftContextSummary(normalized);

  function removeVault(vault: DraftChatVault) {
    onRemoveVault(vault);
    if (!locked) onOpenChange(false);
  }

  function removeDocument(document: DraftChatDocument) {
    onRemoveDocument(document);
    if (!locked) onOpenChange(false);
  }

  return (
    <Dialog open={open} size="md" onOpenChange={onOpenChange}>
      <DialogContent hideCloseButton>
        <DialogClose asChild>
          <CloseButton
            size="sm"
            position="absolute"
            top="3"
            right="3"
            aria-label="Close context details"
          />
        </DialogClose>
        <DialogHeader style={{ padding: '1.25rem 1.25rem 0.75rem' }}>
          <DialogTitle>Conversation Context</DialogTitle>
          <DialogDescription>
            {locked ? `Context locked: ${summary.label}` : summary.label}
          </DialogDescription>
        </DialogHeader>
        <DialogBody asChild>
          <Stack gap="4" px="5" pb="5">
            {summary.hasContext ? (
              <>
                <ContextDetailsSection title="Vaults" emptyLabel="No vaults attached.">
                  {normalized.vaults.map((vault) => (
                    <ContextDetailsRow
                      key={vaultKey(vault)}
                      icon={<Vault size={16} />}
                      label={vault.name ?? vault.vaultId}
                      removeLabel={`Remove ${vault.name ?? vault.vaultId} from context`}
                      onRemove={() => removeVault(vault)}
                    />
                  ))}
                </ContextDetailsSection>
                <ContextDetailsSection
                  title="Individual files"
                  emptyLabel="No individual files attached."
                >
                  {normalized.documents.map((document) => (
                    <ContextDetailsRow
                      key={documentKey(document)}
                      icon={<FileText size={16} />}
                      label={document.name ?? document.documentId}
                      detail={document.vaultName}
                      removeLabel={`Remove ${document.name ?? document.documentId} from context`}
                      onRemove={() => removeDocument(document)}
                    />
                  ))}
                </ContextDetailsSection>
              </>
            ) : (
              <Flex
                align="center"
                gap="3"
                rounded="md"
                borderWidth="1px"
                borderColor="border.surface"
                bg="bg.subtle"
                px="3"
                py="3"
              >
                <Vault size={17} />
                <Text fontSize="sm" color="fg.muted">
                  All accessible vaults
                </Text>
              </Flex>
            )}
          </Stack>
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}

function ContextDetailsSection({
  title,
  emptyLabel,
  children,
}: {
  title: string;
  emptyLabel: string;
  children: ReactNode;
}) {
  const hasChildren = Array.isArray(children) ? children.length > 0 : Boolean(children);

  return (
    <Box>
      <Text mb="2" fontSize="xs" fontWeight="semibold" color="fg.muted" textTransform="uppercase">
        {title}
      </Text>
      <Stack gap="1.5">
        {hasChildren ? (
          children
        ) : (
          <Text rounded="md" bg="bg.subtle" px="3" py="2.5" fontSize="sm" color="fg.muted">
            {emptyLabel}
          </Text>
        )}
      </Stack>
    </Box>
  );
}

function ContextDetailsRow({
  icon,
  label,
  detail,
  removeLabel,
  onRemove,
}: {
  icon: ReactNode;
  label: string;
  detail?: string;
  removeLabel: string;
  onRemove: () => void;
}) {
  return (
    <Flex
      align="center"
      gap="3"
      rounded="md"
      borderWidth="1px"
      borderColor="border.surface"
      bg="bg.surface"
      px="3"
      py="2.5"
    >
      <Box color="fg.muted" flexShrink="0">
        {icon}
      </Box>
      <Box minW="0" flex="1">
        <Text truncate fontSize="sm" fontWeight="medium" color="fg">
          {label}
        </Text>
        {detail ? (
          <Text truncate fontSize="xs" color="fg.muted">
            {detail}
          </Text>
        ) : null}
      </Box>
      <chakra.button
        type="button"
        aria-label={removeLabel}
        display="inline-flex"
        alignItems="center"
        justifyContent="center"
        rounded="full"
        color="fg.muted"
        cursor="pointer"
        p="1.5"
        _hover={{ bg: 'bg.subtle', color: 'fg' }}
        _focusVisible={{
          outline: '2px solid',
          outlineColor: 'teal.focusRing',
          outlineOffset: '2px',
        }}
        onClick={onRemove}
      >
        <X size={15} />
      </chakra.button>
    </Flex>
  );
}

export { DocumentSelectionDialog, VaultSelectionDialog } from './chat-context-selection-dialogs';

export { ConversationForkDialog } from './chat-context-fork-dialog';

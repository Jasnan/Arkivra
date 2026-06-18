import {
  CloseButton,
  Dialog as ChakraDialog,
  Flex,
  Portal,
  Spinner,
  Stack,
  Text,
} from '@chakra-ui/react';
import { AlertCircle } from 'lucide-react';
import { DeleteButton } from '@/components/ui/action-buttons';
import { Button } from '@/components/ui/button';
import { useDialogPageLockCleanup } from '@/components/ui/dialog-page-locks';
import type {
  BulkDocumentDeletionImpactPreview,
  DocumentDeletionImpactPreview,
} from '@/features/documents/documents.types';

export function TrashConfirmDialog({
  open,
  title,
  description,
  impact,
  isImpactLoading = false,
  impactError = null,
  confirmLabel,
  pendingLabel,
  isPending,
  onClose,
  onConfirm,
}: {
  open: boolean;
  title: string;
  description: string;
  impact?: DocumentDeletionImpactPreview | BulkDocumentDeletionImpactPreview | null;
  isImpactLoading?: boolean;
  impactError?: string | null;
  confirmLabel: string;
  pendingLabel: string;
  isPending: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  useDialogPageLockCleanup(open);

  return (
    <ChakraDialog.Root
      open={open}
      onOpenChange={(event) => {
        if (!event.open && !isPending) onClose();
      }}
      size={{ mdDown: 'full', md: 'lg' }}
    >
      <Portal>
        <ChakraDialog.Backdrop />
        <ChakraDialog.Positioner>
          <ChakraDialog.Content>
            <ChakraDialog.Header>
              <ChakraDialog.Title>{title}</ChakraDialog.Title>
              <CloseButton size="sm" disabled={isPending} onClick={onClose} />
            </ChakraDialog.Header>
            <ChakraDialog.Body>
              {isImpactLoading ? (
                <Flex align="center" gap="3" color="fg.muted">
                  <Spinner size="sm" color="teal.solid" />
                  <Text fontSize="sm">Checking affected conversations...</Text>
                </Flex>
              ) : impactError !== null ? (
                <Flex align="center" gap="3" color="fg.error">
                  <AlertCircle size={18} />
                  <Text fontSize="sm" fontWeight="semibold">
                    {impactError}
                  </Text>
                </Flex>
              ) : impact !== null &&
                impact !== undefined &&
                impact.affectedConversationCount > 0 ? (
                'affectedConversations' in impact ? (
                  <DocumentDeletionImpactWarning impact={impact} />
                ) : (
                  <BulkDocumentDeletionImpactWarning impact={impact} />
                )
              ) : (
                <Text color="fg.muted" fontSize="sm">
                  {description}
                </Text>
              )}
            </ChakraDialog.Body>
            <ChakraDialog.Footer>
              <Button
                type="button"
                variant="outline"
                disabled={isPending || isImpactLoading}
                onClick={onClose}
              >
                Cancel
              </Button>
              <DeleteButton
                type="button"
                disabled={isPending || isImpactLoading || impactError !== null}
                onClick={onConfirm}
              >
                {isPending ? pendingLabel : confirmLabel}
              </DeleteButton>
            </ChakraDialog.Footer>
          </ChakraDialog.Content>
        </ChakraDialog.Positioner>
      </Portal>
    </ChakraDialog.Root>
  );
}

function BulkDocumentDeletionImpactWarning({
  impact,
}: {
  impact: BulkDocumentDeletionImpactPreview;
}) {
  return (
    <Stack gap="3" color="fg.muted" fontSize="sm" lineHeight="1.55">
      <Text>These documents are referenced by conversations.</Text>
      <Text>This may affect existing conversations.</Text>
      <Text>{`Affected conversations: ${impact.affectedConversationCount}`}</Text>
      <Text>Deleting these documents will:</Text>
      <Stack as="ul" gap="1" m="0" ps="5">
        <Text as="li">permanently remove all versions</Text>
        <Text as="li">preserve conversation history</Text>
        <Text as="li">make affected conversations read-only</Text>
      </Stack>
    </Stack>
  );
}

function DocumentDeletionImpactWarning({ impact }: { impact: DocumentDeletionImpactPreview }) {
  const shownCount = impact.affectedConversations.length;
  const hasMore = impact.affectedConversationCount > shownCount;

  return (
    <Stack gap="3" color="fg.muted" fontSize="sm" lineHeight="1.55">
      <Text>{`This document contains ${impact.versionCount} versions.`}</Text>
      <Text>
        Some versions are referenced by {impact.affectedConversationCount}{' '}
        {impact.affectedConversationCount === 1 ? 'conversation' : 'conversations'}.
      </Text>
      <Text>Deleting this document will:</Text>
      <Stack as="ul" gap="1" m="0" ps="5">
        <Text as="li">permanently remove all versions</Text>
        <Text as="li">preserve conversation history</Text>
        <Text as="li">make the affected conversations read-only</Text>
      </Stack>
      <Text>Affected conversations{hasMore ? ` (${impact.affectedConversationCount})` : ''}:</Text>
      <Stack as="ul" gap="1" m="0" ps="5">
        {impact.affectedConversations.map((conversation) => (
          <Text as="li" key={conversation.id} overflowWrap="anywhere">
            {conversation.title}
          </Text>
        ))}
      </Stack>
      {hasMore ? (
        <Text>
          Showing {shownCount} of {impact.affectedConversationCount} conversations.
        </Text>
      ) : null}
    </Stack>
  );
}

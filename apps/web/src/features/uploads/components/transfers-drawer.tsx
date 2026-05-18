import { useMemo } from 'react';
import { Box, CloseButton, Drawer, Flex, Portal, Stack, Text } from '@chakra-ui/react';
import type { LucideIcon } from 'lucide-react';
import {
  AlertCircle,
  ArrowDownUp,
  CheckCircle2,
  File,
  FileImage,
  FileJson,
  FileText,
  FileType,
  Folder,
  LoaderCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatBytes } from '@/features/documents/documents.utils';
import { buildTransferSections, failureStatuses } from '../transfers-display';
import type { DisplayTransfer, DisplayTransferStatus } from '../transfers-display';
import { uploadManager } from '../upload-manager';
import { useUploadManagerState } from '../use-upload-manager';

function statusLabel(status: DisplayTransferStatus) {
  switch (status) {
    case 'queued':
      return 'Queued';
    case 'uploading':
      return 'Uploading';
    case 'paused':
      return 'Paused';
    case 'completed':
      return 'Success';
    case 'failed':
      return 'Failed';
    case 'canceled':
      return 'Canceled';
    default:
      return status;
  }
}

function isClearableStatus(status: DisplayTransferStatus) {
  return status === 'completed' || status === 'failed' || status === 'canceled' || status === 'paused';
}

function getTransferIconMeta(item: DisplayTransfer): { icon: LucideIcon; bg: string; color: string } {
  if (item.isDirectory) {
    return { icon: Folder, bg: 'teal.subtle', color: 'teal.fg' };
  }

  const extension = item.name.split('.').pop()?.trim().toLocaleLowerCase();
  const mimeType = item.mimeType ?? '';

  if (mimeType.startsWith('image/') || ['gif', 'jpeg', 'jpg', 'png', 'webp'].includes(extension ?? '')) {
    return { icon: FileImage, bg: 'bg.success', color: 'green.fg' };
  }

  if (mimeType === 'application/pdf' || extension === 'pdf') {
    return { icon: FileText, bg: 'bg.error', color: 'red.fg' };
  }

  if (
    extension === 'doc'
    || extension === 'docx'
    || mimeType.includes('word')
    || mimeType.includes('officedocument.wordprocessingml')
  ) {
    return { icon: FileType, bg: 'teal.subtle', color: 'purple.fg' };
  }

  if (mimeType === 'application/json' || extension === 'json') {
    return { icon: FileJson, bg: 'bg.info', color: 'blue.fg' };
  }

  if (mimeType.startsWith('text/') || ['csv', 'md', 'rtf', 'txt'].includes(extension ?? '')) {
    return { icon: FileText, bg: 'bg.info', color: 'blue.fg' };
  }

  return { icon: File, bg: 'bg.subtle', color: 'fg.muted' };
}

function TransferRow({ item }: { item: DisplayTransfer }) {
  const { bg, color, icon: Icon } = getTransferIconMeta(item);
  const isFailure = failureStatuses.has(item.status);
  const isSuccess = item.status === 'completed';

  return (
    <Box py="3">
      <Flex align="flex-start" gap="3">
        <Flex
          boxSize="10"
          shrink={0}
          align="center"
          justify="center"
          rounded="md"
          bg={bg}
          color={color}
        >
          <Icon size={22} strokeWidth={1.8} />
        </Flex>
        <Box minW="0" flex="1">
          <Flex minW="0" align="center" justify="space-between" gap="3">
            <Text truncate fontWeight="medium" color="fg">
              {item.name}
            </Text>
            <Flex shrink={0} align="center" gap="1.5" color={isFailure ? 'fg.error' : isSuccess ? 'fg.success' : 'fg.muted'}>
              {item.status === 'uploading' ? (
                <LoaderCircle size={15} style={{ animation: 'spin 1s linear infinite' }} />
              ) : isSuccess ? (
                <CheckCircle2 size={15} />
              ) : isFailure ? (
                <AlertCircle size={15} />
              ) : null}
              <Text as="span" fontSize="xs" fontWeight="medium">
                {statusLabel(item.status)}
              </Text>
            </Flex>
          </Flex>
          {item.detail ? (
            <Text mt="1" truncate fontSize="xs" color="fg.muted">
              {item.detail}
            </Text>
          ) : null}
          <Box mt="3" h="1.5" overflow="hidden" rounded="full" bg="bg.subtle">
            <Box
              h="full"
              rounded="full"
              bg={isFailure ? 'fg.error' : 'teal.solid'}
              transition="width 0.2s ease"
              style={{ width: `${item.progress}%` }}
            />
          </Box>
          <Flex mt="1.5" justify="space-between" gap="3" fontSize="xs" color="fg.muted">
            <Text>{formatBytes(item.bytesUploaded)} uploaded</Text>
            <Text>{formatBytes(item.size)}</Text>
          </Flex>
          {item.error ? (
            <Text mt="2" fontSize="xs" color="fg.error">
              {item.error}
            </Text>
          ) : null}
        </Box>
      </Flex>
    </Box>
  );
}

function TransferSection({ title, items }: { title: string; items: DisplayTransfer[] }) {
  if (items.length === 0) {
    return null;
  }

  return (
    <Stack gap="1">
      <Text fontSize="xs" fontWeight="semibold" color="fg.muted" textTransform="uppercase">
        {title}
      </Text>
      <Stack gap="0" divideY="1px" divideColor="border.surface">
        {items.map(item => <TransferRow key={item.key} item={item} />)}
      </Stack>
    </Stack>
  );
}

export function TransfersDrawer({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const state = useUploadManagerState();
  const sections = useMemo(() => buildTransferSections(state.items), [state.items]);
  const hasRows = sections.inProgress.length + sections.success.length + sections.failure.length > 0;
  const hasClearableRows = state.items.some(item => isClearableStatus(item.status));

  return (
    <Drawer.Root open={open} onOpenChange={(event) => onOpenChange(event.open)} placement="end" size="lg">
      <Portal>
        <Drawer.Backdrop bg="blackAlpha.500" />
        <Drawer.Positioner>
          <Drawer.Content w={{ base: '100vw', md: '34rem', xl: '38rem' }} maxW="100vw" bg="bg.surface">
            <Drawer.Header borderBottomWidth="1px" borderColor="border.surface">
              <Flex w="full" minW="0" align="center" gap="3" pr="9">
                <Drawer.Title flex="0 0 auto" fontSize="xl">
                  Transfers
                </Drawer.Title>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  colorPalette="teal"
                  borderColor="teal.muted"
                  color="teal.fg"
                  disabled={!hasClearableRows}
                  onClick={() => uploadManager.clearSettled()}
                >
                  Clear status
                </Button>
              </Flex>
            </Drawer.Header>
            <Drawer.Body px="6" py="5">
              {hasRows ? (
                <Stack gap="6">
                  <TransferSection title="In progress" items={sections.inProgress} />
                  <TransferSection title="Success" items={sections.success} />
                  <TransferSection title="Failure" items={sections.failure} />
                </Stack>
              ) : (
                <Flex minH="22rem" direction="column" align="center" justify="center" gap="4" color="fg.muted">
                  <ArrowDownUp size={56} strokeWidth={1.6} />
                  <Text fontWeight="medium">No transfers yet</Text>
                </Flex>
              )}
            </Drawer.Body>
            <Drawer.CloseTrigger asChild>
              <CloseButton size="sm" position="absolute" top="3" right="3" />
            </Drawer.CloseTrigger>
          </Drawer.Content>
        </Drawer.Positioner>
      </Portal>
    </Drawer.Root>
  );
}

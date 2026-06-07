/* eslint-disable react-refresh/only-export-components */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Box, Flex, HStack, Text, chakra } from '@chakra-ui/react';
import { Upload } from 'lucide-react';
import { TransfersDrawer } from '@/features/uploads/components/transfers-drawer';
import { useUploadManagerState } from '@/features/uploads/use-upload-manager';

export function useTransfersDrawerController(locationKey: string) {
  const uploadState = useUploadManagerState();
  const [isOpen, setIsOpen] = useState(false);
  const previousLocationKeyRef = useRef<string | null>(null);

  useEffect(() => {
    function handleOpenTransfers() {
      setIsOpen(true);
    }

    window.addEventListener('arkivra:transfers-open', handleOpenTransfers);
    return () => window.removeEventListener('arkivra:transfers-open', handleOpenTransfers);
  }, []);

  useEffect(() => {
    const hasUnfinishedUploads = uploadState.items.some(item =>
      item.status === 'queued' || item.status === 'uploading' || item.status === 'paused',
    );

    if (!hasUnfinishedUploads) {
      return undefined;
    }

    function warnBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = '';
    }

    window.addEventListener('beforeunload', warnBeforeUnload);
    return () => window.removeEventListener('beforeunload', warnBeforeUnload);
  }, [uploadState.items]);

  useEffect(() => {
    if (previousLocationKeyRef.current === null) {
      previousLocationKeyRef.current = locationKey;
      return;
    }

    if (previousLocationKeyRef.current !== locationKey) {
      previousLocationKeyRef.current = locationKey;
      // eslint-disable-next-line react-hooks-extra/no-direct-set-state-in-use-effect
      setIsOpen(false);
    }
  }, [locationKey]);

  const uploadCount = uploadState.activeCount + uploadState.queuedCount;

  return useMemo(
    () => ({
      isOpen,
      setIsOpen,
      open: () => setIsOpen(true),
      uploadCount,
    }),
    [isOpen, uploadCount],
  );
}

export function UploadTransferBanner({
  uploadCount,
  contentPadding,
  compactTopPadding,
  onOpen,
}: {
  uploadCount: number;
  contentPadding: '0' | { base: string; lg: string };
  compactTopPadding: boolean;
  onOpen: () => void;
}) {
  if (uploadCount <= 0) {
    return null;
  }

  return (
    <Box px={contentPadding} pt={compactTopPadding ? '3' : '4'}>
      <chakra.button
        type="button"
        display="flex"
        w="full"
        alignItems="center"
        justifyContent="space-between"
        borderWidth="1px"
        borderColor="border.surface"
        bg="bg.workspace"
        px="4"
        py="3"
        fontSize="sm"
        color="fg.muted"
        transition="colors"
        _hover={{ bg: 'bg.workspaceMuted', color: 'fg' }}
        onClick={onOpen}
      >
        <HStack gap="3">
          <Flex boxSize="8" align="center" justify="center" color="fg">
            <Upload size={16} />
          </Flex>
          <Text>
            Uploading {uploadCount} file
            {uploadCount === 1 ? '' : 's'}
          </Text>
        </HStack>
        <Text fontSize="xs" textTransform="uppercase" letterSpacing="0.12em">
          View queue
        </Text>
      </chakra.button>
    </Box>
  );
}

export function AppShellTransfersDrawer({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return <TransfersDrawer open={open} onOpenChange={onOpenChange} />;
}

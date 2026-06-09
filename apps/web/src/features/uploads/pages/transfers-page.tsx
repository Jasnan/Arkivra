import type { ChangeEvent, DragEvent } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Box,
  Flex,
  Grid,
  Heading,
  Stack,
  Text,
  CloseButton,
  Dialog as ChakraDialog,
  Portal,
  chakra,
} from '@chakra-ui/react';
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  FileUp,
  LoaderCircle,
  Plus,
  Trash2,
} from 'lucide-react';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { ROUTES } from '@/app/routes';
import { validateTransfersSearch } from '@/app/search-params';
import { PageIntro, SurfacePanel, vaultInputClassName } from '@/components/layout/vault-ui';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ActionMenuItemIcon, ActionMenuTriggerButton } from '@/components/ui/action-menu';
import { Button } from '@/components/ui/button';
import { AppEmptyState } from '@/components/ui/empty-state';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { formatBytes } from '@/features/documents/documents.utils';
import { useVaultsQuery } from '@/features/vaults/vaults.queries';
import { filesToDroppedFiles, getDroppedFiles } from '../dropped-files';
import type { DroppedFile } from '../dropped-files';
import { filterAllowedUploadFiles, UPLOAD_ACCEPT_ATTRIBUTE } from '../upload-file-rules';
import { uploadManager } from '../upload-manager';
import { useUploadManagerState } from '../use-upload-manager';

const DIRECTORY_PICKER_ATTRIBUTES = {
  directory: '',
  webkitdirectory: '',
};

function statusLabel(status: string) {
  switch (status) {
    case 'queued':
      return 'Queued';
    case 'uploading':
      return 'Uploading';
    case 'paused':
      return 'Paused';
    case 'completed':
      return 'Done';
    case 'failed':
      return 'Failed';
    case 'canceled':
      return 'Canceled';
    default:
      return status;
  }
}

export function TransfersPage() {
  const navigate = useNavigate({ from: ROUTES.transfers });
  const search = validateTransfersSearch(useSearch({ strict: false }));
  const { data } = useVaultsQuery();
  const state = useUploadManagerState();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const folderInputRef = useRef<HTMLInputElement | null>(null);
  const vaultId = search.vaultId ?? data?.vaults[0]?.id ?? '';
  const folderId = search.folderId ?? null;
  const isVaultLocked = search.locked === 'true' && vaultId.length > 0;
  const activeVaultName = (data?.vaults ?? []).find((vault) => vault.id === vaultId)?.name ?? null;
  const [isCompletedExpanded, setIsCompletedExpanded] = useState(false);
  const [isClearAllDialogOpen, setIsClearAllDialogOpen] = useState(false);
  const [isClearingAll, setIsClearingAll] = useState(false);

  const totalBytes = useMemo(
    () => state.items.reduce((sum, item) => sum + item.size, 0),
    [state.items],
  );
  const uploadedBytes = useMemo(
    () => state.items.reduce((sum, item) => sum + item.bytesUploaded, 0),
    [state.items],
  );
  const percent = totalBytes === 0 ? 0 : Math.round((uploadedBytes / totalBytes) * 100);
  const canUpload = vaultId.length > 0;
  const nonCompletedItems = useMemo(
    () => state.items.filter((item) => item.status !== 'completed'),
    [state.items],
  );
  const completedItems = useMemo(
    () => state.items.filter((item) => item.status === 'completed'),
    [state.items],
  );
  const hasClearableStatus = useMemo(
    () =>
      state.items.some(
        (item) =>
          item.status === 'completed' ||
          item.status === 'failed' ||
          item.status === 'canceled' ||
          item.status === 'paused',
      ),
    [state.items],
  );

  useEffect(() => {
    if (!vaultId) return;
    void uploadManager.reconcileVault(vaultId);
  }, [vaultId]);

  function handleFiles(files: DroppedFile[]) {
    const acceptedFiles = filterAllowedUploadFiles(files);
    if (!canUpload || acceptedFiles.length === 0) return;
    uploadManager.addFiles({ vaultId, folderId, files: acceptedFiles });
  }

  function handleInputChange(event: ChangeEvent<HTMLInputElement>) {
    handleFiles(filesToDroppedFiles(Array.from(event.target.files ?? [])));
    event.target.value = '';
  }

  async function handleDrop(event: DragEvent<HTMLButtonElement>) {
    event.preventDefault();
    handleFiles(await getDroppedFiles(event.dataTransfer));
  }

  function handleClearAll() {
    setIsClearAllDialogOpen(true);
  }

  async function handleConfirmClearAll() {
    setIsClearingAll(true);
    try {
      await uploadManager.clearAll();
      setIsClearAllDialogOpen(false);
    } finally {
      setIsClearingAll(false);
    }
  }

  return (
    <Stack as="section" gap="4" pb="8">
      <PageIntro
        title="Upload"
        description="Add files to a vault and monitor the transfer queue."
      />

      <Stack gap="3">
        <Stack gap="2">
          <Text id="transfer-vault-label" fontSize="sm" fontWeight="medium" color="fg.muted">
            Vault
          </Text>
          {isVaultLocked ? (
            <Flex
              h="10"
              w="full"
              maxW="17.5rem"
              align="center"
              rounded="lg"
              borderWidth="1px"
              borderColor="border.surface"
              bg="bg.subtle"
              px="4"
              fontSize="sm"
              fontWeight="medium"
              color="fg"
            >
              {activeVaultName ?? 'Selected vault'}
            </Flex>
          ) : (
            <Select
              size="md"
              value={vaultId || '__none__'}
              onValueChange={(value) =>
                navigate({ search: value === '__none__' ? {} : { vaultId: value }, replace: true })
              }
            >
              <SelectTrigger
                aria-labelledby="transfer-vault-label"
                className={vaultInputClassName}
                w="full"
                maxW="17.5rem"
                rounded="lg"
                bg="bg.subtle"
                fontSize="sm"
                color="fg"
              >
                <SelectValue placeholder="Select a vault" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Select a vault</SelectItem>
                {(data?.vaults ?? []).map((vault) => (
                  <SelectItem key={vault.id} value={vault.id}>
                    {vault.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </Stack>

        <SurfacePanel p={{ base: '5', sm: '6' }}>
          <chakra.button
            type="button"
            onClick={() => inputRef.current?.click()}
            onDragOver={(event) => event.preventDefault()}
            onDrop={handleDrop}
            className="group"
            display="flex"
            minH="300px"
            w="full"
            flexDirection="column"
            alignItems="center"
            justifyContent="center"
            rounded="lg"
            borderWidth="1px"
            borderStyle="dashed"
            borderColor="border.surface"
            bg="bg.subtle"
            px={{ base: '6', sm: '10' }}
            py={{ base: '12', sm: '16' }}
            textAlign="center"
            transition="background-color 0.15s ease, border-color 0.15s ease, opacity 0.15s ease"
            _hover={canUpload ? { borderColor: 'teal.focusRing', bg: 'bg.surface' } : undefined}
            cursor={canUpload ? 'pointer' : 'not-allowed'}
            opacity={canUpload ? '1' : '0.7'}
            disabled={!canUpload}
          >
            <Flex
              boxSize="4.8rem"
              align="center"
              justify="center"
              rounded="lg"
              bg="bg.surface"
              color="teal.solid"
            >
              <FileUp size={32} />
            </Flex>
            <Heading as="h2" mt="6" textStyle="lg" fontWeight="semibold" lineHeight="short">
              Drag and drop files or folders here
            </Heading>
            <Text mt="2" maxW="md" textStyle="sm" color="fg.muted">
              Select a vault and add files. Dropped folders are uploaded as individual files.
            </Text>
            <Flex
              mt="6"
              h="10"
              align="center"
              rounded="full"
              bg="teal.solid"
              px="6"
              fontSize="sm"
              fontWeight="semibold"
              color="teal.fg"
              transition="opacity 0.15s ease"
              _groupHover={{ opacity: 0.95 }}
            >
              Browse files
            </Flex>
          </chakra.button>
        </SurfacePanel>

        <input
          ref={inputRef}
          type="file"
          accept={UPLOAD_ACCEPT_ATTRIBUTE}
          multiple
          className="hidden"
          onChange={handleInputChange}
        />
        <input
          ref={folderInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={handleInputChange}
          {...DIRECTORY_PICKER_ATTRIBUTES}
        />
      </Stack>

      {state.hydratedFromStorage &&
      state.items.some((item) => item.error?.includes('Previous upload session found')) ? (
        <Alert>
          <AlertDescription>
            Previous upload session found. Route changes keep uploads alive, but after a full
            refresh the browser requires selecting the original files again before resume.
          </AlertDescription>
        </Alert>
      ) : null}

      <SurfacePanel display="flex" flexDirection="column" gap="4" p={{ base: '5', sm: '6' }}>
        <Flex
          direction={{ base: 'column', lg: 'row' }}
          align={{ lg: 'flex-start' }}
          justify={{ lg: 'space-between' }}
          gap="4"
        >
          <Stack gap="2">
            <Stack gap="1">
              <Heading as="h2" textStyle="lg" fontWeight="semibold" lineHeight="short">
                Upload queue
              </Heading>
              <Text textStyle="sm" color="fg.muted">
                This page only tracks the file upload itself. Transfer status is kept for this tab
                until sign out or close.
              </Text>
            </Stack>
            <Flex flexWrap="wrap" align="center" gap="3" fontSize="sm" color="fg.muted">
              <Text as="span" fontWeight="semibold" color="fg">
                {state.items.length} files
              </Text>
              <Separator orientation="vertical" h="5" bg="border.surface" />
              <Text as="span">{formatBytes(uploadedBytes)}</Text>
            </Flex>
          </Stack>

          <Flex flexWrap="wrap" gap="3">
            <DropdownMenu modal={false}>
              <DropdownMenuTrigger asChild>
                <ActionMenuTriggerButton label="Transfer actions" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" minWidth="15rem">
                <DropdownMenuItem
                  disabled={!canUpload}
                  onSelect={() => {
                    inputRef.current?.click();
                  }}
                >
                  <ActionMenuItemIcon icon={Plus} />
                  Add files
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={!canUpload}
                  onSelect={() => {
                    folderInputRef.current?.click();
                  }}
                >
                  <ActionMenuItemIcon icon={FileUp} />
                  Add folder
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={!hasClearableStatus}
                  onSelect={() => {
                    uploadManager.clearSettled();
                  }}
                >
                  <ActionMenuItemIcon icon={CheckCircle2} />
                  Clear
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={state.items.length === 0}
                  color="fg.error"
                  onSelect={handleClearAll}
                >
                  <ActionMenuItemIcon icon={Trash2} tone="destructive" />
                  Clear all
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </Flex>
        </Flex>

        <Grid alignItems="end" gap="3" templateColumns={{ base: '1fr', lg: 'minmax(0, 1fr) auto' }}>
          <Box h="2.5" overflow="hidden" rounded="full" bg="bg.subtle">
            <Box
              h="full"
              rounded="full"
              bg="teal.solid"
              transition="width 0.3s ease"
              style={{ width: `${percent}%` }}
            />
          </Box>
          <Text
            textAlign="right"
            fontFamily="heading"
            fontSize="2xl"
            fontWeight="semibold"
            lineHeight="none"
            color="fg"
          >
            {percent}%
          </Text>
        </Grid>
      </SurfacePanel>

      <SurfacePanel overflow="hidden" p="0">
        <Grid
          display={{ base: 'none', md: 'grid' }}
          templateColumns="minmax(0, 1.3fr) 140px 160px 160px"
          gap="4"
          borderBottomWidth="1px"
          borderColor="border.surface"
          px="7"
          py="4"
          fontSize="sm"
          color="fg.muted"
        >
          <Text as="span">File name</Text>
          <Text as="span">Size</Text>
          <Text as="span">Status</Text>
          <Text as="span" textAlign="right">
            Actions
          </Text>
        </Grid>

        {state.items.length === 0 ? (
          <AppEmptyState
            title="No transfers yet"
            description="Add files above to start uploading."
            icon={<FileUp size={28} />}
            minH="12rem"
            px="7"
            py="8"
          />
        ) : (
          nonCompletedItems.map((item) => (
            <Box
              key={item.id}
              borderBottomWidth="1px"
              borderColor="border.surface"
              px="7"
              py="4"
              _last={{ borderBottomWidth: 0 }}
            >
              <Grid
                gap="4"
                templateColumns={{ base: '1fr', md: 'minmax(0, 1.3fr) 140px 160px 160px' }}
                alignItems={{ md: 'center' }}
              >
                <Box minW="0">
                  <Text truncate fontWeight="medium" color="fg">
                    {item.fileName}
                  </Text>
                  {item.relativePath && item.relativePath !== item.fileName ? (
                    <Text mt="1" truncate textStyle="xs" color="fg.muted">
                      {item.relativePath}
                    </Text>
                  ) : null}
                  <Box mt="2" h="2" overflow="hidden" rounded="full" bg="bg.subtle">
                    <Box
                      h="full"
                      rounded="full"
                      bg={item.status === 'failed' ? 'fg.error' : 'teal.solid'}
                      transition="width 0.3s ease"
                      style={{ width: `${item.progress}%` }}
                    />
                  </Box>
                </Box>

                <Text textStyle="sm">{formatBytes(item.size)}</Text>

                <Flex align="center" gap="2" fontSize="sm">
                  {item.status === 'completed' ? (
                    <CheckCircle2 size={16} color="var(--chakra-colors-teal-solid)" />
                  ) : null}
                  {item.status === 'failed' ? (
                    <AlertCircle size={16} color="var(--chakra-colors-fg-error)" />
                  ) : null}
                  {item.status === 'uploading' ? (
                    <LoaderCircle
                      size={16}
                      color="var(--chakra-colors-teal-solid)"
                      style={{ animation: 'spin 1s linear infinite' }}
                    />
                  ) : null}
                  <Text as="span" color={item.status === 'failed' ? 'fg.error' : undefined}>
                    {statusLabel(item.status)}
                  </Text>
                </Flex>

                <Flex align="center" justify="flex-end" gap="2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => void uploadManager.remove(item.id)}
                  >
                    <Trash2 size={16} />
                  </Button>
                </Flex>
              </Grid>

              {item.error ? (
                <Text mt="2" textStyle="sm" color="fg.error">
                  {item.error}
                </Text>
              ) : (
                <Text mt="2" textStyle="sm">
                  {item.status === 'completed'
                    ? `${formatBytes(item.bytesUploaded)} uploaded • complete`
                    : `${formatBytes(item.bytesUploaded)} uploaded • ${Math.round(item.progress)}%`}
                </Text>
              )}
            </Box>
          ))
        )}

        {completedItems.length > 0 ? (
          <Collapsible
            open={isCompletedExpanded}
            onOpenChange={setIsCompletedExpanded}
            borderTopWidth={nonCompletedItems.length > 0 ? '1px' : '0'}
            borderColor="border.surface"
          >
            <CollapsibleTrigger asChild>
              <chakra.button
                type="button"
                display="flex"
                w="full"
                alignItems="center"
                justifyContent="space-between"
                px="7"
                py="4"
                textAlign="left"
                transition="background-color 0.15s ease"
                _hover={{ bg: 'bg.subtle' }}
              >
                <Box>
                  <Text fontWeight="medium" color="fg">
                    Completed ({completedItems.length})
                  </Text>
                  <Text mt="1" textStyle="sm">
                    Recent completed uploads remain visible for this tab.
                  </Text>
                </Box>
                <ChevronDown
                  size={20}
                  color="var(--chakra-colors-fg-muted)"
                  style={{
                    transition: 'transform 0.15s ease',
                    transform: isCompletedExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                  }}
                />
              </chakra.button>
            </CollapsibleTrigger>

            <CollapsibleContent>
              {completedItems.map((item) => (
                <Box key={item.id} borderTopWidth="1px" borderColor="border.surface" px="7" py="4">
                  <Grid
                    gap="4"
                    templateColumns={{ base: '1fr', md: 'minmax(0, 1.3fr) 140px 160px 160px' }}
                    alignItems={{ md: 'center' }}
                  >
                    <Box minW="0">
                      <Text truncate fontWeight="medium" color="fg">
                        {item.fileName}
                      </Text>
                      {item.relativePath && item.relativePath !== item.fileName ? (
                        <Text mt="1" truncate textStyle="xs" color="fg.muted">
                          {item.relativePath}
                        </Text>
                      ) : null}
                      <Box mt="2" h="2" overflow="hidden" rounded="full" bg="bg.subtle">
                        <Box h="full" rounded="full" bg="teal.solid" style={{ width: '100%' }} />
                      </Box>
                    </Box>

                    <Text textStyle="sm">{formatBytes(item.size)}</Text>

                    <Flex align="center" gap="2" fontSize="sm">
                      <CheckCircle2 size={16} color="var(--chakra-colors-teal-solid)" />
                      <Text as="span">Done</Text>
                    </Flex>

                    <Flex align="center" justify="flex-end" gap="2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => void uploadManager.remove(item.id)}
                      >
                        <Trash2 size={16} />
                      </Button>
                    </Flex>
                  </Grid>

                  <Text mt="2" textStyle="sm">
                    {formatBytes(item.bytesUploaded)} uploaded • 100%
                  </Text>
                </Box>
              ))}
            </CollapsibleContent>
          </Collapsible>
        ) : null}
      </SurfacePanel>

      <ChakraDialog.Root
        open={isClearAllDialogOpen}
        onOpenChange={(e) => {
          if (e.open) {
            setIsClearAllDialogOpen(true);
          } else if (!isClearingAll) {
            setIsClearAllDialogOpen(false);
          }
        }}
        size={{ mdDown: 'full', md: 'lg' }}
      >
        <Portal>
          <ChakraDialog.Backdrop />
          <ChakraDialog.Positioner>
            <ChakraDialog.Content>
              <ChakraDialog.Header>
                <ChakraDialog.Title>Cancel and clear transfers?</ChakraDialog.Title>
                <ChakraDialog.CloseTrigger asChild>
                  <CloseButton size="sm" />
                </ChakraDialog.CloseTrigger>
              </ChakraDialog.Header>
              <ChakraDialog.Body>
                <Text color="fg.muted" fontSize="sm">
                  Active uploads will be canceled and the entire transfer queue will be cleared.
                  Completed items will be removed from Transfers, but uploaded documents will remain
                  in their vaults.
                </Text>
              </ChakraDialog.Body>
              <ChakraDialog.Footer>
                <ChakraDialog.ActionTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setIsClearAllDialogOpen(false)}
                    disabled={isClearingAll}
                  >
                    Keep
                  </Button>
                </ChakraDialog.ActionTrigger>
                <Button
                  type="button"
                  bg="fg.error"
                  color="fg.inverted"
                  disabled={isClearingAll}
                  onClick={() => void handleConfirmClearAll()}
                >
                  {isClearingAll ? 'Clearing...' : 'Clear all'}
                </Button>
              </ChakraDialog.Footer>
            </ChakraDialog.Content>
          </ChakraDialog.Positioner>
        </Portal>
      </ChakraDialog.Root>
    </Stack>
  );
}

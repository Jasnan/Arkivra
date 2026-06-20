import { useState } from 'react';
import { Box, HStack, Stack, Text, chakra } from '@chakra-ui/react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CreateButton, RestoreArchiveButton } from '@/components/ui/action-buttons';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { FieldLabel } from '@/components/ui/field';
import { toast } from '@/components/ui/toaster-store';
import type { BackupArchiveManifest } from '@/features/admin/admin.api';
import {
  createBackup,
  getBackupDownloadUrl,
  getBackupPartDownloadUrl,
  importBackupManifest,
  restoreBackup,
  uploadBackupPart,
} from '@/features/admin/admin.api';
import { adminQueryKeys, useAdminBackupsQuery } from '@/features/admin/admin.queries';
import type { BackupListItem } from '@/features/admin/admin.types';
import { formatBytes, formatDate } from '@/features/documents/documents.utils';
import { useMeQuery } from '@/features/me/me.queries';
import { SettingsRow, SettingsRows, SettingsSection } from '@/features/settings/components/settings-ui';
import { AdminAccessBoundary } from './admin-shared';

const MANIFEST_FILE_SUFFIX_RE = /\.manifest\.json$/;

export function AdminBackupsPage() {
  const queryClient = useQueryClient();
  const meQuery = useMeQuery();
  const isEnabled = meQuery.data?.isAdmin === true;
  const backupsQuery = useAdminBackupsQuery({ enabled: isEnabled });
  const backups = backupsQuery.data?.backups ?? [];
  const [importFiles, setImportFiles] = useState<File[]>([]);
  const [importInputKey, setImportInputKey] = useState(0);
  const [importStatus, setImportStatus] = useState<string | null>(null);
  const [restoreDialogOpen, setRestoreDialogOpen] = useState(false);
  const [restoreTarget, setRestoreTarget] = useState<BackupListItem | null>(null);
  const [restoreConfirmed, setRestoreConfirmed] = useState(false);

  const createBackupMutation = useMutation({
    mutationFn: createBackup,
    onSuccess: async ({ jobId }) => {
      toast.success(`Backup queued as job ${jobId}.`);
      await queryClient.invalidateQueries({ queryKey: adminQueryKeys.backups() });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Could not queue backup.');
    },
  });

  const restoreBackupMutation = useMutation({
    mutationFn: restoreBackup,
    onSuccess: ({ jobId }) => {
      toast.success(`Restore queued as job ${jobId}.`);
      setRestoreDialogOpen(false);
      setRestoreConfirmed(false);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Could not queue restore.');
    },
  });

  const importBackupMutation = useMutation({
    mutationFn: async (files: File[]) => {
      setImportStatus('Validating backup manifest...');
      const manifestFile = files.find(file => file.name.endsWith('.manifest.json'));

      if (manifestFile === undefined) {
        throw new Error('Select a backup manifest file.');
      }

      const manifest = JSON.parse(await manifestFile.text()) as BackupArchiveManifest;
      const parts = [...(manifest.archive.parts ?? [])].sort((a, b) => a.index - b.index);

      if (parts.length === 0) {
        throw new Error('The selected manifest does not list any backup parts.');
      }

      const selectedFilesByName = new Map(files.map(file => [file.name, file]));
      const missingPart = parts.find(part => !selectedFilesByName.has(part.fileName));
      if (missingPart !== undefined) {
        throw new Error(`Missing backup part ${missingPart.fileName}.`);
      }

      setImportStatus('Importing backup manifest...');
      const imported = await importBackupManifest({ manifest });
      for (const part of parts) {
        setImportStatus(`Uploading part ${part.index} of ${parts.length}...`);
        await uploadBackupPart({
          backupId: imported.backupId,
          file: selectedFilesByName.get(part.fileName)!,
        });
      }

      setImportStatus('Refreshing backup list...');
      return imported;
    },
    onSuccess: async ({ backupId }) => {
      toast.success(`Backup imported as ${backupId}.`);
      setImportFiles([]);
      setImportInputKey(key => key + 1);
      setImportStatus(null);
      await queryClient.invalidateQueries({ queryKey: adminQueryKeys.backups() });
    },
    onError: (error) => {
      setImportStatus(null);
      toast.error(error instanceof Error ? error.message : 'Could not import backup.');
    },
  });

  function openRestoreDialog(backup: BackupListItem) {
    setRestoreTarget(backup);
    setRestoreConfirmed(false);
    setRestoreDialogOpen(true);
  }

  return (
    <AdminAccessBoundary
      title="Backups"
      isEnabled={isEnabled}
      isLoading={meQuery.isLoading}
    >
      <SettingsSection
        title="Archive control"
        density="compact"
        actions={
          <CreateButton
            type="button"
            size="sm"
            disabled={createBackupMutation.isPending}
            onClick={() => createBackupMutation.mutate()}
          >
            {createBackupMutation.isPending ? 'Queueing...' : 'Create'}
          </CreateButton>
        }
      >
        <Box rounded="md" borderWidth="1px" borderColor="orange.muted" bg="orange.subtle" p="3">
          <Text textStyle="sm" color="fg">
            Restoring a backup wipes this instance and replaces users, sessions, settings, vaults,
            documents, chats, audit records, jobs, and storage files with the selected backup.
          </Text>
        </Box>
        {backupsQuery.isLoading ? <Text textStyle="sm" color="fg.muted">Loading backups...</Text> : null}
        {!backupsQuery.isLoading && backups.length === 0 ? (
          <Box rounded="md" borderWidth="1px" borderStyle="dashed" borderColor="border.surface" bg="bg.subtle" p="3" textStyle="sm" color="fg.muted">
            No backups available yet.
          </Box>
        ) : null}

        {backups.length > 0 ? (
          <SettingsRows density="compact">
            {backups.map(backup => (
              <SettingsRow
                density="compact"
                key={backup.id}
                label={backup.fileName}
                description={[
                  `Created ${formatDate(backup.createdAt)}`,
                  formatBytes(backup.size),
                  backup.format === 'encrypted_multipart'
                    ? `${backup.partCount} encrypted ${backup.partCount === 1 ? 'part' : 'parts'}`
                    : 'Legacy archive',
                ].join(' · ')}
                control={
                  <HStack gap="2.5" flexWrap="wrap" justify={{ base: 'flex-start', lg: 'flex-end' }}>
                    <chakra.a
                      href={getBackupDownloadUrl({ backupId: backup.id })}
                      color="teal.solid"
                      fontWeight="semibold"
                      fontSize="sm"
                    >
                      {backup.format === 'encrypted_multipart' ? 'Manifest' : 'Download'}
                    </chakra.a>
                    {backup.format === 'encrypted_multipart'
                      ? Array.from({ length: backup.partCount }, (_, index) => {
                          const partFileName = `${backup.id.replace(MANIFEST_FILE_SUFFIX_RE, '')}.part${String(index + 1).padStart(3, '0')}`;
                          return (
                            <chakra.a
                              key={partFileName}
                              href={getBackupPartDownloadUrl({ backupId: backup.id, partFileName })}
                              color="teal.solid"
                              fontWeight="semibold"
                              fontSize="sm"
                            >
                              Part {index + 1}
                            </chakra.a>
                          );
                        })
                      : null}
                    <RestoreArchiveButton
                      type="button"
                      variant="outline"
                      disabled={restoreBackupMutation.isPending || !backup.restorable}
                      title={backup.restorable ? undefined : 'Backup set is incomplete or invalid'}
                      onClick={() => openRestoreDialog(backup)}
                    >
                      {restoreBackupMutation.isPending && restoreBackupMutation.variables?.backupId === backup.id
                        ? 'Queueing...'
                        : 'Restore'}
                    </RestoreArchiveButton>
                    {!backup.restorable ? (
                      <Text textStyle="xs" color="fg.error">
                        Backup set is incomplete or invalid.
                      </Text>
                    ) : null}
                  </HStack>
                }
              />
            ))}
          </SettingsRows>
        ) : null}
      </SettingsSection>
      <SettingsSection title="Import backup set" density="compact">
        <SettingsRows density="compact">
          <SettingsRow
            density="compact"
            label="Encrypted archive files"
            description="Select the manifest and every encrypted part from the same backup set."
            control={
              <Stack gap="2" align={{ base: 'stretch', lg: 'flex-end' }}>
                <FieldLabel htmlFor="admin-backup-import-files" srOnly>
                  Encrypted archive files
                </FieldLabel>
                <HStack gap="2.5" flexWrap="wrap" justify={{ base: 'flex-start', lg: 'flex-end' }}>
                  <chakra.input
                    id="admin-backup-import-files"
                    key={importInputKey}
                    type="file"
                    multiple
                    maxW="72"
                    fontSize="sm"
                    onChange={(event) => {
                      setImportFiles(Array.from(event.currentTarget.files ?? []));
                    }}
                  />
                  <RestoreArchiveButton
                    type="button"
                    variant="outline"
                    disabled={importBackupMutation.isPending || importFiles.length === 0}
                    onClick={() => importBackupMutation.mutate(importFiles)}
                  >
                    {importBackupMutation.isPending ? 'Importing...' : 'Import'}
                  </RestoreArchiveButton>
                </HStack>
                {importStatus !== null ? (
                  <Text role="status" textStyle="xs" color="fg.muted">
                    {importStatus}
                  </Text>
                ) : null}
              </Stack>
            }
          />
        </SettingsRows>
      </SettingsSection>
      <Dialog
        open={restoreDialogOpen}
        onOpenChange={(open) => {
          setRestoreDialogOpen(open);
          if (!open) setRestoreConfirmed(false);
        }}
        onExitComplete={() => setRestoreTarget(null)}
      >
        <DialogContent maxW="lg">
          <DialogHeader>
            <DialogTitle>Restore backup</DialogTitle>
            <DialogDescription>
              Confirm restore for {restoreTarget?.fileName ?? 'the selected backup'}.
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <Stack gap="4">
              <Box rounded="md" borderWidth="1px" borderColor="orange.muted" bg="orange.subtle" p="3">
                <Text textStyle="sm" color="fg">
                  Restoring this backup wipes this instance and replaces users, sessions, settings,
                  vaults, documents, chats, audit records, jobs, and storage files.
                </Text>
              </Box>
              {restoreTarget !== null ? (
                <Box textStyle="sm" color="fg.muted">
                  <Text>
                    Backup: <chakra.span color="fg" fontWeight="semibold">{restoreTarget.fileName}</chakra.span>
                  </Text>
                  <Text>Created: {formatDate(restoreTarget.createdAt)}</Text>
                </Box>
              ) : null}
              <Checkbox checked={restoreConfirmed} onCheckedChange={setRestoreConfirmed}>
                I understand this restore is destructive and replaces the current instance.
              </Checkbox>
            </Stack>
          </DialogBody>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setRestoreDialogOpen(false)}
            >
              Cancel
            </Button>
            <RestoreArchiveButton
              type="button"
              disabled={
                restoreTarget === null ||
                !restoreConfirmed ||
                restoreBackupMutation.isPending ||
                !restoreTarget.restorable
              }
              onClick={() => {
                if (restoreTarget !== null) {
                  restoreBackupMutation.mutate({ backupId: restoreTarget.id });
                }
              }}
            >
              {restoreBackupMutation.isPending ? 'Queueing...' : 'Queue restore'}
            </RestoreArchiveButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminAccessBoundary>
  );
}

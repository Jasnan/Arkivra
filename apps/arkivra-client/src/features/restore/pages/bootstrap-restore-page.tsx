import { useState } from 'react';
import { Box, HStack, Stack, Text, chakra } from '@chakra-ui/react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { AuthCard } from '@/features/auth/auth-layout';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Field, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import type { BackupArchiveManifest } from '@/features/admin/admin.api';
import {
  getBootstrapRestoreStatus,
  importBootstrapBackupManifest,
  restoreBootstrapBackup,
  uploadBootstrapBackupPart,
} from '@/features/admin/admin.api';

function parseBackupSelection(files: File[]) {
  const manifestFile = files.find(file => file.name.endsWith('.manifest.json'));

  if (manifestFile === undefined) {
    throw new Error('Select a backup manifest file.');
  }

  return {
    manifestFile,
    filesByName: new Map(files.map(file => [file.name, file])),
  };
}

export function BootstrapRestorePage() {
  const [token, setToken] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [confirmed, setConfirmed] = useState(false);
  const [message, setMessage] = useState<{ tone: 'status' | 'error'; text: string } | null>(null);

  const statusQuery = useQuery({
    queryKey: ['bootstrap-restore-status'],
    queryFn: getBootstrapRestoreStatus,
    retry: false,
  });

  const restoreMutation = useMutation({
    mutationFn: async () => {
      const trimmedToken = token.trim();
      if (trimmedToken.length === 0) {
        throw new Error('Enter the restore bootstrap token.');
      }

      if (!confirmed) {
        throw new Error('Confirm that this restore will replace the instance.');
      }

      const { manifestFile, filesByName } = parseBackupSelection(files);
      const manifest = JSON.parse(await manifestFile.text()) as BackupArchiveManifest;
      const parts = [...manifest.archive.parts].sort((a, b) => a.index - b.index);

      if (parts.length === 0) {
        throw new Error('The selected manifest does not list any backup parts.');
      }

      const missingPart = parts.find(part => !filesByName.has(part.fileName));
      if (missingPart !== undefined) {
        throw new Error(`Missing backup part ${missingPart.fileName}.`);
      }

      const imported = await importBootstrapBackupManifest({
        manifest,
        token: trimmedToken,
      });

      for (const part of parts) {
        await uploadBootstrapBackupPart({
          backupId: imported.backupId,
          file: filesByName.get(part.fileName)!,
          token: trimmedToken,
        });
      }

      return restoreBootstrapBackup({
        backupId: imported.backupId,
        token: trimmedToken,
      });
    },
    onSuccess: ({ jobId }) => {
      setMessage({
        tone: 'status',
        text: `Restore queued as job ${jobId}. When it finishes, sign in with an account from the restored backup.`,
      });
    },
    onError: (error) => {
      setMessage({
        tone: 'error',
        text: error instanceof Error ? error.message : 'Could not restore backup.',
      });
    },
  });

  const status = statusQuery.data;
  const unavailable = status !== undefined && (!status.available || !status.archiveEncryptionConfigured);
  const unavailableReason = !status?.archiveEncryptionConfigured
    ? 'Bootstrap restore requires ARKIVRA_BACKUP_ENCRYPTION_KEY before encrypted backup sets can be restored.'
    : status?.reason === 'restore.bootstrap_token_missing'
      ? 'Bootstrap restore requires ARKIVRA_RESTORE_BOOTSTRAP_TOKEN.'
      : status?.reason === 'restore.instance_initialized'
        ? 'Bootstrap restore is disabled because this instance already has an active admin account.'
        : 'Bootstrap restore is unavailable for this instance.';
  const restoreDisabled =
    restoreMutation.isPending ||
    files.length === 0 ||
    token.trim().length === 0 ||
    !confirmed ||
    unavailable ||
    statusQuery.isLoading ||
    statusQuery.isError;

  return (
    <AuthCard
      title="Restore Arkivra"
      subtitle="Bootstrap a fresh instance from an encrypted backup set."
    >
      <Stack gap="4">
        <Box rounded="md" borderWidth="1px" borderColor="orange.muted" bg="orange.subtle" p="3">
          <Text textStyle="sm" color="fg">
            Restore replaces this instance with the backup contents. Existing users, sessions,
            settings, vaults, documents, chats, audit records, and storage files on this instance
            will be wiped and replaced.
          </Text>
        </Box>

        {statusQuery.isLoading ? (
          <Text role="status" textStyle="sm" color="fg.muted">Checking restore availability...</Text>
        ) : null}

        {statusQuery.isError ? (
          <Box role="alert" rounded="md" borderWidth="1px" borderColor="red.muted" bg="red.subtle" p="3">
            <Text textStyle="sm" color="fg">
              Could not check restore availability. Restore is disabled until the server status can
              be verified.
            </Text>
          </Box>
        ) : null}

        {unavailable ? (
          <Box role="alert" rounded="md" borderWidth="1px" borderColor="border.surface" bg="bg.subtle" p="3">
            <Text textStyle="sm" color="fg.muted">
              {unavailableReason}
            </Text>
          </Box>
        ) : null}

        <Field>
          <FieldLabel htmlFor="restore-bootstrap-token">Restore bootstrap token</FieldLabel>
          <Input
            id="restore-bootstrap-token"
            type="password"
            autoComplete="off"
            value={token}
            onChange={event => setToken(event.currentTarget.value)}
          />
        </Field>

        <Field>
          <FieldLabel htmlFor="restore-backup-set-files">Backup set files</FieldLabel>
          <chakra.input
            id="restore-backup-set-files"
            type="file"
            multiple
            fontSize="sm"
            onChange={(event) => {
              setFiles(Array.from(event.currentTarget.files ?? []));
            }}
          />
        </Field>

        <HStack align="flex-start" gap="2">
          <Checkbox checked={confirmed} onCheckedChange={setConfirmed}>
            I understand this restore will wipe this instance and replace it with the selected backup.
          </Checkbox>
        </HStack>

        {message !== null ? (
          <Text
            role={message.tone === 'error' ? 'alert' : 'status'}
            textStyle="sm"
            color={message.tone === 'error' ? 'fg.error' : 'fg.muted'}
          >
            {message.text}
          </Text>
        ) : null}

        <Button
          type="button"
          disabled={restoreDisabled}
          onClick={() => restoreMutation.mutate()}
        >
          {restoreMutation.isPending ? 'Restoring...' : 'Restore backup'}
        </Button>
      </Stack>
    </AuthCard>
  );
}

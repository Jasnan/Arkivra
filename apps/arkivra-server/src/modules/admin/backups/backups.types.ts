export type BackupListItem = {
  id: string;
  fileName: string;
  size: number;
  createdAt: string;
  format: 'legacy_tar_gz' | 'encrypted_multipart';
  partCount: number;
  restorable: boolean;
  corruptReason: string | null;
};

export type CreateBackupJobResult = {
  jobId: string;
};

export type RestoreBackupJobResult = {
  jobId: string;
};

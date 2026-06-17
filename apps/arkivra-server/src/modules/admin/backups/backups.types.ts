export type BackupListItem = {
  id: string;
  fileName: string;
  size: number;
  createdAt: string;
};

export type CreateBackupJobResult = {
  jobId: string;
};

export type RestoreBackupJobResult = {
  jobId: string;
};

export interface Tag {
  id: string;
  vaultId?: string;
  vaultName?: string;
  name: string;
  color: string | null;
  description?: string | null;
  documentsCount?: number;
  createdAt?: string;
  updatedAt?: string;
}

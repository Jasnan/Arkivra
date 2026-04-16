export interface Tag {
  id: string;
  vaultId?: string;
  vaultName?: string;
  name: string;
  color: string | null;
  documentsCount?: number;
}

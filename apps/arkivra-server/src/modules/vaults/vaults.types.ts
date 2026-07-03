import type {
  VaultRole,
} from '../authorization/authorization.types.js';

export type { VaultRole };

export type VaultAccess = {
  id: string;
  name: string;
  description: string | null;
  fileCount: number;
  totalSize: number;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
  role: VaultRole | null;
  isAdmin: boolean;
  isMember: boolean;
};

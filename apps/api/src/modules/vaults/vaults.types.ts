import type {
  AiAccessLevel,
  VaultRole,
} from '../authorization/authorization.types.js';

export type { AiAccessLevel, VaultRole };

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
  aiAccessLevel: AiAccessLevel;
  isAdmin: boolean;
  isMember: boolean;
  accessMode: 'member' | 'admin';
};

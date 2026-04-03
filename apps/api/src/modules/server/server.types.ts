import type { Session, User } from 'better-auth';
import type { VaultRole } from '../vaults/vaults.types.js';

export type AuthSessionData = {
  user: User;
  session: Session;
};

export type ServerContext = {
  Variables: {
    userId: string | null;
    session: Session | null;
    vaultId: string | null;
    vaultRole: VaultRole | null;
  };
};

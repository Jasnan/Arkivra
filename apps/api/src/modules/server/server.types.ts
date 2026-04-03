import type { Session, User } from 'better-auth';
import type { VaultMemberPermission } from '../authorization/authorization.types.js';
import type { VaultRole } from '../vaults/vaults.types.js';

export type AuthSessionData = {
  user: User;
  session: Session;
};

export type ServerContext = {
  Variables: {
    userId: string | null;
    session: Session | null;
    userDisabled: boolean;
    isGlobalAdmin: boolean;
    vaultId: string | null;
    vaultRole: VaultRole | null;
    vaultPermissions: VaultMemberPermission[];
  };
};

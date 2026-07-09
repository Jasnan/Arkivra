import type { Session, User } from 'better-auth';
import type {
  SystemCapability,
  SystemRole,
  VaultRole,
} from '../authorization/authorization.types.js';

export type AuthSessionData = {
  user: User;
  session: Session;
};

export type ServerContext = {
  Variables: {
    userId: string | null;
    user: User | null;
    session: Session | null;
    userDisabled: boolean;
    systemRole: SystemRole | null;
    systemCapabilities: SystemCapability[];
    isAdmin: boolean;
    canCreateVault: boolean;
    canUseAI: boolean;
    vaultId: string | null;
    vaultRole: VaultRole | null;
    vaultIsMember: boolean;
  };
};

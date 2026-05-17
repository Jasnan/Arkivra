import type { Session, User } from 'better-auth';
import type {
  AiAccessLevel,
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
    isRoot: boolean;
    canCreateVault: boolean;
    vaultId: string | null;
    vaultRole: VaultRole | null;
    vaultAiAccessLevel: AiAccessLevel;
  };
};

import type { Session, User } from 'better-auth';

export type AuthSessionData = {
  user: User;
  session: Session;
};

export type ServerContext = {
  Variables: {
    userId: string | null;
    session: Session | null;
  };
};

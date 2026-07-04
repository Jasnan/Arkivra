'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

import { BaseLayout } from '@/components/layouts/base-layout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { getMe } from '../ai-settings/ai-settings.api';
import {
  approvePermissionRequest,
  createPlatformAccountInvitation,
  grantAdmin,
  grantSystemCapability,
  listAdminUsers,
  listPermissionRequests,
  rejectPermissionRequest,
  revokeAdmin,
  revokeSystemCapability,
  updateAdminUser,
  type AdminUser,
  type EmailInvitation,
  type InviteUserInput,
  type PermissionRequest,
} from './admin-users.api';
import { ApprovalRequestsTable } from './components/approval-requests-table';
import { DataTable } from './components/data-table';
import { StatCards } from './components/stat-cards';

interface AsyncState<T> {
  data: T | null;
  isLoading: boolean;
  error: Error | null;
}

const emptyMeState: AsyncState<{ isAdmin: boolean }> = {
  data: null,
  isLoading: true,
  error: null,
};

const emptyUsersState: AsyncState<{ users: AdminUser[] }> = {
  data: null,
  isLoading: true,
  error: null,
};

const emptyPermissionRequestsState: AsyncState<{ requests: PermissionRequest[] }> = {
  data: null,
  isLoading: true,
  error: null,
};

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function upsertUser(users: AdminUser[], nextUser: AdminUser) {
  return users.map((user) => (user.id === nextUser.id ? nextUser : user));
}

export default function UsersPage() {
  const [meState, setMeState] = useState<AsyncState<{ isAdmin: boolean }>>(emptyMeState);
  const [usersState, setUsersState] = useState<AsyncState<{ users: AdminUser[] }>>(emptyUsersState);
  const [permissionRequestsState, setPermissionRequestsState] = useState<
    AsyncState<{ requests: PermissionRequest[] }>
  >(emptyPermissionRequestsState);
  const [mutationPending, setMutationPending] = useState(false);
  const [approvalMutationPending, setApprovalMutationPending] = useState(false);

  const users = useMemo(() => usersState.data?.users ?? [], [usersState.data?.users]);
  const permissionRequests = useMemo(
    () => permissionRequestsState.data?.requests ?? [],
    [permissionRequestsState.data?.requests],
  );
  const isAdmin = meState.data?.isAdmin === true;

  const loadMe = useCallback(async () => {
    setMeState({ data: null, isLoading: true, error: null });

    try {
      const me = await getMe();
      setMeState({ data: { isAdmin: me.isAdmin }, isLoading: false, error: null });
    } catch (error) {
      setMeState({
        data: null,
        isLoading: false,
        error: error instanceof Error ? error : new Error('Unable to load account.'),
      });
    }
  }, []);

  const loadUsers = useCallback(async () => {
    setUsersState((current) => ({
      data: current.data,
      isLoading: true,
      error: null,
    }));

    try {
      const result = await listAdminUsers();
      setUsersState({ data: result, isLoading: false, error: null });
    } catch (error) {
      setUsersState({
        data: null,
        isLoading: false,
        error: error instanceof Error ? error : new Error('Unable to load users.'),
      });
    }
  }, []);

  const loadPermissionRequests = useCallback(async () => {
    setPermissionRequestsState((current) => ({
      data: current.data,
      isLoading: true,
      error: null,
    }));

    try {
      const result = await listPermissionRequests({ status: 'pending' });
      setPermissionRequestsState({ data: result, isLoading: false, error: null });
    } catch (error) {
      setPermissionRequestsState({
        data: null,
        isLoading: false,
        error: error instanceof Error ? error : new Error('Unable to load approval requests.'),
      });
    }
  }, []);

  useEffect(() => {
    void loadMe();
  }, [loadMe]);

  useEffect(() => {
    if (isAdmin) {
      void loadUsers();
      void loadPermissionRequests();
    }
  }, [isAdmin, loadPermissionRequests, loadUsers]);

  const updateUserInState = useCallback((user: AdminUser) => {
    setUsersState((current) => ({
      ...current,
      data: current.data ? { users: upsertUser(current.data.users, user) } : current.data,
    }));
  }, []);

  const runUserMutation = useCallback(
    async (
      action: () => Promise<{ user: AdminUser }>,
      successMessage: string,
      errorMessage: string,
    ) => {
      setMutationPending(true);

      try {
        const result = await action();
        updateUserInState(result.user);
        toast.success(successMessage);
      } catch (error) {
        toast.error(getErrorMessage(error, errorMessage));
      } finally {
        setMutationPending(false);
      }
    },
    [updateUserInState],
  );

  const runApprovalMutation = useCallback(
    async (
      action: () => Promise<{ request: PermissionRequest }>,
      successMessage: string,
      errorMessage: string,
    ) => {
      setApprovalMutationPending(true);

      try {
        await action();
        await Promise.all([loadPermissionRequests(), loadUsers()]);
        toast.success(successMessage);
      } catch (error) {
        toast.error(getErrorMessage(error, errorMessage));
      } finally {
        setApprovalMutationPending(false);
      }
    },
    [loadPermissionRequests, loadUsers],
  );

  async function handleInviteUser(input: InviteUserInput): Promise<EmailInvitation> {
    setMutationPending(true);

    try {
      const result = await createPlatformAccountInvitation({
        email: input.email,
        systemRole: input.systemRole,
        systemCapabilities: [
          ...(input.canUseAI ? ['system.use_ai' as const] : []),
          ...(input.canCreateVaults ? ['system.create_vaults' as const] : []),
        ],
      });
      toast.success(`Invitation created for ${result.invitation.email}.`);
      return result.invitation;
    } catch (error) {
      toast.error(getErrorMessage(error, 'Could not create invitation.'));
      throw error;
    } finally {
      setMutationPending(false);
    }
  }

  if (meState.isLoading) {
    return (
      <BaseLayout
        title="Users"
        description="Manage platform administrators and platform privileges."
      >
        <div className="px-4 lg:px-6">
          <div className="rounded-md border p-4 text-sm text-muted-foreground">
            Loading account...
          </div>
        </div>
      </BaseLayout>
    );
  }

  if (meState.error) {
    return (
      <BaseLayout
        title="Users"
        description="Manage platform administrators and platform privileges."
      >
        <div className="px-4 lg:px-6">
          <Card>
            <CardHeader>
              <CardTitle>Could not load account</CardTitle>
              <CardDescription>{meState.error.message}</CardDescription>
            </CardHeader>
          </Card>
        </div>
      </BaseLayout>
    );
  }

  if (!isAdmin) {
    return (
      <BaseLayout
        title="Users"
        description="Manage platform administrators and platform privileges."
      >
        <div className="px-4 lg:px-6">
          <Card>
            <CardHeader>
              <CardTitle>Platform administrator required</CardTitle>
              <CardDescription>
                Only platform administrators can manage users and platform privileges.
              </CardDescription>
            </CardHeader>
          </Card>
        </div>
      </BaseLayout>
    );
  }

  return (
    <BaseLayout title="Users" description="Manage platform administrators and platform privileges.">
      <div className="flex flex-col gap-4">
        <div className="@container/main px-4 lg:px-6">
          <Card>
            <CardContent>
              <Tabs defaultValue="users" className="gap-6">
                <TabsList>
                  <TabsTrigger value="users" className="cursor-pointer">
                    Users
                  </TabsTrigger>
                  <TabsTrigger value="approval-requests" className="cursor-pointer">
                    Approval requests
                    <Badge
                      variant="secondary"
                      className="ml-1 h-5 min-w-5 rounded-full px-1 text-xs"
                    >
                      {permissionRequests.length}
                    </Badge>
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="users" className="space-y-8">
                  <StatCards users={users} />

                  <DataTable
                    users={users}
                    isLoading={usersState.isLoading}
                    error={usersState.error}
                    mutationPending={mutationPending}
                    onInviteUser={handleInviteUser}
                    onRetry={loadUsers}
                    onDisableUser={(user) =>
                      runUserMutation(
                        () => updateAdminUser({ userId: user.id, disabled: true }),
                        'User disabled.',
                        'Could not disable user.',
                      )
                    }
                    onEnableUser={(user) =>
                      runUserMutation(
                        () => updateAdminUser({ userId: user.id, disabled: false }),
                        'User re-enabled.',
                        'Could not re-enable user.',
                      )
                    }
                    onGrantAdmin={(user) =>
                      runUserMutation(
                        () => grantAdmin({ userId: user.id }),
                        'Platform administrator granted.',
                        'Could not grant platform administrator.',
                      )
                    }
                    onRevokeAdmin={(user) =>
                      runUserMutation(
                        () => revokeAdmin({ userId: user.id }),
                        'Platform administrator revoked.',
                        'Could not revoke platform administrator.',
                      )
                    }
                    onGrantCreateVaults={(user) =>
                      runUserMutation(
                        () =>
                          grantSystemCapability({
                            userId: user.id,
                            capability: 'system.create_vaults',
                          }),
                        'Vault creation permission granted.',
                        'Could not grant vault creation permission.',
                      )
                    }
                    onRevokeCreateVaults={(user) =>
                      runUserMutation(
                        () =>
                          revokeSystemCapability({
                            userId: user.id,
                            capability: 'system.create_vaults',
                          }),
                        'Vault creation permission revoked.',
                        'Could not revoke vault creation permission.',
                      )
                    }
                    onGrantUseAI={(user) =>
                      runUserMutation(
                        () =>
                          grantSystemCapability({ userId: user.id, capability: 'system.use_ai' }),
                        'Use AI privilege granted.',
                        'Could not grant Use AI privilege.',
                      )
                    }
                    onRevokeUseAI={(user) =>
                      runUserMutation(
                        () =>
                          revokeSystemCapability({ userId: user.id, capability: 'system.use_ai' }),
                        'Use AI privilege revoked.',
                        'Could not revoke Use AI privilege.',
                      )
                    }
                  />
                </TabsContent>

                <TabsContent value="approval-requests">
                  <ApprovalRequestsTable
                    requests={permissionRequests}
                    isLoading={permissionRequestsState.isLoading}
                    error={permissionRequestsState.error}
                    mutationPending={approvalMutationPending}
                    onRetry={loadPermissionRequests}
                    onApprove={(request) =>
                      runApprovalMutation(
                        () => approvePermissionRequest({ requestId: request.id }),
                        'Request approved.',
                        'Could not approve request.',
                      )
                    }
                    onReject={(request) =>
                      runApprovalMutation(
                        () => rejectPermissionRequest({ requestId: request.id }),
                        'Request rejected.',
                        'Could not reject request.',
                      )
                    }
                  />
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </div>
      </div>
    </BaseLayout>
  );
}

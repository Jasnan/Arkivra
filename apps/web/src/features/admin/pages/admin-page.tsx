import type { FormEvent, MouseEvent, ReactNode } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Box, Flex, Grid, HStack, Portal, SimpleGrid, Stack, Text, chakra } from '@chakra-ui/react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Check, CheckCircle2, Clock3, Info, Lightbulb, Mail, Plus, Search, Send, ShieldCheck, ShieldX, Trash2, UserRound, UserRoundPlus, UsersRound } from 'lucide-react';
import { toast } from 'sonner';
import { ActionMenuItemIcon, ActionMenuTriggerButton } from '@/components/ui/action-menu';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  CreateButton,
  RestoreArchiveButton,
  SaveButton,
} from '@/components/ui/action-buttons';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  approvePermissionRequest,
  createBackup,
  createRootEmailInvitation,
  getBackupDownloadUrl,
  rejectPermissionRequest,
  restoreBackup,
  updateAdminAiSettings,
  updateAdminUser,
} from '@/features/admin/admin.api';
import {
  adminQueryKeys,
  useAdminAiSettingsQuery,
  useAdminBackupsQuery,
  useAdminUsersQuery,
  useAdminVaultsQuery,
  usePermissionRequestsQuery,
} from '@/features/admin/admin.queries';
import type { AdminAiSettings, AdminUser, PermissionRequest } from '@/features/admin/admin.types';
import type { AiAccessLevel, VaultRole } from '@/features/vaults/vaults.types';
import { formatBytes, formatDate } from '@/features/documents/documents.utils';
import { useMeQuery } from '@/features/me/me.queries';
import {
  KeyValueRows,
  SettingsPageFrame,
  SettingsRow,
  SettingsRows,
  SettingsSection,
} from '@/features/settings/components/settings-ui';

type AdminUserStatusFilter = 'all' | 'active' | 'disabled';
type AdminUserAccessFilter = 'all' | 'root' | 'create-vaults' | 'member';
type InviteSystemRole = 'root' | 'member';
interface InviteVaultMembershipDraft {
  id: string;
  vaultId: string;
  role: VaultRole;
  aiAccessLevel: AiAccessLevel;
}

type AdminUserActionKey = 'manage-access' | 'resend-invitation' | 'deactivate-user' | 'view-activity';

interface AdminUserAction {
  key: AdminUserActionKey;
  label: string;
  description: string;
  icon: typeof UserRound;
  tone?: 'default' | 'success' | 'destructive';
  disabled?: boolean;
  onSelect: () => void;
}

type AdminUserContextMenuState = {
  user: AdminUser;
  x: number;
  y: number;
} | null;

const ADMIN_USERS_GRID_COLUMNS = 'minmax(14rem, 1.45fr) 8.5rem 8rem 8.5rem minmax(8rem, 0.8fr) minmax(9rem, 0.85fr) 3rem';

const userStatusFilterOptions = [
  { value: 'all', label: 'All statuses' },
  { value: 'active', label: 'Active' },
  { value: 'disabled', label: 'Disabled' },
];

const userAccessFilterOptions = [
  { value: 'all', label: 'All roles' },
  { value: 'root', label: 'Root' },
  { value: 'create-vaults', label: 'Can create vaults' },
  { value: 'member', label: 'Member' },
];

const inviteSystemRoleOptions: Array<{ value: InviteSystemRole; label: string }> = [
  { value: 'member', label: 'Member' },
  { value: 'root', label: 'Root' },
];

const inviteVaultRoleOptions: Array<{ value: VaultRole; label: string }> = [
  { value: 'viewer', label: 'Viewer' },
  { value: 'editor', label: 'Editor' },
  { value: 'owner', label: 'Owner' },
];

const inviteAiAccessOptions: Array<{ value: AiAccessLevel; label: string }> = [
  { value: 'none', label: 'No AI access' },
  { value: 'document_chat', label: 'Document chat' },
  { value: 'full', label: 'Full AI access' },
];

let inviteVaultMembershipDraftId = 0;

const createInviteVaultMembershipDraft = (): InviteVaultMembershipDraft => ({
  id: `invite-vault-${inviteVaultMembershipDraftId += 1}`,
  vaultId: '',
  role: 'viewer',
  aiAccessLevel: 'none',
});

function formatCount(value: number | undefined, singular: string, plural = `${singular}s`) {
  const safeValue = value ?? 0;
  return `${safeValue} ${safeValue === 1 ? singular : plural}`;
}

function getUserRoleLabel(user: AdminUser) {
  return user.isRoot ? 'Root' : 'Member';
}

function getUserAccessSummary(user: AdminUser) {
  if (user.isRoot) return 'All vaults';
  if (user.canCreateVault) return 'Can create vaults';
  return 'Member access';
}

function getUserInitial(user: AdminUser) {
  const source = user.name?.trim() || user.email.trim();
  return source.charAt(0).toUpperCase() || '?';
}

function formatJoinedDate(value: string) {
  const date = new Date(value);

  return {
    date: new Intl.DateTimeFormat('en', { dateStyle: 'medium' }).format(date),
    time: new Intl.DateTimeFormat('en', { timeStyle: 'short' }).format(date),
  };
}

function AdminUserActionItem({
  action,
  onSelect,
}: {
  action: AdminUserAction;
  onSelect: () => void;
}) {
  const iconTone = action.tone === 'destructive' ? 'destructive' : 'default';

  return (
    <DropdownMenuItem
      value={action.key}
      disabled={action.disabled}
      color={action.tone === 'destructive' ? 'fg.error' : action.tone === 'success' ? 'fg.success' : 'fg'}
      alignItems="flex-start"
      gap="3"
      px="3"
      py="3"
      onSelect={onSelect}
    >
      <ActionMenuItemIcon icon={action.icon} tone={iconTone} />
      <Stack gap="0.5" minW="0">
        <Text textStyle="sm" fontWeight="semibold" color={action.tone === 'destructive' ? 'fg.error' : action.tone === 'success' ? 'fg.success' : 'fg'}>
          {action.label}
        </Text>
        <Text textStyle="xs" color="fg.muted">
          {action.description}
        </Text>
      </Stack>
    </DropdownMenuItem>
  );
}

function AdminUserActionMenuItems({ actions }: { actions: AdminUserAction[] }) {
  return (
    <>
      {actions.map((action) => (
        <AdminUserActionItem
          key={action.key}
          action={action}
          onSelect={action.onSelect}
        />
      ))}
    </>
  );
}

function AdminUserContextMenu({
  actions,
  onClose,
  state,
}: {
  state: Exclude<AdminUserContextMenuState, null>;
  actions: AdminUserAction[];
  onClose: () => void;
}) {
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function closeOnEscape(event: globalThis.KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose();
      }
    }

    function closeOnOutsidePointer(event: PointerEvent) {
      const target = event.target;
      if (target instanceof Node && menuRef.current?.contains(target)) {
        return;
      }

      onClose();
    }

    function closeOnOutsideContextMenu(event: globalThis.MouseEvent) {
      const target = event.target;
      if (target instanceof Node && menuRef.current?.contains(target)) {
        return;
      }

      onClose();
    }

    window.addEventListener('keydown', closeOnEscape);
    window.addEventListener('resize', onClose);
    window.addEventListener('scroll', onClose, { capture: true });
    window.document.addEventListener('pointerdown', closeOnOutsidePointer, { capture: true });
    window.document.addEventListener('contextmenu', closeOnOutsideContextMenu, { capture: true });

    return () => {
      window.removeEventListener('keydown', closeOnEscape);
      window.removeEventListener('resize', onClose);
      window.removeEventListener('scroll', onClose, { capture: true });
      window.document.removeEventListener('pointerdown', closeOnOutsidePointer, { capture: true });
      window.document.removeEventListener('contextmenu', closeOnOutsideContextMenu, { capture: true });
    };
  }, [onClose]);

  return (
    <Portal>
      <Box
        ref={menuRef}
        role="menu"
        aria-label={`User actions for ${state.user.email}`}
        position="fixed"
        zIndex="popover"
        w="20rem"
        maxW="calc(100vw - 1rem)"
        left={`${state.x}px`}
        top={`${state.y}px`}
        rounded="lg"
        borderWidth="1px"
        borderColor="border.subtle"
        bg="bg.surface"
        p="1.5"
        shadow="xl"
        onClick={(event) => event.stopPropagation()}
        onContextMenu={(event) => event.preventDefault()}
      >
        {actions.map((action) => (
          <chakra.button
            key={action.key}
            type="button"
            role="menuitem"
            disabled={action.disabled}
            display="flex"
            w="full"
            alignItems="flex-start"
            gap="3"
            rounded="md"
            px="3"
            py="3"
            textAlign="left"
            color={action.tone === 'destructive' ? 'fg.error' : action.tone === 'success' ? 'fg.success' : 'fg'}
            _hover={{ bg: action.tone === 'success' ? 'teal.subtle' : 'bg.subtle' }}
            _disabled={{ cursor: 'not-allowed', opacity: 0.5 }}
            _focusVisible={{ outline: '2px solid', outlineColor: 'teal.solid', outlineOffset: '2px' }}
            onClick={() => {
              onClose();
              window.setTimeout(action.onSelect, 0);
            }}
          >
            <ActionMenuItemIcon icon={action.icon} tone={action.tone === 'destructive' ? 'destructive' : 'default'} />
            <Stack gap="0.5" minW="0">
              <Text textStyle="sm" fontWeight="semibold">
                {action.label}
              </Text>
              <Text textStyle="xs" color="fg.muted">
                {action.description}
              </Text>
            </Stack>
          </chakra.button>
        ))}
      </Box>
    </Portal>
  );
}

function getUserAccessFilter(user: AdminUser): AdminUserAccessFilter {
  if (user.isRoot) return 'root';
  if (user.systemCapabilities.includes('system.create_vaults')) return 'create-vaults';
  return 'member';
}

function getPermissionRequestLabel(request: PermissionRequest) {
  if (request.type === 'vault.create') return 'Create vault';
  if (request.type === 'vault.delete') return 'Delete vault';
  if (request.type === 'vault.owner_promote') return 'Promote owner';
  return 'AI access escalation';
}

function getPermissionRequestDescription(request: PermissionRequest) {
  if (request.type === 'vault.create') {
    const name = typeof request.payload.name === 'string' ? request.payload.name : 'Untitled vault';
    return `Requested by ${request.requestedBy} for "${name}".`;
  }

  if (request.type === 'vault.delete') {
    return `Requested by ${request.requestedBy} for vault ${request.vaultId ?? 'unknown'}.`;
  }

  if (request.type === 'vault.owner_promote') {
    return `Requested by ${request.requestedBy} for ${request.targetUserId ?? 'unknown user'}.`;
  }

  const aiAccessLevel = typeof request.payload.aiAccessLevel === 'string' ? request.payload.aiAccessLevel : 'AI access';
  return `Requested by ${request.requestedBy} for ${request.targetUserId ?? 'unknown user'}: ${aiAccessLevel}.`;
}

const emptyAiSettings: AdminAiSettings = {
  ollamaHost: '',
  model: '',
};

function AdminAccessBoundary({
  accessTitle,
  children,
  description,
  isEnabled,
  isLoading,
  title,
}: {
  title?: ReactNode;
  accessTitle?: string;
  description?: ReactNode;
  isEnabled: boolean;
  isLoading: boolean;
  children: ReactNode;
}) {
  if (isLoading) {
    return <Text textStyle="sm">Loading root context...</Text>;
  }

  if (!isEnabled) {
    return (
      <SettingsPageFrame title={title ?? accessTitle} description="Root access is required to open this page.">
        <Alert variant="destructive">
          <AlertDescription>
            Root access is required to open this page.
          </AlertDescription>
        </Alert>
      </SettingsPageFrame>
    );
  }

  return (
    <SettingsPageFrame title={title} description={description}>
      {children}
    </SettingsPageFrame>
  );
}

export function AdminOverviewPage() {
  const queryClient = useQueryClient();
  const meQuery = useMeQuery();
  const isEnabled = meQuery.data?.isRoot === true;
  const usersQuery = useAdminUsersQuery({ enabled: isEnabled });
  const backupsQuery = useAdminBackupsQuery({ enabled: isEnabled });
  const vaultsQuery = useAdminVaultsQuery({ enabled: isEnabled });
  const permissionRequestsQuery = usePermissionRequestsQuery({ enabled: isEnabled });
  const backups = backupsQuery.data?.backups ?? [];
  const users = usersQuery.data?.users ?? [];
  const vaults = vaultsQuery.data?.vaults ?? [];
  const permissionRequests = permissionRequestsQuery.data?.requests ?? [];

  const approveRequestMutation = useMutation({
    mutationFn: approvePermissionRequest,
    onSuccess: async () => {
      toast.success('Request approved.');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: adminQueryKeys.permissionRequests('pending') }),
        queryClient.invalidateQueries({ queryKey: adminQueryKeys.users() }),
        queryClient.invalidateQueries({ queryKey: adminQueryKeys.vaults() }),
      ]);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Could not approve request.');
    },
  });

  const rejectRequestMutation = useMutation({
    mutationFn: ({ requestId }: { requestId: string }) => rejectPermissionRequest({ requestId }),
    onSuccess: async () => {
      toast.success('Request rejected.');
      await queryClient.invalidateQueries({ queryKey: adminQueryKeys.permissionRequests('pending') });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Could not reject request.');
    },
  });

  return (
    <AdminAccessBoundary
      title="Overview"
      isEnabled={isEnabled}
      isLoading={meQuery.isLoading}
    >
      <SettingsSection title="Instance overview" description="Current installation-wide resources visible to the admin API.">
        <KeyValueRows
          rows={[
            { label: 'Backups', value: backupsQuery.isLoading ? 'Loading...' : formatCount(backups.length, 'archive') },
            { label: 'Users', value: usersQuery.isLoading ? 'Loading...' : formatCount(users.length, 'account') },
            { label: 'Vaults', value: vaultsQuery.isLoading ? 'Loading...' : formatCount(vaults.length, 'vault') },
          ]}
        />
      </SettingsSection>

      <SettingsSection title="Approval queue" description="Pending authorization requests requiring root review.">
        {permissionRequestsQuery.isLoading ? <Text textStyle="sm" color="fg.muted">Loading requests...</Text> : null}
        {!permissionRequestsQuery.isLoading && permissionRequests.length === 0 ? (
          <Box rounded="md" borderWidth="1px" borderStyle="dashed" borderColor="border.subtle" bg="bg.subtle" p="4" textStyle="sm" color="fg.muted">
            No pending requests.
          </Box>
        ) : null}
        {permissionRequests.length > 0 ? (
          <SettingsRows>
            {permissionRequests.map((request) => (
              <SettingsRow
                key={request.id}
                label={getPermissionRequestLabel(request)}
                description={getPermissionRequestDescription(request)}
                meta={
                  <HStack gap="2" justify={{ base: 'flex-start', lg: 'flex-end' }} flexWrap="wrap">
                    <SaveButton
                      type="button"
                      size="sm"
                      disabled={approveRequestMutation.isPending || rejectRequestMutation.isPending}
                      onClick={() => approveRequestMutation.mutate({ requestId: request.id })}
                    >
                      Approve
                    </SaveButton>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={approveRequestMutation.isPending || rejectRequestMutation.isPending}
                      onClick={() => rejectRequestMutation.mutate({ requestId: request.id })}
                    >
                      Reject
                    </Button>
                  </HStack>
                }
              />
            ))}
          </SettingsRows>
        ) : null}
      </SettingsSection>

    </AdminAccessBoundary>
  );
}

export function AdminBackupsPage() {
  const queryClient = useQueryClient();
  const meQuery = useMeQuery();
  const isEnabled = meQuery.data?.isRoot === true;
  const backupsQuery = useAdminBackupsQuery({ enabled: isEnabled });
  const backups = backupsQuery.data?.backups ?? [];

  const createBackupMutation = useMutation({
    mutationFn: createBackup,
    onSuccess: async ({ jobId }) => {
      toast.success(`Backup queued as job ${jobId}.`);
      await queryClient.invalidateQueries({ queryKey: adminQueryKeys.backups() });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Could not queue backup.');
    },
  });

  const restoreBackupMutation = useMutation({
    mutationFn: restoreBackup,
    onSuccess: ({ jobId }) => {
      toast.success(`Restore queued as job ${jobId}.`);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Could not queue restore.');
    },
  });

  return (
    <AdminAccessBoundary
      title="Backups"
      description="Create a new archive or restore one already stored on the server."
      isEnabled={isEnabled}
      isLoading={meQuery.isLoading}
    >
      <SettingsSection
        title="Archive control"
        description="Backups are installation-wide and affect all vaults and users."
        actions={
          <CreateButton
            type="button"
            size="sm"
            disabled={createBackupMutation.isPending}
            onClick={() => createBackupMutation.mutate()}
          >
            {createBackupMutation.isPending ? 'Queueing...' : 'Create backup'}
          </CreateButton>
        }
      >
        {backupsQuery.isLoading ? <Text textStyle="sm" color="fg.muted">Loading backups...</Text> : null}
        {!backupsQuery.isLoading && backups.length === 0 ? (
          <Box rounded="md" borderWidth="1px" borderStyle="dashed" borderColor="border.subtle" bg="bg.subtle" p="4" textStyle="sm" color="fg.muted">
            No backups available yet.
          </Box>
        ) : null}

        {backups.length > 0 ? (
          <SettingsRows>
            {backups.map(backup => (
              <SettingsRow
                key={backup.id}
                label={backup.fileName}
                description={`Created ${formatDate(backup.createdAt)} · ${formatBytes(backup.size)}`}
                control={
                  <HStack gap="3" flexWrap="wrap" justify={{ base: 'flex-start', lg: 'flex-end' }}>
                    <chakra.a
                      href={getBackupDownloadUrl({ backupId: backup.id })}
                      color="teal.solid"
                      fontWeight="semibold"
                      fontSize="sm"
                    >
                      Download
                    </chakra.a>
                    <RestoreArchiveButton
                      type="button"
                      variant="outline"
                      disabled={restoreBackupMutation.isPending}
                      onClick={() => restoreBackupMutation.mutate({ backupId: backup.id })}
                    >
                      {restoreBackupMutation.isPending ? 'Queueing...' : 'Restore'}
                    </RestoreArchiveButton>
                  </HStack>
                }
              />
            ))}
          </SettingsRows>
        ) : null}
      </SettingsSection>
    </AdminAccessBoundary>
  );
}

export function AdminUsersPage() {
  const queryClient = useQueryClient();
  const meQuery = useMeQuery();
  const isEnabled = meQuery.data?.isRoot === true;
  const usersQuery = useAdminUsersQuery({ enabled: isEnabled });
  const vaultsQuery = useAdminVaultsQuery({ enabled: isEnabled });
  const users = useMemo(() => usersQuery.data?.users ?? [], [usersQuery.data?.users]);
  const vaults = useMemo(() => vaultsQuery.data?.vaults ?? [], [vaultsQuery.data?.vaults]);
  const [userSearch, setUserSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<AdminUserStatusFilter>('all');
  const [accessFilter, setAccessFilter] = useState<AdminUserAccessFilter>('all');
  const [rootInviteEmail, setRootInviteEmail] = useState('');
  const [inviteSystemRole, setInviteSystemRole] = useState<InviteSystemRole>('member');
  const [inviteCanCreateVaults, setInviteCanCreateVaults] = useState(false);
  const [inviteVaultMemberships, setInviteVaultMemberships] = useState<InviteVaultMembershipDraft[]>(() => [
    createInviteVaultMembershipDraft(),
  ]);
  const [createdInvitationToken, setCreatedInvitationToken] = useState<string | null>(null);
  const [isInviteDialogOpen, setIsInviteDialogOpen] = useState(false);
  const [userContextMenu, setUserContextMenu] = useState<AdminUserContextMenuState>(null);
  const visibleUsers = useMemo(() => {
    const normalizedSearch = userSearch.trim().toLowerCase();

    return users.filter((user) => {
      const matchesSearch =
        normalizedSearch.length === 0 ||
        user.email.toLowerCase().includes(normalizedSearch) ||
        (user.name ?? '').toLowerCase().includes(normalizedSearch);
      const matchesStatus =
        statusFilter === 'all' ||
        (statusFilter === 'active' && user.disabledAt === null) ||
        (statusFilter === 'disabled' && user.disabledAt !== null);
      const matchesAccess = accessFilter === 'all' || getUserAccessFilter(user) === accessFilter;

      return matchesSearch && matchesStatus && matchesAccess;
    });
  }, [accessFilter, statusFilter, userSearch, users]);
  const userStats = useMemo(() => ({
    total: users.length,
    root: users.filter((user) => user.isRoot).length,
    members: users.filter((user) => !user.isRoot).length,
    active: users.filter((user) => user.disabledAt === null).length,
    invited: 0,
  }), [users]);

  function updateInviteVaultMembership(
    membershipId: string,
    patch: Partial<Omit<InviteVaultMembershipDraft, 'id'>>,
  ) {
    setInviteVaultMemberships((memberships) =>
      memberships.map((membership) =>
        membership.id === membershipId ? { ...membership, ...patch } : membership,
      ),
    );
  }

  function removeInviteVaultMembership(membershipId: string) {
    setInviteVaultMemberships((memberships) => {
      if (memberships.length === 1) {
        return [createInviteVaultMembershipDraft()];
      }

      return memberships.filter((membership) => membership.id !== membershipId);
    });
  }

  const updateUserMutation = useMutation({
    mutationFn: updateAdminUser,
    onSuccess: async (_, variables) => {
      toast.success(variables.disabled ? 'User disabled.' : 'User re-enabled.');
      await queryClient.invalidateQueries({ queryKey: adminQueryKeys.users() });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Could not update user.');
    },
  });

  function getUserActions(user: AdminUser): AdminUserAction[] {
    return [
      {
        key: 'manage-access',
        label: 'Manage access',
        description: 'Edit roles, permissions and vault access',
        icon: UserRound,
        tone: 'success',
        onSelect: () => toast.info('User access management will be added in an upcoming admin update.'),
      },
      {
        key: 'resend-invitation',
        label: 'Resend invitation',
        description: 'Send the invitation email again',
        icon: Mail,
        onSelect: () => toast.info('Invitation resend is not available for active users yet.'),
      },
      {
        key: 'deactivate-user',
        label: 'Deactivate user',
        description: 'Disable sign-in for this user',
        icon: ShieldX,
        tone: 'destructive',
        disabled: updateUserMutation.isPending || user.disabledAt !== null,
        onSelect: () => updateUserMutation.mutate({ userId: user.id, disabled: true }),
      },
      {
        key: 'view-activity',
        label: 'View activity',
        description: 'See login and security activity',
        icon: Clock3,
        onSelect: () => toast.info('User activity is not available in this view yet.'),
      },
    ];
  }

  function openUserContextMenu(event: MouseEvent<HTMLElement>, user: AdminUser) {
    event.preventDefault();
    setUserContextMenu({
      user,
      x: Math.min(event.clientX, window.innerWidth - 328),
      y: Math.min(event.clientY, window.innerHeight - 260),
    });
  }

  const createRootInvitationMutation = useMutation({
    mutationFn: createRootEmailInvitation,
    onSuccess: ({ invitation }) => {
      toast.success(`Invitation created for ${invitation.email}.`);
      setCreatedInvitationToken(invitation.id);
      setRootInviteEmail('');
      setInviteVaultMemberships([createInviteVaultMembershipDraft()]);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Could not create root invitation.');
    },
  });

  if (meQuery.isLoading) {
    return <Text textStyle="sm">Loading admin context...</Text>;
  }

  if (!isEnabled) {
    return (
      <SettingsPageFrame title="Users management" description="Root access is required to open this page.">
        <Alert variant="destructive">
          <AlertDescription>
            Root access is required to open this page.
          </AlertDescription>
        </Alert>
      </SettingsPageFrame>
    );
  }

  return (
    <Stack as="section" gap="6" h="full" minH="0" overflowY="auto" bg="bg.workspace" px={{ base: '4', lg: '8' }} py={{ base: '5', lg: '7' }}>
      <Flex align={{ base: 'stretch', xl: 'start' }} direction={{ base: 'column', xl: 'row' }} justify="space-between" gap="4">
        <Stack gap="1">
          <Text as="h1" textStyle="3xl" fontWeight="bold" color="fg">
            Users
          </Text>
          <Text textStyle="md" color="fg.muted">
            Manage users, roles, and vault access across your instance.
          </Text>
        </Stack>

        <Flex align={{ base: 'stretch', md: 'center' }} direction={{ base: 'column', md: 'row' }} gap="3" minW="0">
          <Box position="relative" w={{ base: 'full', md: '18rem' }}>
            <Box position="absolute" left="3" top="50%" transform="translateY(-50%)" color="fg.muted" pointerEvents="none">
              <Search size={18} />
            </Box>
            <Input
              value={userSearch}
              placeholder="Search users..."
              aria-label="Search users"
              h="12"
              pl="10"
              rounded="md"
              bg="bg.surface"
              borderColor="border.strong"
              onChange={(event) => setUserSearch(event.target.value)}
            />
          </Box>

          <Box w={{ base: 'full', md: '10.5rem' }}>
            <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as AdminUserStatusFilter)}>
              <SelectTrigger aria-label="Filter users by status" h="12" bg="bg.surface" borderColor="border.strong">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {userStatusFilterOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Box>

          <Box w={{ base: 'full', md: '10rem' }}>
            <Select value={accessFilter} onValueChange={(value) => setAccessFilter(value as AdminUserAccessFilter)}>
              <SelectTrigger aria-label="Filter users by role" h="12" bg="bg.surface" borderColor="border.strong">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {userAccessFilterOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Box>

          <Button h="12" px="4" colorPalette="teal" onClick={() => setIsInviteDialogOpen(true)}>
            <Plus size={18} />
            Invite user
          </Button>
        </Flex>
      </Flex>

      <SimpleGrid columns={{ base: 1, sm: 2, xl: 5 }} gap="4">
        {[
          { label: 'Total users', value: userStats.total, icon: UsersRound, color: 'fg.success' },
          { label: 'Root users', value: userStats.root, icon: ShieldCheck, color: 'fg.success' },
          { label: 'Members', value: userStats.members, icon: UserRoundPlus, color: 'fg.success' },
          { label: 'Active', value: userStats.active, icon: CheckCircle2, color: 'fg.success' },
          { label: 'Invited', value: userStats.invited, icon: Clock3, color: 'fg.warning' },
        ].map((stat) => {
          const Icon = stat.icon;

          return (
            <Box key={stat.label} rounded="md" borderWidth="1px" borderColor="border.subtle" bg="bg.surface" px="5" py="4" shadow="xs">
              <HStack gap="3" color="fg.muted">
                <Box color={stat.color}>
                  <Icon size={22} />
                </Box>
                <Text textStyle="sm" fontWeight="medium" color="fg.muted">
                  {stat.label}
                </Text>
              </HStack>
              <Text mt="3" fontSize="2xl" fontWeight="bold" lineHeight="1" color="fg">
                {stat.value}
              </Text>
            </Box>
          );
        })}
      </SimpleGrid>

      <Box flex="1" minH="0">
        <Grid
          display={{ base: 'none', lg: visibleUsers.length > 0 ? 'grid' : 'none' }}
          gridTemplateColumns={ADMIN_USERS_GRID_COLUMNS}
          gap="3"
          borderBottomWidth="1px"
          borderColor="border.subtle"
          px="1"
          pb="3"
          textStyle="sm"
          fontWeight="medium"
          color="fg.muted"
        >
          <Text as="span">User</Text>
          <Text as="span">Role</Text>
          <Text as="span">Status</Text>
          <Text as="span">2FA</Text>
          <Text as="span">Access</Text>
          <Text as="span">Joined</Text>
          <Text as="span" textAlign="center">Actions</Text>
        </Grid>

        {usersQuery.isLoading ? <Text textStyle="sm" color="fg.muted">Loading users...</Text> : null}
        {!usersQuery.isLoading && visibleUsers.length === 0 ? (
          <Box mt="4" rounded="md" borderWidth="1px" borderStyle="dashed" borderColor="border.subtle" bg="bg.subtle" p="4" textStyle="sm" color="fg.muted">
            No users match the current filters.
          </Box>
        ) : null}

        {visibleUsers.length > 0 ? (
          <Stack gap="0">
            {visibleUsers.map((user) => {
              const joined = formatJoinedDate(user.createdAt);

              return (
                <Grid
                  key={user.id}
                  as="article"
                  alignItems="center"
                  gap="3"
                  borderBottomWidth="1px"
                  borderColor="border.subtle"
                  px="1"
                  py={{ base: '4', lg: '6' }}
                  templateColumns={{ base: 'minmax(0, 1fr) auto', lg: ADMIN_USERS_GRID_COLUMNS }}
                  onContextMenu={(event) => openUserContextMenu(event, user)}
                >
                  <HStack gap="4" minW="0">
                    <Flex boxSize="10" shrink="0" align="center" justify="center" rounded="full" bg="bg.muted" color="fg" fontWeight="semibold">
                      {getUserInitial(user)}
                    </Flex>
                    <Stack gap="1" minW="0">
                      <Text fontSize="md" fontWeight="semibold" color="fg" truncate>
                        {user.name ?? user.email}
                      </Text>
                      <Text truncate fontSize="sm" color="fg.muted">
                        {user.email}
                      </Text>
                    </Stack>
                  </HStack>

                  <Badge
                    display={{ base: 'none', lg: 'inline-flex' }}
                    w="fit-content"
                    colorPalette={user.isRoot ? 'purple' : 'blue'}
                    variant="subtle"
                    rounded="sm"
                    px="2"
                    py="1"
                    textTransform="none"
                  >
                    {getUserRoleLabel(user)}
                  </Badge>

                  <Badge
                    display={{ base: 'none', lg: 'inline-flex' }}
                    w="fit-content"
                    colorPalette={user.disabledAt ? 'orange' : 'green'}
                    variant="subtle"
                    rounded="sm"
                    px="2"
                    py="1"
                    textTransform="none"
                  >
                    {user.disabledAt ? 'Disabled' : 'Active'}
                  </Badge>

                  <HStack display={{ base: 'none', lg: 'flex' }} gap="2" color={user.twoFactorEnabled ? 'fg.success' : 'fg.muted'}>
                    {user.twoFactorEnabled ? <ShieldCheck size={16} /> : null}
                    <Text textStyle="sm">
                      {user.twoFactorEnabled ? 'Enabled' : 'Not enabled'}
                    </Text>
                  </HStack>

                  <Text display={{ base: 'none', lg: 'block' }} truncate textStyle="sm" fontWeight="semibold" color="fg">
                    {getUserAccessSummary(user)}
                  </Text>

                  <Stack display={{ base: 'none', lg: 'flex' }} gap="1">
                    <Text textStyle="sm" color="fg.muted">
                      {joined.date}
                    </Text>
                    <Text textStyle="sm" color="fg.muted">
                      {joined.time}
                    </Text>
                  </Stack>

                  <Box justifySelf="end">
                    <DropdownMenu modal={false}>
                      <DropdownMenuTrigger asChild>
                        <ActionMenuTriggerButton label={`User actions for ${user.email}`} />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" minWidth="20rem">
                        <AdminUserActionMenuItems actions={getUserActions(user)} />
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </Box>
                </Grid>
              );
            })}
          </Stack>
        ) : null}
      </Box>

      {userContextMenu ? (
        <AdminUserContextMenu
          state={userContextMenu}
          actions={getUserActions(userContextMenu.user)}
          onClose={() => setUserContextMenu(null)}
        />
      ) : null}

      <Dialog open={isInviteDialogOpen} onOpenChange={setIsInviteDialogOpen}>
        <DialogContent maxW="7xl" w="calc(100vw - 2rem)" bg="bg.surface" p="0">
          <chakra.form
            onSubmit={(event: FormEvent<HTMLFormElement>) => {
              event.preventDefault();
              const email = rootInviteEmail.trim();
              if (!email) {
                toast.error('Email is required.');
                return;
              }
              createRootInvitationMutation.mutate({
                email,
                systemRole: inviteSystemRole,
                systemCapabilities: inviteCanCreateVaults ? ['system.create_vaults'] : [],
                vaultMemberships: inviteVaultMemberships
                  .filter((membership) => membership.vaultId.length > 0)
                  .map((membership) => ({
                    vaultId: membership.vaultId,
                    role: membership.role,
                    aiAccessLevel: membership.aiAccessLevel,
                  })),
              });
            }}
          >
            <Box borderBottomWidth="1px" borderColor="border.subtle" px={{ base: '5', lg: '8' }} py="6">
              <DialogHeader>
                <DialogTitle>Invite user</DialogTitle>
                <DialogDescription>
                  Send an invitation to a new user.
                </DialogDescription>
              </DialogHeader>
            </Box>

            <Grid templateColumns={{ base: '1fr', xl: 'minmax(0, 1fr) 27rem' }} minH={{ xl: '33rem' }}>
              <Stack gap="7" px={{ base: '5', lg: '8' }} py="7">
                <Stack gap="6">
                  <Text as="h2" textStyle="lg" fontWeight="semibold" color="fg">
                    User information
                  </Text>

                  <Field>
                    <FieldLabel htmlFor="admin-root-invite-email">Email address</FieldLabel>
                    <Box position="relative">
                      <Input
                        id="admin-root-invite-email"
                        type="email"
                        value={rootInviteEmail}
                        placeholder="user@example.com"
                        h="12"
                        pr="11"
                        borderColor="border.strong"
                        onChange={(event) => setRootInviteEmail(event.target.value)}
                      />
                      <Box position="absolute" right="4" top="50%" transform="translateY(-50%)" color="fg.muted" pointerEvents="none">
                        <Mail size={18} />
                      </Box>
                    </Box>
                  </Field>
                </Stack>

                <Grid gap="5" templateColumns={{ base: '1fr', md: 'minmax(0, 1fr) minmax(15rem, 1fr)' }} alignItems="center">
                  <Field>
                    <FieldLabel>System role</FieldLabel>
                    <Select value={inviteSystemRole} onValueChange={(value) => setInviteSystemRole(value as InviteSystemRole)}>
                      <SelectTrigger aria-label="System role" h="12" borderColor="border.strong">
                        <HStack gap="3">
                          <UserRound size={18} />
                          <SelectValue />
                        </HStack>
                      </SelectTrigger>
                      <SelectContent>
                        {inviteSystemRoleOptions.map((option) => (
                          <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>

                  <Checkbox
                    checked={inviteCanCreateVaults}
                    onCheckedChange={setInviteCanCreateVaults}
                    alignSelf={{ base: 'flex-start', md: 'end' }}
                    pb={{ md: '1' }}
                  >
                    <Stack gap="1">
                      <Text color="fg">Can create vaults</Text>
                      <Text textStyle="sm" color="fg.muted">
                        Allows the user to create new vaults.
                      </Text>
                    </Stack>
                  </Checkbox>
                </Grid>

                <Box rounded="md" borderWidth="1px" borderColor="border.subtle" bg="bg.surface" p={{ base: '4', lg: '5' }}>
                  <Stack gap="5">
                    <Stack gap="1">
                      <Text textStyle="md" fontWeight="semibold" color="fg">
                        Initial vault access <Text as="span" fontWeight="normal" color="fg.muted">(optional)</Text>
                      </Text>
                      <Text textStyle="sm" color="fg.muted">
                        Pre-assign vault access for this user. You can always change this later.
                      </Text>
                    </Stack>

                    <Stack gap="4">
                      <Grid
                        display={{ base: 'none', md: 'grid' }}
                        gap="4"
                        templateColumns="minmax(0, 1.1fr) minmax(0, 0.92fr) minmax(0, 0.92fr) 3rem"
                      >
                        <Text textStyle="sm" fontWeight="medium" color="fg">Vault</Text>
                        <Text textStyle="sm" fontWeight="medium" color="fg">Role</Text>
                        <Text textStyle="sm" fontWeight="medium" color="fg">AI access</Text>
                        <Text srOnly>Remove</Text>
                      </Grid>

                      {inviteVaultMemberships.map((membership) => (
                        <Grid
                          key={membership.id}
                          gap="4"
                          alignItems="end"
                          templateColumns={{ base: '1fr', md: 'minmax(0, 1.1fr) minmax(0, 0.92fr) minmax(0, 0.92fr) 3rem' }}
                        >
                          <Field>
                            <FieldLabel display={{ md: 'none' }}>Vault</FieldLabel>
                            <Select
                              value={membership.vaultId || '__none__'}
                              onValueChange={(value) => updateInviteVaultMembership(membership.id, { vaultId: value === '__none__' ? '' : value })}
                            >
                              <SelectTrigger aria-label="Initial vault membership" h="12" borderColor="border.strong">
                                <SelectValue placeholder="Choose a vault..." />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="__none__">Choose a vault...</SelectItem>
                                {vaults.map((vault) => (
                                  <SelectItem key={vault.id} value={vault.id}>{vault.name}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </Field>

                          <Field>
                            <FieldLabel display={{ md: 'none' }}>Role</FieldLabel>
                            <Select
                              value={membership.role}
                              onValueChange={(value) => updateInviteVaultMembership(membership.id, { role: value as VaultRole })}
                              disabled={!membership.vaultId}
                            >
                              <SelectTrigger aria-label="Initial vault role" h="12" borderColor="border.strong">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {inviteVaultRoleOptions.map((option) => (
                                  <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </Field>

                          <Field>
                            <FieldLabel display={{ md: 'none' }}>AI access</FieldLabel>
                            <Select
                              value={membership.aiAccessLevel}
                              onValueChange={(value) => updateInviteVaultMembership(membership.id, { aiAccessLevel: value as AiAccessLevel })}
                              disabled={!membership.vaultId}
                            >
                              <SelectTrigger aria-label="Initial AI access" h="12" borderColor="border.strong">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {inviteAiAccessOptions.map((option) => (
                                  <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </Field>

                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            aria-label="Remove vault access row"
                            onClick={() => removeInviteVaultMembership(membership.id)}
                          >
                            <Trash2 size={18} />
                          </Button>
                        </Grid>
                      ))}
                    </Stack>

                    <Button
                      type="button"
                      variant="outline"
                      alignSelf="flex-start"
                      onClick={() => setInviteVaultMemberships((memberships) => [...memberships, createInviteVaultMembershipDraft()])}
                    >
                      <Plus size={18} />
                      Add another vault
                    </Button>
                  </Stack>
                </Box>

                <HStack gap="4" rounded="md" borderWidth="1px" borderColor="blue.200" bg="bg.info" px="5" py="4" color="fg.info">
                  <Info size={22} />
                  <Text textStyle="sm" color="fg">
                    The invited user will receive an email with instructions to set up their account.
                  </Text>
                </HStack>
              </Stack>

              <Stack gap="5" borderLeftWidth={{ xl: '1px' }} borderTopWidth={{ base: '1px', xl: '0' }} borderColor="border.subtle" bg="bg.subtle" px={{ base: '5', lg: '8' }} py="7">
                <Box rounded="md" borderWidth="1px" borderColor="teal.muted" bg="teal.subtle" p="6">
                  <Stack gap="6">
                    <HStack gap="4">
                      <Flex boxSize="12" align="center" justify="center" rounded="full" bg="bg.success" color="fg.success">
                        <Mail size={24} />
                      </Flex>
                      <Text textStyle="md" fontWeight="semibold" color="fg">
                        What happens next?
                      </Text>
                    </HStack>

                    {[
                      ['1', 'Invitation sent', 'User receives an email invitation.'],
                      ['2', 'Account setup', 'User sets up their account and sign in.'],
                      ['3', 'Access granted', 'User can access assigned vaults and features.'],
                    ].map(([step, title, description], index) => (
                      <Grid key={step} templateColumns="2rem minmax(0, 1fr)" gap="4">
                        <Stack align="center" gap="2">
                          <Flex boxSize="8" align="center" justify="center" rounded="full" bg="teal.solid" color="fg.inverted" textStyle="sm" fontWeight="semibold">
                            {step}
                          </Flex>
                          {index < 2 ? <Box w="1px" h="7" borderLeftWidth="1px" borderStyle="dashed" borderColor="teal.muted" /> : null}
                        </Stack>
                        <Stack gap="1" pb={index < 2 ? '1' : '0'}>
                          <Text textStyle="sm" fontWeight="semibold" color="fg">
                            {title}
                          </Text>
                          <Text textStyle="sm" color="fg.muted">
                            {description}
                          </Text>
                        </Stack>
                      </Grid>
                    ))}
                  </Stack>
                </Box>

                <Box rounded="md" borderWidth="1px" borderColor="border.subtle" bg="bg.surface" p="6">
                  <Stack gap="5">
                    <HStack gap="3">
                      <Lightbulb size={22} />
                      <Text textStyle="md" fontWeight="semibold" color="fg">
                        Tips
                      </Text>
                    </HStack>
                    {[
                      "You can manage this user's permissions after they accept the invitation.",
                      'System role and capabilities can be updated at any time.',
                      'Vault access and AI permissions can be modified later from the user access page.',
                    ].map((tip) => (
                      <HStack key={tip} gap="3" align="start">
                        <Box color="fg.success" pt="0.5">
                          <Check size={18} />
                        </Box>
                        <Text textStyle="sm" color="fg.muted">
                          {tip}
                        </Text>
                      </HStack>
                    ))}
                  </Stack>
                </Box>
              </Stack>
            </Grid>

            {createdInvitationToken ? (
              <Box px={{ base: '5', lg: '8' }} pb="4">
                <Text fontSize="sm" color="fg.muted">
                  Invitation token: <Text as="span" fontFamily="mono" color="fg">{createdInvitationToken}</Text>
                </Text>
              </Box>
            ) : null}

            <Box borderTopWidth="1px" borderColor="border.subtle" px={{ base: '5', lg: '8' }} py="5">
              <DialogFooter>
                <Button type="button" variant="outline" h="12" px="6" onClick={() => setIsInviteDialogOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" h="12" px="6" colorPalette="teal" disabled={createRootInvitationMutation.isPending}>
                  <Send size={18} />
                  {createRootInvitationMutation.isPending ? 'Sending...' : 'Send invitation'}
                </Button>
              </DialogFooter>
            </Box>
          </chakra.form>
        </DialogContent>
      </Dialog>
    </Stack>
  );
}

export function AdminVaultsPage() {
  const meQuery = useMeQuery();
  const isEnabled = meQuery.data?.isRoot === true;
  const vaultsQuery = useAdminVaultsQuery({ enabled: isEnabled });
  const vaults = vaultsQuery.data?.vaults ?? [];

  return (
    <AdminAccessBoundary
      title="Vault oversight"
      description="Inspect active vault ownership across the installation."
      isEnabled={isEnabled}
      isLoading={meQuery.isLoading}
    >
      <SettingsSection title="Ownership ledger" description="Vault-specific access remains inside each vault's settings page.">
        {vaultsQuery.isLoading ? <Text textStyle="sm" color="fg.muted">Loading vaults...</Text> : null}
        {!vaultsQuery.isLoading && vaults.length === 0 ? (
          <Box rounded="md" borderWidth="1px" borderStyle="dashed" borderColor="border.subtle" bg="bg.subtle" p="4" textStyle="sm" color="fg.muted">
            No active vaults found.
          </Box>
        ) : null}

        {vaults.length > 0 ? (
          <SettingsRows>
            {vaults.map(vault => (
              <SettingsRow
                key={vault.id}
                label={vault.name}
                description={`Owner: ${vault.ownerName ?? 'Unknown'}${vault.ownerEmail ? ` (${vault.ownerEmail})` : ''}`}
                meta={
                  <Stack gap="1" textAlign={{ base: 'left', lg: 'right' }}>
                    <Text textStyle="sm" color="fg.muted">{vault.id}</Text>
                    <Text textStyle="sm" color="fg.muted">Created {formatDate(vault.createdAt)}</Text>
                  </Stack>
                }
              />
            ))}
          </SettingsRows>
        ) : null}
      </SettingsSection>
    </AdminAccessBoundary>
  );
}

export function AdminAiSettingsPage() {
  const queryClient = useQueryClient();
  const meQuery = useMeQuery();
  const isEnabled = meQuery.data?.isRoot === true;
  const aiSettingsQuery = useAdminAiSettingsQuery({ enabled: isEnabled });
  const [aiDraftOverride, setAiDraftOverride] = useState<Partial<AdminAiSettings>>({});
  const savedAiSettings = aiSettingsQuery.data?.settings ?? emptyAiSettings;
  const aiDraft: AdminAiSettings = {
    ollamaHost: aiDraftOverride.ollamaHost ?? savedAiSettings.ollamaHost,
    model: aiDraftOverride.model ?? savedAiSettings.model,
  };
  const canSaveAiSettings = aiDraft.ollamaHost.trim().length > 0 && aiDraft.model.trim().length > 0;

  const aiSettingsMutation = useMutation({
    mutationFn: () => updateAdminAiSettings({
      ollamaHost: aiDraft.ollamaHost.trim(),
      model: aiDraft.model.trim(),
    }),
    onSuccess: async ({ settings }) => {
      toast.success('AI settings saved.');
      setAiDraftOverride(settings);
      await queryClient.invalidateQueries({ queryKey: adminQueryKeys.aiSettings() });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Could not save AI settings.');
    },
  });

  return (
    <AdminAccessBoundary
      title="AI settings"
      description="Configure the Ollama host and default model used by instance-level AI services."
      isEnabled={isEnabled}
      isLoading={meQuery.isLoading}
    >
      <SettingsSection
        title="Ollama defaults"
        description="These settings apply globally to the instance, not to a single user or vault."
        actions={
          <SaveButton
            type="submit"
            form="admin-ai-settings-form"
            size="sm"
            disabled={!canSaveAiSettings || aiSettingsMutation.isPending}
          >
            {aiSettingsMutation.isPending ? 'Saving...' : 'Save changes'}
          </SaveButton>
        }
      >
        {aiSettingsQuery.isLoading ? <Text textStyle="sm" color="fg.muted">Loading AI settings...</Text> : null}
        <chakra.form
          id="admin-ai-settings-form"
          onSubmit={(event: FormEvent<HTMLFormElement>) => {
            event.preventDefault();
            aiSettingsMutation.mutate();
          }}
        >
          <Grid gap="4" templateColumns={{ base: '1fr', lg: 'repeat(2, minmax(0, 1fr))' }}>
            <Field>
              <FieldLabel htmlFor="admin-ollama-host">Ollama host</FieldLabel>
              <Input
                id="admin-ollama-host"
                mt="2"
                type="url"
                value={aiDraft.ollamaHost}
                placeholder="http://127.0.0.1:11434"
                onChange={(event) => setAiDraftOverride((draft) => ({ ...draft, ollamaHost: event.target.value }))}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="admin-ollama-model">Default model</FieldLabel>
              <Input
                id="admin-ollama-model"
                mt="2"
                value={aiDraft.model}
                placeholder="gemma4:e4b"
                onChange={(event) => setAiDraftOverride((draft) => ({ ...draft, model: event.target.value }))}
              />
            </Field>
          </Grid>
        </chakra.form>
      </SettingsSection>
    </AdminAccessBoundary>
  );
}

export const AdminPage = AdminOverviewPage;

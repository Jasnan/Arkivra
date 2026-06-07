import type { FormEvent, MouseEvent } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Box, Flex, Grid, HStack, Portal, SimpleGrid, Stack, Text, chakra } from '@chakra-ui/react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Check, CheckCircle2, Clock3, Mail, Plus, Search, Send, ShieldCheck, ShieldX, UserRound, UserRoundPlus, UsersRound } from 'lucide-react';
import { useNavigate } from '@tanstack/react-router';
import { ROUTES } from '@/app/routes';
import { ActionMenuItemIcon, ActionMenuTriggerButton } from '@/components/ui/action-menu';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Field, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from '@/components/ui/toaster-store';
import { createAdminEmailInvitation, updateAdminUser } from '@/features/admin/admin.api';
import { adminQueryKeys, useAdminUsersQuery } from '@/features/admin/admin.queries';
import type { AdminUser, EmailInvitation } from '@/features/admin/admin.types';
import { formatShortDate as formatLocalizedShortDate, formatTime } from '@/lib/localization';
import { useMeQuery } from '@/features/me/me.queries';
import { KeyValueRows, SettingsPageFrame } from '@/features/settings/components/settings-ui';
import { getUserRoleLabel } from './admin-formatters';

type AdminUserStatusFilter = 'all' | 'active' | 'disabled';
type AdminUserAccessFilter = 'all' | 'admin' | 'create-vaults' | 'member';
type InviteSystemRole = 'admin' | 'member';

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

const ADMIN_USERS_GRID_COLUMNS = 'minmax(13rem, 1.45fr) 7.5rem 7rem 7.5rem minmax(7.5rem, 0.8fr) minmax(8rem, 0.85fr) 2.75rem';

const userStatusFilterOptions = [
  { value: 'all', label: 'All statuses' },
  { value: 'active', label: 'Active' },
  { value: 'disabled', label: 'Disabled' },
];

const userAccessFilterOptions = [
  { value: 'all', label: 'All roles' },
  { value: 'admin', label: 'Admin' },
  { value: 'create-vaults', label: 'Can create vaults' },
  { value: 'member', label: 'Member' },
];

const inviteSystemRoleOptions: Array<{ value: InviteSystemRole; label: string }> = [
  { value: 'member', label: 'Member' },
  { value: 'admin', label: 'Admin' },
];

function getUserAccessSummary(user: AdminUser) {
  if (user.isAdmin) return 'All vaults';
  if (user.canCreateVault) return 'Can create vaults';
  return 'Member access';
}

function getUserInitial(user: AdminUser) {
  const source = user.name?.trim() || user.email.trim();
  return source.charAt(0).toUpperCase() || '?';
}

function formatJoinedDate(value: string) {
  return {
    date: formatLocalizedShortDate(value),
    time: formatTime(value),
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
      gap="2.5"
      px="3"
      py="2.5"
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
        borderColor="border.surface"
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
            gap="2.5"
            rounded="md"
            px="3"
            py="2.5"
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
  if (user.isAdmin) return 'admin';
  if (user.systemCapabilities.includes('system.create_vaults')) return 'create-vaults';
  return 'member';
}

export function AdminUsersPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const meQuery = useMeQuery();
  const isEnabled = meQuery.data?.isAdmin === true;
  const usersQuery = useAdminUsersQuery({ enabled: isEnabled });
  const users = useMemo(() => usersQuery.data?.users ?? [], [usersQuery.data?.users]);
  const [userSearch, setUserSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<AdminUserStatusFilter>('all');
  const [accessFilter, setAccessFilter] = useState<AdminUserAccessFilter>('all');
  const [adminInviteEmail, setAdminInviteEmail] = useState('');
  const [inviteSystemRole, setInviteSystemRole] = useState<InviteSystemRole>('member');
  const [inviteCanCreateVaults, setInviteCanCreateVaults] = useState(false);
  const [createdInvitation, setCreatedInvitation] = useState<EmailInvitation | null>(null);
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
    admins: users.filter((user) => user.isAdmin).length,
    members: users.filter((user) => !user.isAdmin).length,
    active: users.filter((user) => user.disabledAt === null).length,
    invited: 0,
  }), [users]);

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
        label: 'Access',
        description: 'Edit roles, permissions and vault access',
        icon: UserRound,
        tone: 'success',
        onSelect: () => void navigate({ to: ROUTES.adminUserAccess(user.id) }),
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

  const createAdminInvitationMutation = useMutation({
    mutationFn: createAdminEmailInvitation,
    onSuccess: ({ invitation }) => {
      toast.success(`Invitation created for ${invitation.email}.`);
      setCreatedInvitation(invitation);
      setAdminInviteEmail('');
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Could not create admin invitation.');
    },
  });
  const isInviteFormDirty = createdInvitation === null
    && (adminInviteEmail.trim().length > 0 || inviteSystemRole !== 'member' || inviteCanCreateVaults);
  const canDismissInviteDialog = !isInviteFormDirty && !createAdminInvitationMutation.isPending;

  function openInviteDialog() {
    setCreatedInvitation(null);
    setIsInviteDialogOpen(true);
  }

  if (meQuery.isLoading) {
    return <Text textStyle="sm">Loading admin context...</Text>;
  }

  if (!isEnabled) {
    return (
      <SettingsPageFrame title="Users management" description="Admin access is required to open this page.">
        <Alert variant="destructive">
          <AlertDescription>
            Admin access is required to open this page.
          </AlertDescription>
        </Alert>
      </SettingsPageFrame>
    );
  }

  return (
    <Stack as="section" gap="4" h="full" minH="0" overflowY="auto" bg="bg.workspace" px={{ base: '4', lg: '6' }} py={{ base: '4', lg: '5' }}>
      <Flex align={{ base: 'stretch', xl: 'start' }} direction={{ base: 'column', xl: 'row' }} justify="space-between" gap="3">
        <Stack gap="1">
          <Text as="h1" textStyle="2xl" fontWeight="bold" color="fg">
            Users
          </Text>
          <Text textStyle="sm" color="fg.muted">
            Manage users, roles, and vault access.
          </Text>
        </Stack>

        <Flex align={{ base: 'stretch', md: 'center' }} direction={{ base: 'column', md: 'row' }} gap="2.5" minW="0">
          <Box position="relative" w={{ base: 'full', md: '16rem' }}>
            <Box position="absolute" left="3" top="50%" transform="translateY(-50%)" color="fg.muted" pointerEvents="none">
              <Search size={16} />
            </Box>
            <Input
              value={userSearch}
              placeholder="Search users..."
              aria-label="Search users"
              size="sm"
              pl="10"
              rounded="md"
              bg="bg.surface"
              borderColor="border.strong"
              onChange={(event) => setUserSearch(event.target.value)}
            />
          </Box>

          <Box w={{ base: 'full', md: '10.5rem' }}>
            <Select size="sm" value={statusFilter} onValueChange={(value) => setStatusFilter(value as AdminUserStatusFilter)}>
              <SelectTrigger aria-label="Filter users by status" rounded="md" bg="bg.surface" borderColor="border.strong">
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
            <Select size="sm" value={accessFilter} onValueChange={(value) => setAccessFilter(value as AdminUserAccessFilter)}>
              <SelectTrigger aria-label="Filter users by role" rounded="md" bg="bg.surface" borderColor="border.strong">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {userAccessFilterOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Box>

          <Button size="sm" colorPalette="teal" onClick={openInviteDialog}>
            <Plus size={14} />
            Invite
          </Button>
        </Flex>
      </Flex>

      <SimpleGrid columns={{ base: 1, sm: 2, xl: 5 }} gap="3">
        {[
          { label: 'Total users', value: userStats.total, icon: UsersRound, color: 'fg.success' },
          { label: 'Admins', value: userStats.admins, icon: ShieldCheck, color: 'fg.success' },
          { label: 'Members', value: userStats.members, icon: UserRoundPlus, color: 'fg.success' },
          { label: 'Active', value: userStats.active, icon: CheckCircle2, color: 'fg.success' },
          { label: 'Invited', value: userStats.invited, icon: Clock3, color: 'fg.warning' },
        ].map((stat) => {
          const Icon = stat.icon;

          return (
            <Box key={stat.label} rounded="md" borderWidth="1px" borderColor="border.surface" bg="bg.surface" px="4" py="3" shadow="xs">
              <HStack gap="2.5" color="fg.muted">
                <Box color={stat.color}>
                  <Icon size={18} />
                </Box>
                <Text textStyle="sm" fontWeight="medium" color="fg.muted">
                  {stat.label}
                </Text>
              </HStack>
              <Text mt="2" fontSize="xl" fontWeight="bold" lineHeight="1" color="fg">
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
          gap="2.5"
          borderBottomWidth="1px"
          borderColor="border.surface"
          px="1"
          pb="2"
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
          <Box mt="3" rounded="md" borderWidth="1px" borderStyle="dashed" borderColor="border.surface" bg="bg.subtle" p="3" textStyle="sm" color="fg.muted">
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
                  gap="2.5"
                  borderBottomWidth="1px"
                  borderColor="border.surface"
                  px="1"
                  py={{ base: '3', lg: '3.5' }}
                  templateColumns={{ base: 'minmax(0, 1fr) auto', lg: ADMIN_USERS_GRID_COLUMNS }}
                  _last={{ borderBottomWidth: '0' }}
                  onContextMenu={(event) => openUserContextMenu(event, user)}
                >
                  <HStack gap="3" minW="0">
                    <Flex boxSize="9" shrink="0" align="center" justify="center" rounded="full" bg="bg.muted" color="fg" fontWeight="semibold">
                      {getUserInitial(user)}
                    </Flex>
                    <Stack gap="0.5" minW="0">
                      <Text fontSize="sm" fontWeight="semibold" color="fg" truncate>
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
                    colorPalette={user.isAdmin ? 'purple' : 'blue'}
                    variant="subtle"
                    rounded="sm"
                    px="2"
                    py="0.5"
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
                    py="0.5"
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

                  <Stack display={{ base: 'none', lg: 'flex' }} gap="0.5">
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

      <Dialog
        open={isInviteDialogOpen}
        closeOnEscape={canDismissInviteDialog}
        closeOnInteractOutside={canDismissInviteDialog}
        onOpenChange={setIsInviteDialogOpen}
      >
        <DialogContent maxW="34rem" w="calc(100vw - 2rem)" bg="bg.surface" p="0">
          <chakra.form
            css={{
              '--arkivra-controlHeight': '2.25rem',
              '--arkivra-controlPaddingX': '0.625rem',
            }}
            onSubmit={(event: FormEvent<HTMLFormElement>) => {
              event.preventDefault();
              if (createdInvitation) return;

              const email = adminInviteEmail.trim();
              if (!email) {
                toast.warning('Email is required.');
                return;
              }
              createAdminInvitationMutation.mutate({
                email,
                systemRole: inviteSystemRole,
                systemCapabilities: inviteCanCreateVaults ? ['system.create_vaults'] : [],
                vaultMemberships: [],
              });
            }}
          >
            <Box borderBottomWidth="1px" borderColor="border.surface" px="4" py="2" pr={{ base: '13', lg: '14' }}>
              <DialogHeader>
                <HStack gap="2.5" align="center">
                  <Flex boxSize="9" align="center" justify="center" rounded="md" bg="teal.subtle" color="teal.fg" flexShrink="0">
                    <UserRoundPlus size={18} />
                  </Flex>
                  <Stack gap="0.5" minW="0">
                    <DialogTitle>{createdInvitation ? 'Invitation sent' : 'Invite user'}</DialogTitle>
                    <DialogDescription>
                      {createdInvitation ? `Invite created for ${createdInvitation.email}.` : 'Send an invitation to a new user.'}
                    </DialogDescription>
                  </Stack>
                </HStack>
              </DialogHeader>
            </Box>

            {createdInvitation ? (
              <Stack gap="3" px="4" py="3" bg="bg.subtle">
                <Card rounded="xl" borderColor="border.surface" bg="bg.elevated" p="3" shadow="xs">
                  <Stack gap="3">
                    <HStack gap="3" align="start">
                      <Flex boxSize="9" align="center" justify="center" rounded="full" bg="teal.subtle" color="teal.fg">
                        <Check size={19} />
                      </Flex>
                      <Stack gap="1" minW="0">
                        <Text fontWeight="semibold" color="fg">
                          Invitation is ready
                        </Text>
                        <Text textStyle="sm" color="fg.muted">
                          The user can accept the email invite and complete account setup.
                        </Text>
                      </Stack>
                    </HStack>

                    <Box rounded="lg" borderWidth="1px" borderColor="border.surface" bg="bg.subtle" px="3" py="2">
                      <KeyValueRows
                        density="compact"
                        rows={[
                          { label: 'Email', value: createdInvitation.email },
                          { label: 'System role', value: createdInvitation.systemRole === 'admin' ? 'Admin' : 'Member' },
                          { label: 'Status', value: 'Pending acceptance' },
                        ]}
                      />
                    </Box>
                  </Stack>
                </Card>

                <Box rounded="lg" borderWidth="1px" borderColor="border.surface" bg="bg.surface" px="3" py="2.5">
                  <Text textStyle="sm" color="fg.muted">
                    Advanced vault, AI, and audit controls live in user access management after the account exists.
                  </Text>
                </Box>
              </Stack>
            ) : (
              <Stack gap="3" px="4" py="3" bg="bg.subtle">
                <Card rounded="xl" borderColor="border.surface" bg="bg.elevated" p="3" shadow="xs">
                  <Stack gap="3">
                    <Field>
                      <FieldLabel htmlFor="admin-invite-email">Email address</FieldLabel>
                      <Box position="relative">
                        <Input
                          id="admin-invite-email"
                          type="email"
                          value={adminInviteEmail}
                          placeholder="user@example.com"
                          size="md"
                          pr="11"
                          borderColor="border.strong"
                          onChange={(event) => setAdminInviteEmail(event.target.value)}
                        />
                        <Box position="absolute" right="4" top="50%" transform="translateY(-50%)" color="fg.muted" pointerEvents="none">
                          <Mail size={18} />
                        </Box>
                      </Box>
                    </Field>

                    <Field>
                      <FieldLabel>System role</FieldLabel>
                      <Select size="md" value={inviteSystemRole} onValueChange={(value) => setInviteSystemRole(value as InviteSystemRole)}>
                        <SelectTrigger aria-label="System role" rounded="md" borderColor="border.strong">
                          <HStack gap="2.5">
                            <UserRound size={16} />
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
                      alignItems="flex-start"
                    >
                      <Stack gap="1">
                        <Text color="fg" fontWeight="medium">Can create vaults</Text>
                        <Text textStyle="sm" color="fg.muted">
                          Allow this user to create new vaults.
                        </Text>
                      </Stack>
                    </Checkbox>
                  </Stack>
                </Card>

                <Text textStyle="sm" color="fg.muted">
                  The user will receive an email invitation to create their account.
                </Text>
              </Stack>
            )}

            <Box borderTopWidth="1px" borderColor="border.surface" bg="bg.surface" px="4" py="3">
              <Flex align="center" justify="flex-end" gap="2.5" w="full">
                <Button type="button" variant="outline" size="sm" onClick={() => setIsInviteDialogOpen(false)}>
                  {createdInvitation ? 'Close' : 'Cancel'}
                </Button>
                {createdInvitation ? (
                  <Button
                    type="button"
                    size="sm"
                    colorPalette="teal"
                    onClick={() => {
                      setIsInviteDialogOpen(false);
                      void navigate({ to: ROUTES.adminUserAccess(createdInvitation.acceptedBy ?? createdInvitation.id) });
                    }}
                  >
                    Access
                  </Button>
                ) : (
                  <Button type="submit" size="sm" colorPalette="teal" disabled={createAdminInvitationMutation.isPending}>
                    <Send size={16} />
                    {createAdminInvitationMutation.isPending ? 'Sending...' : 'Send invite'}
                  </Button>
                )}
              </Flex>
            </Box>
          </chakra.form>
        </DialogContent>
      </Dialog>
    </Stack>
  );
}

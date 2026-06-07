import type { FormEvent, MouseEvent, ReactNode } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Box, Flex, Grid, HStack, Portal, SimpleGrid, Stack, Text, chakra } from '@chakra-ui/react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Check, CheckCircle2, CircleX, Clock3, Info, Mail, Package, Plus, Search, Send, ShieldCheck, ShieldX, UserRound, UserRoundPlus, UsersRound } from 'lucide-react';
import { useNavigate, useParams } from '@tanstack/react-router';
import { toast } from '@/components/ui/toaster-store';
import { ROUTES } from '@/app/routes';
import { useAccentColor } from '@/components/providers/accent-color-context';
import { ActionMenuItemIcon, ActionMenuTriggerButton } from '@/components/ui/action-menu';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import {
  CreateButton,
  RestoreArchiveButton,
  SaveButton,
} from '@/components/ui/action-buttons';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { RadioDropdownMenu } from '@/components/ui/radio-dropdown-menu';
import { SearchCombobox } from '@/components/ui/search-combobox';
import { Switch } from '@/components/ui/switch';
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
  createAdminEmailInvitation,
  getBackupDownloadUrl,
  rejectPermissionRequest,
  restoreBackup,
  updateAdminAiSettings,
  updateAdminUser,
} from '@/features/admin/admin.api';
import {
  adminQueryKeys,
  useAdminAiAvailabilityQuery,
  useAdminAiSettingsQuery,
  useAdminAiStatusQuery,
  useAdminOllamaModelsQuery,
  useAdminBackupsQuery,
  useAdminUsersQuery,
  useAdminVaultsQuery,
  usePermissionRequestsQuery,
} from '@/features/admin/admin.queries';
import type { AdminAiProviderSettings, AdminAiSettings, AdminEmbeddingIndexSummary, AdminUser, AdminVault, EmailInvitation, PermissionRequest } from '@/features/admin/admin.types';
import type { AuditLogFilters } from '@/features/audit/audit.types';
import { AuditDateFilterPicker } from '@/features/audit/components/audit-date-filter-picker';
import { useAdminAuditLogQuery } from '@/features/audit/audit.queries';
import {
  formatAuditMetadataEntries,
  formatAuditTimestamp,
} from '@/features/audit/audit-formatters';
import { formatBytes, formatDate } from '@/features/documents/documents.utils';
import { formatShortDate as formatLocalizedShortDate, formatTime } from '@/lib/localization';
import { meQueryKeys, useMeQuery } from '@/features/me/me.queries';
import type { MeResponse } from '@/features/me/me.types';
import {
  KeyValueRows,
  SettingsStatusBadge,
  SettingsPageFrame,
  SettingsRow,
  SettingsRows,
  SettingsSection,
} from '@/features/settings/components/settings-ui';
import type { SettingsStatusTone } from '@/features/settings/components/settings-ui';

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

function formatCount(value: number | undefined, singular: string, plural = `${singular}s`) {
  const safeValue = value ?? 0;
  return `${safeValue} ${safeValue === 1 ? singular : plural}`;
}

function getUserRoleLabel(user: AdminUser) {
  return user.isAdmin ? 'Admin' : 'Member';
}

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

function getPermissionRequestLabel(request: PermissionRequest) {
  if (request.type === 'vault.create') return 'Create vault';
  if (request.type === 'vault.delete') return 'Delete vault';
  if (request.type === 'vault.owner_promote') return 'Promote owner';
  if (request.type === 'vault.email_invitation') return 'Email invitation';
  return 'AI access escalation';
}

function formatPermissionRequestRole(value: unknown) {
  if (value === 'owner') return 'Owner';
  if (value === 'editor') return 'Editor';
  if (value === 'viewer') return 'Viewer';
  return 'Member';
}

function formatPermissionRequestAiAccess(value: unknown) {
  if (value === 'full') return 'Full AI access';
  if (value === 'document_chat') return 'Semantic access';
  return 'No AI access';
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

  if (request.type === 'vault.email_invitation') {
    const email = typeof request.payload.email === 'string' ? request.payload.email : 'unknown email';
    const role = formatPermissionRequestRole(request.payload.role);
    const aiAccess = formatPermissionRequestAiAccess(request.payload.aiAccessLevel);
    return `Requested by ${request.requestedBy} for ${email}: ${role}, ${aiAccess}.`;
  }

  const aiAccessLevel = typeof request.payload.aiAccessLevel === 'string' ? request.payload.aiAccessLevel : 'AI access';
  return `Requested by ${request.requestedBy} for ${request.targetUserId ?? 'unknown user'}: ${aiAccessLevel}.`;
}

const emptyAiSettings: AdminAiSettings = {
  aiFeaturesEnabled: false,
  chat: {
    provider: 'ollama',
    baseUrl: '',
    apiKeySecretRef: null,
    model: '',
  },
  embedding: {
    provider: 'ollama',
    baseUrl: '',
    apiKeySecretRef: null,
    model: 'bge-m3',
    dimensions: 1024,
  },
  ollamaHost: '',
  model: '',
};

function formatIndexStatus(status: AdminEmbeddingIndexSummary['status']) {
  if (status === 'active' || status === 'ready') return 'Ready';
  if (status === 'building') return 'Building';
  if (status === 'failed') return 'Error';
  if (status === 'retiring' || status === 'retired') return 'Retired';
  return 'Unknown';
}

function getIndexProgress(index: AdminEmbeddingIndexSummary) {
  if (index.expectedChunkCount <= 0) {
    return index.status === 'active' || index.status === 'ready' ? 100 : 0;
  }

  return Math.min(100, Math.round((index.embeddedChunkCount / index.expectedChunkCount) * 100));
}

function formatProvider(provider: string) {
  if (provider === 'ollama') return 'Ollama';
  if (provider === 'gemini') return 'Google Gemini';
  return provider;
}

function getConnectionStatusLabel({
  enabled,
  isLoading,
  reachable,
  modelAvailable,
}: {
  enabled: boolean;
  isLoading: boolean;
  reachable?: boolean;
  modelAvailable?: boolean;
}) {
  if (!enabled) return 'Not Configured';
  if (isLoading) return 'Checking';
  return reachable && modelAvailable ? 'Healthy' : 'Error';
}

type AiSettingsDraftOverride = Partial<Omit<AdminAiSettings, 'chat' | 'embedding'>> & {
  chat?: Partial<AdminAiProviderSettings>;
  embedding?: Partial<AdminAiSettings['embedding']>;
};

interface EmbeddingModelOption {
  key: string;
  provider: AdminAiSettings['embedding']['provider'];
  providerLabel: string;
  baseUrl: string;
  model: string;
  dimensions: number;
  isActive: boolean;
  isConfigured: boolean;
  isDiscovered: boolean;
  size: number | null;
  modifiedAt: string | null;
}

interface EmbeddingModelCatalogEntry {
  provider: AdminAiSettings['embedding']['provider'];
  model: string;
}

const chatProviderOptions: Array<{ value: AdminAiSettings['chat']['provider']; label: string }> = [
  { value: 'ollama', label: 'Ollama' },
];

const popularEmbeddingModelCatalog: EmbeddingModelCatalogEntry[] = [
  { provider: 'ollama', model: 'bge-m3' },
  { provider: 'ollama', model: 'embeddinggemma' },
  { provider: 'ollama', model: 'nomic-embed-text' },
  { provider: 'ollama', model: 'mxbai-embed-large' },
  { provider: 'ollama', model: 'all-minilm' },
  { provider: 'ollama', model: 'snowflake-arctic-embed' },
  { provider: 'ollama', model: 'granite-embedding' },
  { provider: 'ollama', model: 'qwen3-embedding:0.6b' },
  { provider: 'ollama', model: 'qwen3-embedding:4b' },
  { provider: 'ollama', model: 'qwen3-embedding:8b' },
];

const latestModelTagPattern = /:latest$/;

function normalizeModelCatalogName(model: string) {
  return model.trim().toLowerCase().replace(latestModelTagPattern, '');
}

function getModelNameBase(model: string) {
  return normalizeModelCatalogName(model).split(':')[0] ?? '';
}

function matchesCatalogModel(discoveredModel: string, catalogModel: string) {
  const normalizedCatalogModel = normalizeModelCatalogName(catalogModel);

  if (normalizedCatalogModel.includes(':')) {
    return normalizeModelCatalogName(discoveredModel) === normalizedCatalogModel;
  }

  return getModelNameBase(discoveredModel) === normalizedCatalogModel;
}

function isCatalogEmbeddingModel(provider: AdminAiSettings['embedding']['provider'], model: string) {
  return popularEmbeddingModelCatalog.some(entry =>
    entry.provider === provider && matchesCatalogModel(model, entry.model),
  );
}

function formatShortDateTime(value: string | null | undefined) {
  if (!value) return 'Unavailable';
  return formatDate(value);
}

function RequirementStatus({
  isMet,
  label,
  missingLabel,
  statusLabel,
}: {
  label: string;
  missingLabel: string;
  statusLabel: string;
  isMet: boolean;
}) {
  return (
    <HStack gap="2" align="flex-start" minW="0" px="3" py="2.5">
      <Flex
        boxSize="4"
        align="center"
        justify="center"
        rounded="full"
        bg="transparent"
        color={isMet ? 'fg.success' : 'fg.warning'}
        flexShrink={0}
        mt="0.5"
      >
        {isMet ? <CheckCircle2 size={14} /> : <CircleX size={14} />}
      </Flex>
      <Stack gap="0" minW="0">
        <Text textStyle="sm" fontWeight="medium" color={isMet ? 'fg' : 'fg.warning'}>{label}</Text>
        <Text textStyle="xs" color={isMet ? 'fg.muted' : 'fg.warning'}>{isMet ? statusLabel : missingLabel}</Text>
      </Stack>
    </HStack>
  );
}

function AiSettingsSection({
  actions,
  children,
  description,
  minH,
  titleMeta,
  tone = 'default',
  title,
}: {
  title: ReactNode;
  description?: ReactNode;
  minH?: string;
  titleMeta?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  tone?: 'default' | 'success' | 'warning';
}) {
  const toneStyles = tone === 'success'
    ? { borderColor: 'green.muted', bg: 'green.subtle' }
    : tone === 'warning'
      ? { borderColor: 'orange.muted', bg: 'orange.subtle' }
      : { borderColor: 'border.surface', bg: 'bg.surface' };

  return (
    <Card p="var(--arkivra-sectionPadding, 1rem)" shadow="xs" borderColor={toneStyles.borderColor} bg={toneStyles.bg} minH={minH}>
      <Stack gap="3">
        <Flex
          direction={{ base: 'column', md: 'row' }}
          align={{ base: 'stretch', md: 'flex-start' }}
          justify="space-between"
          gap="2"
        >
          <Stack gap="0.5" minW="0">
            <HStack gap="2" minW="0" align="center">
              <Text fontSize="md" fontWeight="semibold" color="fg" lineHeight="short">
                {title}
              </Text>
              {titleMeta}
            </HStack>
            {description ? (
              <Text textStyle="sm" color="fg.muted" maxW="2xl">
                {description}
              </Text>
            ) : null}
          </Stack>
          {actions ? <HStack flexShrink={0}>{actions}</HStack> : null}
        </Flex>
        {children}
      </Stack>
    </Card>
  );
}

function CapabilityStatus({
  label,
  status,
  tone,
}: {
  label: string;
  status: string;
  tone: 'ready' | 'warning' | 'disabled';
}) {
  const color = tone === 'ready' ? 'fg.success' : tone === 'warning' ? 'fg.warning' : 'fg.muted';

  return (
    <Flex align="center" justify="space-between" gap="3" py="1.5">
      <HStack gap="2">
        <Box color={color} aria-hidden="true">
          {tone === 'ready' ? <CheckCircle2 size={16} /> : tone === 'warning' ? <AlertTriangle size={16} /> : <Clock3 size={16} />}
        </Box>
        <Text textStyle="sm" fontWeight="medium" color="fg">{label}</Text>
      </HStack>
      <Text textStyle="sm" color="fg.muted">{status}</Text>
    </Flex>
  );
}

type ChunkProgressVisualStatus = AdminEmbeddingIndexSummary['status'] | 'paused' | 'idle';

function ChunkProgressBar({ progress, status, size = 'sm' }: { progress: number; status?: ChunkProgressVisualStatus; size?: 'sm' | 'lg' }) {
  const isBuilding = status === 'building';
  const isPaused = status === 'paused';
  const fillBg = status === 'failed'
    ? 'fg.error'
    : isPaused
      ? 'gray.400'
      : status === 'idle'
        ? 'fg.muted'
        : 'teal.solid';
  const stripedBg = status === 'failed'
    ? 'repeating-linear-gradient(45deg, var(--chakra-colors-red-solid), var(--chakra-colors-red-solid) 0.5rem, var(--chakra-colors-red-emphasized) 0.5rem, var(--chakra-colors-red-emphasized) 1rem)'
    : 'repeating-linear-gradient(45deg, var(--chakra-colors-teal-solid), var(--chakra-colors-teal-solid) 0.5rem, var(--chakra-colors-teal-emphasized) 0.5rem, var(--chakra-colors-teal-emphasized) 1rem)';

  return (
    <Box h={size === 'lg' ? '3' : '2'} rounded="full" bg="bg.subtle" overflow="hidden">
      <Box
        className="arkivra-index-progress-bar"
        h="full"
        bg={isBuilding || status === 'failed' ? stripedBg : fillBg}
        bgSize={isBuilding || status === 'failed' ? '2rem 2rem' : undefined}
        opacity={isPaused ? 0.72 : 1}
        animation={isBuilding
          ? 'arkivra-index-progress 1s linear infinite'
          : isPaused
            ? 'arkivra-index-paused 1.8s ease-in-out infinite'
            : undefined}
        transition="width 160ms ease"
        style={{ width: `${progress}%` }}
      />
    </Box>
  );
}

function CompactMetric({ label, value }: { label: string; value: ReactNode }) {
  return (
    <Stack gap="0.5" minW="0">
      <Text textStyle="xs" color="fg.muted">{label}</Text>
      <Box fontSize="sm" fontWeight="semibold" color="fg" minW="0">{value}</Box>
    </Stack>
  );
}

function SemanticIndexProgressSummary({
  indexedChunks,
  expectedChunks,
  progress,
  status,
}: {
  indexedChunks: number;
  expectedChunks: number;
  progress: number;
  status?: ChunkProgressVisualStatus;
}) {
  return (
    <Stack gap="2.5">
      <Grid templateColumns="minmax(0, 1fr) auto minmax(5rem, 0.45fr)" alignItems="start" gap="3">
        <Stack gap="0.5" minW="0">
          <Text fontSize="md" fontWeight="semibold" color="fg" lineHeight="short">
            {indexedChunks.toLocaleString()}
            {' '}
            <Box as="span" color="fg.muted" fontWeight="medium">
              /
              {' '}
              {expectedChunks.toLocaleString()}
            </Box>
          </Text>
          <Text textStyle="xs" color="fg.muted">Chunks indexed</Text>
        </Stack>
        <Box w="1px" h="9" bg="border.surface" />
        <Stack gap="0.5" minW="0">
          <Text fontSize="md" fontWeight="semibold" color="fg" lineHeight="short">{progress}%</Text>
          <Text textStyle="xs" color="fg.muted">Complete</Text>
        </Stack>
      </Grid>
      <ChunkProgressBar progress={progress} status={status} />
    </Stack>
  );
}

function AdminAccessBoundary({
  accessTitle,
  actions,
  children,
  description,
  isEnabled,
  isLoading,
  title,
}: {
  title?: ReactNode;
  accessTitle?: string;
  actions?: ReactNode;
  description?: ReactNode;
  isEnabled: boolean;
  isLoading: boolean;
  children: ReactNode;
}) {
  if (isLoading) {
    return <Text textStyle="sm">Loading admin context...</Text>;
  }

  if (!isEnabled) {
    return (
      <SettingsPageFrame title={title ?? accessTitle} description="Admin access is required to open this page." density="compact">
        <Alert variant="destructive">
          <AlertDescription>
            Admin access is required to open this page.
          </AlertDescription>
        </Alert>
      </SettingsPageFrame>
    );
  }

  return (
    <SettingsPageFrame title={title} description={description} actions={actions} density="compact">
      {children}
    </SettingsPageFrame>
  );
}

function getVaultOwnerLabel(vault: AdminVault) {
  return vault.ownerName?.trim() || vault.ownerEmail || 'Unassigned';
}

function VaultOwnershipTable({ vaults }: { vaults: AdminVault[] }) {
  return (
    <Box overflowX="auto">
      <chakra.table w="full" minW="42rem" borderCollapse="collapse">
        <chakra.thead>
          <chakra.tr borderBottomWidth="1px" borderColor="border.surface">
            {['Vault Name', 'Owner Account', 'Members', 'Created Date'].map((heading) => (
              <chakra.th
                key={heading}
                px="3"
                py="2"
                textAlign={heading === 'Members' ? 'right' : 'left'}
                fontSize="xs"
                fontWeight="semibold"
                color="fg.muted"
              >
                {heading}
              </chakra.th>
            ))}
          </chakra.tr>
        </chakra.thead>
        <chakra.tbody>
          {vaults.map((vault) => (
            <chakra.tr key={vault.id} borderBottomWidth="1px" borderColor="border.surface" _last={{ borderBottomWidth: '0' }}>
              <chakra.td px="3" py="2.5" fontSize="sm" fontWeight="medium" color="fg">
                {vault.name}
              </chakra.td>
              <chakra.td px="3" py="2.5">
                <Stack gap="0.5" minW="0">
                  <Text fontSize="sm" fontWeight="medium" color="fg">
                    {getVaultOwnerLabel(vault)}
                  </Text>
                  {vault.ownerName && vault.ownerEmail ? (
                    <Text fontSize="xs" color="fg.muted">
                      {vault.ownerEmail}
                    </Text>
                  ) : null}
                </Stack>
              </chakra.td>
              <chakra.td px="3" py="2.5" textAlign="right" fontSize="sm" color="fg">
                {formatCount(vault.memberCount, 'member')}
              </chakra.td>
              <chakra.td px="3" py="2.5" fontSize="sm" color="fg.muted">
                {formatDate(vault.createdAt)}
              </chakra.td>
            </chakra.tr>
          ))}
        </chakra.tbody>
      </chakra.table>
    </Box>
  );
}

export function AdminOverviewPage() {
  const queryClient = useQueryClient();
  const meQuery = useMeQuery();
  const isEnabled = meQuery.data?.isAdmin === true;
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
      <SettingsSection title="Instance overview" density="compact">
        <KeyValueRows
          density="compact"
          rows={[
            { label: 'Backups', value: backupsQuery.isLoading ? 'Loading...' : formatCount(backups.length, 'archive') },
            { label: 'Users', value: usersQuery.isLoading ? 'Loading...' : formatCount(users.length, 'account') },
            { label: 'Vaults', value: vaultsQuery.isLoading ? 'Loading...' : formatCount(vaults.length, 'vault') },
          ]}
        />
      </SettingsSection>

      <SettingsSection title="Vault ownership" density="compact">
        {vaultsQuery.isLoading ? <Text textStyle="sm" color="fg.muted">Loading vaults...</Text> : null}
        {!vaultsQuery.isLoading && vaults.length === 0 ? (
          <Box rounded="md" borderWidth="1px" borderStyle="dashed" borderColor="border.surface" bg="bg.subtle" p="3" textStyle="sm" color="fg.muted">
            No active vaults found.
          </Box>
        ) : null}
        {vaults.length > 0 ? <VaultOwnershipTable vaults={vaults} /> : null}
      </SettingsSection>

      <SettingsSection title="Approval queue" density="compact">
        {permissionRequestsQuery.isLoading ? <Text textStyle="sm" color="fg.muted">Loading requests...</Text> : null}
        {!permissionRequestsQuery.isLoading && permissionRequests.length === 0 ? (
          <Box rounded="md" borderWidth="1px" borderStyle="dashed" borderColor="border.surface" bg="bg.subtle" p="3" textStyle="sm" color="fg.muted">
            No pending requests.
          </Box>
        ) : null}
        {permissionRequests.length > 0 ? (
          <SettingsRows density="compact">
            {permissionRequests.map((request) => (
              <SettingsRow
                density="compact"
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
  const isEnabled = meQuery.data?.isAdmin === true;
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
      isEnabled={isEnabled}
      isLoading={meQuery.isLoading}
    >
      <SettingsSection
        title="Archive control"
        density="compact"
        actions={
          <CreateButton
            type="button"
            size="sm"
            disabled={createBackupMutation.isPending}
            onClick={() => createBackupMutation.mutate()}
          >
            {createBackupMutation.isPending ? 'Queueing...' : 'Create'}
          </CreateButton>
        }
      >
        {backupsQuery.isLoading ? <Text textStyle="sm" color="fg.muted">Loading backups...</Text> : null}
        {!backupsQuery.isLoading && backups.length === 0 ? (
          <Box rounded="md" borderWidth="1px" borderStyle="dashed" borderColor="border.surface" bg="bg.subtle" p="3" textStyle="sm" color="fg.muted">
            No backups available yet.
          </Box>
        ) : null}

        {backups.length > 0 ? (
          <SettingsRows density="compact">
            {backups.map(backup => (
              <SettingsRow
                density="compact"
                key={backup.id}
                label={backup.fileName}
                description={`Created ${formatDate(backup.createdAt)} · ${formatBytes(backup.size)}`}
                control={
                  <HStack gap="2.5" flexWrap="wrap" justify={{ base: 'flex-start', lg: 'flex-end' }}>
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

export function AdminUserAccessPage() {
  const params = useParams({ strict: false }) as { userId?: string };
  const userId = params.userId ?? '';
  const meQuery = useMeQuery();
  const isEnabled = meQuery.data?.isAdmin === true;
  const usersQuery = useAdminUsersQuery({ enabled: isEnabled });
  const vaultsQuery = useAdminVaultsQuery({ enabled: isEnabled });
  const users = usersQuery.data?.users ?? [];
  const vaults = vaultsQuery.data?.vaults ?? [];
  const user = users.find((candidate) => candidate.id === userId);

  if (meQuery.isLoading) {
    return <Text textStyle="sm">Loading admin context...</Text>;
  }

  if (!isEnabled) {
    return (
      <SettingsPageFrame title="User access" description="Admin access is required to open this page.">
        <Alert variant="destructive">
          <AlertDescription>
            Admin access is required to manage user access.
          </AlertDescription>
        </Alert>
      </SettingsPageFrame>
    );
  }

  if (usersQuery.isLoading || vaultsQuery.isLoading) {
    return <Text textStyle="sm" color="fg.muted">Loading access profile...</Text>;
  }

  if (!user) {
    return (
      <SettingsPageFrame
        title="Pending access profile"
        description="This invite has not resolved to an active user account yet."
      >
        <SettingsSection title="Access management" description="Detailed permissions become available after the user accepts the invitation.">
          <Box rounded="md" borderWidth="1px" borderColor="border.surface" bg="bg.subtle" p="4">
            <Stack gap="2">
              <Text textStyle="sm" fontWeight="medium" color="fg">
                Invite pending
              </Text>
              <Text textStyle="sm" color="fg.muted">
                Keep the invite flow quick. Vault matrices, AI feature permissions, audit visibility, and granular overrides live here once an account exists.
              </Text>
            </Stack>
          </Box>
        </SettingsSection>
      </SettingsPageFrame>
    );
  }

  return (
    <SettingsPageFrame
      title="User access"
      description="Manage long-term permissions, vault access, AI features, and audit visibility outside the invite flow."
    >
      <SettingsSection
        title={user.email}
        description="Use this workspace for access changes after the user has joined Arkivra."
        actions={<Badge variant="secondary">{getUserRoleLabel(user)}</Badge>}
      >
        <HStack gap="2" flexWrap="wrap">
          {['Overview', 'Access', 'Security', 'Activity'].map((tab) => (
            <Badge
              key={tab}
              variant={tab === 'Access' ? 'default' : 'secondary'}
              bg={tab === 'Access' ? 'teal.subtle' : 'bg.subtle'}
              color={tab === 'Access' ? 'teal.fg' : 'fg.muted'}
              rounded="full"
              px="3"
              py="1"
            >
              {tab}
            </Badge>
          ))}
        </HStack>

        <SimpleGrid columns={{ base: 1, lg: 2 }} gap="4">
          <Box rounded="lg" borderWidth="1px" borderColor="border.surface" bg="bg.subtle" p="4">
            <Stack gap="3">
              <Text textStyle="sm" fontWeight="semibold" color="fg">
                System permissions
              </Text>
              <KeyValueRows
                rows={[
                  { label: 'Role', value: getUserRoleLabel(user) },
                  { label: 'Create vaults', value: user.canCreateVault ? 'Allowed' : 'Not allowed' },
                  { label: 'Status', value: user.disabledAt ? 'Disabled' : 'Active' },
                ]}
              />
            </Stack>
          </Box>

          <Box rounded="lg" borderWidth="1px" borderColor="border.surface" bg="bg.subtle" p="4">
            <Stack gap="3">
              <Text textStyle="sm" fontWeight="semibold" color="fg">
                Access expansion
              </Text>
              <Text textStyle="sm" color="fg.muted">
                Vault permission matrices, AI feature permissions, granular overrides, and audit events belong in this dedicated management surface.
              </Text>
            </Stack>
          </Box>
        </SimpleGrid>

        <Box rounded="lg" borderWidth="1px" borderColor="border.surface" bg="bg.surface" p="4">
          <Stack gap="3">
            <HStack justify="space-between" gap="3" align="start">
              <Stack gap="1">
                <Text textStyle="sm" fontWeight="semibold" color="fg">
                  Vault permissions
                </Text>
                <Text textStyle="sm" color="fg.muted">
                  Dedicated matrix for current and future vault-level access controls.
                </Text>
              </Stack>
              <Badge variant="secondary">{formatCount(vaults.length, 'vault')}</Badge>
            </HStack>

            {vaults.length > 0 ? (
              <Stack gap="0" divideY="1px" divideColor="border.surface">
                {vaults.slice(0, 4).map((vault) => (
                  <Flex key={vault.id} align="center" justify="space-between" gap="4" py="3">
                    <Text textStyle="sm" fontWeight="medium" color="fg">
                      {vault.name}
                    </Text>
                    <Text textStyle="sm" color="fg.muted">
                      Configure role, AI features, and overrides
                    </Text>
                  </Flex>
                ))}
              </Stack>
            ) : (
              <Text textStyle="sm" color="fg.muted">
                No vaults are available yet.
              </Text>
            )}
          </Stack>
        </Box>
      </SettingsSection>
    </SettingsPageFrame>
  );
}

const auditCategoryOptions = [
  { value: 'all', label: 'All categories' },
  { value: 'auth', label: 'auth' },
  { value: 'vault', label: 'vault' },
  { value: 'document', label: 'document' },
  { value: 'permission', label: 'permission' },
  { value: 'audit', label: 'audit' },
  { value: 'system', label: 'system' },
] as const;
const auditSeverityOptions = [
  { value: 'all', label: 'All severities' },
  { value: 'info', label: 'info' },
  { value: 'notice', label: 'notice' },
  { value: 'warning', label: 'warning' },
  { value: 'critical', label: 'critical' },
] as const;
const auditOutcomeOptions = [
  { value: 'all', label: 'All outcomes' },
  { value: 'success', label: 'success' },
  { value: 'failure', label: 'failure' },
  { value: 'denied', label: 'denied' },
] as const;
const auditEventTypeOptions = [
  { value: 'document.uploaded', label: 'Document Uploaded' },
  { value: 'document.viewed', label: 'Document Viewed' },
  { value: 'document.downloaded', label: 'Document Downloaded' },
  { value: 'document.deleted', label: 'Document Deleted' },
  { value: 'document.delete_failed', label: 'Document Delete Failed' },
  { value: 'document.access_denied', label: 'Document Access Denied' },
  { value: 'vault.member_added', label: 'Vault Member Added' },
  { value: 'vault.member_removed', label: 'Vault Member Removed' },
  { value: 'vault.member_role_changed', label: 'Vault Member Role Changed' },
  { value: 'vault.access_denied', label: 'Vault Access Denied' },
  { value: 'ai.features_toggled', label: 'AI toggled' },
  { value: 'ai.chat_model_changed', label: 'AI chat model changed' },
  { value: 'ai.embedding_model_changed', label: 'AI embedding model changed' },
] as const;

export function AdminAuditLogPage() {
  const meQuery = useMeQuery();
  const isEnabled = meQuery.data?.isAdmin === true;
  const [filters, setFilters] = useState<AuditLogFilters>({});
  const auditQuery = useAdminAuditLogQuery({ filters, enabled: isEnabled });
  const events = auditQuery.data?.pages.flatMap(page => page.events) ?? [];
  const selectedEventTypes = Array.isArray(filters.eventType)
    ? filters.eventType
    : filters.eventType
      ? [filters.eventType]
      : [];

  function setFilter(key: keyof AuditLogFilters, value: string) {
    setFilters(current => ({
      ...current,
      [key]: value.length > 0 ? value : undefined,
    }));
  }

  function setDateFilter(key: 'dateFrom' | 'dateTo', value: string) {
    setFilters(current => {
      const next: AuditLogFilters = {
        ...current,
        [key]: value.length > 0 ? value : undefined,
      };

      if (key === 'dateFrom' && value && current.dateTo && value > current.dateTo) {
        next.dateTo = value;
      }

      if (key === 'dateTo' && value && current.dateFrom && value < current.dateFrom) {
        next.dateFrom = value;
      }

      return next;
    });
  }

  function setEventTypeFilter(values: string[]) {
    setFilters(current => ({
      ...current,
      eventType: values.length > 0 ? values : undefined,
    }));
  }

  return (
    <AdminAccessBoundary
      title="Audit log"
      description="Security, compliance, permission, and administrative events."
      isEnabled={isEnabled}
      isLoading={meQuery.isLoading}
    >
        <Grid gap="3" templateColumns={{ base: '1fr', md: 'repeat(3, minmax(0, 1fr))', xl: 'repeat(4, minmax(0, 1fr))' }}>
          <Field>
            <FieldLabel>Category</FieldLabel>
            <RadioDropdownMenu
              ariaLabel="Filter audit log by category"
              value={filters.eventCategory ?? 'all'}
              options={auditCategoryOptions}
              onValueChange={(value) => setFilter('eventCategory', value === 'all' ? '' : value)}
            />
          </Field>
          <Field>
            <FieldLabel>Severity</FieldLabel>
            <RadioDropdownMenu
              ariaLabel="Filter audit log by severity"
              value={filters.severity ?? 'all'}
              options={auditSeverityOptions}
              onValueChange={(value) => setFilter('severity', value === 'all' ? '' : value)}
            />
          </Field>
          <Field>
            <FieldLabel>Outcome</FieldLabel>
            <RadioDropdownMenu
              ariaLabel="Filter audit log by outcome"
              value={filters.outcome ?? 'all'}
              options={auditOutcomeOptions}
              onValueChange={(value) => setFilter('outcome', value === 'all' ? '' : value)}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="admin-audit-event-type">Event type</FieldLabel>
            <SearchCombobox
              label="Event type"
              inputId="admin-audit-event-type"
              ariaLabel="Filter audit log by event type"
              placeholder="All event types"
              searchPlaceholder="Search event types"
              emptyLabel="No event types found."
              options={auditEventTypeOptions.map((option) => ({ ...option, meta: option.value }))}
              value={selectedEventTypes}
              multiple
              onValueChange={setEventTypeFilter}
              hideLabel
              controlSize="toolbar"
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="admin-audit-vault">Vault</FieldLabel>
            <Input id="admin-audit-vault" value={filters.vaultId ?? ''} placeholder="Vault id" bg="bg.surface" onChange={(event) => setFilter('vaultId', event.target.value)} />
          </Field>
          <Field>
            <FieldLabel htmlFor="admin-audit-from">From</FieldLabel>
            <AuditDateFilterPicker
              id="admin-audit-from"
              label="From"
              value={filters.dateFrom}
              max={filters.dateTo}
              onValueChange={(value) => setDateFilter('dateFrom', value)}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="admin-audit-to">To</FieldLabel>
            <AuditDateFilterPicker
              id="admin-audit-to"
              label="To"
              value={filters.dateTo}
              min={filters.dateFrom}
              onValueChange={(value) => setDateFilter('dateTo', value)}
            />
          </Field>
        </Grid>

        {auditQuery.isLoading ? <Text textStyle="sm" color="fg.muted">Loading audit log...</Text> : null}
        {auditQuery.isError ? <Text textStyle="sm" color="fg.error">Unable to load audit log.</Text> : null}
        {!auditQuery.isLoading && !auditQuery.isError && events.length === 0 ? (
          <Text textStyle="sm" color="fg.muted">No audit events match these filters.</Text>
        ) : null}

        {events.length > 0 ? (
          <Stack gap="2">
            {events.map(event => (
              <Box key={event.id} rounded="lg" borderWidth="1px" borderColor="border.surface" bg="bg.surface" px="4" py="3">
                <Flex align="start" justify="space-between" gap="3">
                  <Box minW="0">
                    <Text textStyle="sm" fontWeight="semibold" color="fg">{event.summary}</Text>
                    <Text mt="1" textStyle="xs" color="fg.muted">
                      {formatAuditTimestamp(event.occurredAt)} · {event.eventType} · {event.outcome}
                    </Text>
                    <Text mt="1" textStyle="xs" color="fg.muted">
                      Actor: {event.actorDisplayName}
                      {event.vaultId ? ` · Vault: ${event.vaultId}` : ''}
                      {event.documentId ? ` · Document: ${event.documentId}` : ''}
                    </Text>
                  </Box>
                  <HStack gap="1.5" flexShrink={0}>
                    <Badge variant="secondary">{event.severity}</Badge>
                    <Badge variant="outline">{event.eventCategory}</Badge>
                  </HStack>
                </Flex>
                {formatAuditMetadataEntries(event.metadata).length > 0 ? (
                  <Flex mt="3" flexWrap="wrap" gap="2">
                    {formatAuditMetadataEntries(event.metadata).map(entry => (
                      <Text key={entry.key} rounded="md" bg="bg.subtle" px="2" py="1" textStyle="xs" color="fg.muted">
                        {entry.label}: {entry.value}
                      </Text>
                    ))}
                  </Flex>
                ) : null}
              </Box>
            ))}
          </Stack>
        ) : null}

        {auditQuery.hasNextPage ? (
          <Button type="button" variant="outline" alignSelf="flex-start" disabled={auditQuery.isFetchingNextPage} onClick={() => { void auditQuery.fetchNextPage(); }}>
            {auditQuery.isFetchingNextPage ? 'Loading...' : 'Load more'}
          </Button>
        ) : null}
    </AdminAccessBoundary>
  );
}

export function AdminAiSettingsPage() {
  const queryClient = useQueryClient();
  const { accentColor } = useAccentColor();
  const meQuery = useMeQuery();
  const isEnabled = meQuery.data?.isAdmin === true;
  const aiSettingsQuery = useAdminAiSettingsQuery({ enabled: isEnabled });
  const aiStatusQuery = useAdminAiStatusQuery({ enabled: isEnabled });
  const [aiDraftOverride, setAiDraftOverride] = useState<AiSettingsDraftOverride>({});
  const [expandedProvider, setExpandedProvider] = useState<'ollama' | 'gemini' | null>(null);
  const [isChatModelsDialogOpen, setIsChatModelsDialogOpen] = useState(false);
  const [draftAllowedChatModels, setDraftAllowedChatModels] = useState<string[]>([]);
  const [draftDefaultChatModel, setDraftDefaultChatModel] = useState('');
  const [isEmbeddingModelDialogOpen, setIsEmbeddingModelDialogOpen] = useState(false);
  const [selectedEmbeddingModelKey, setSelectedEmbeddingModelKey] = useState('');
  const [showSemanticIndexDetails, setShowSemanticIndexDetails] = useState(false);
  const [allowedChatModels, setAllowedChatModels] = useState<string[]>(() => {
    if (typeof window === 'undefined') return [];

    try {
      const stored = window.localStorage.getItem('arkivra.admin.ai.allowedChatModels');
      const parsed = stored ? JSON.parse(stored) : null;
      return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === 'string') : [];
    } catch {
      return [];
    }
  });
  const savedAiSettings = aiSettingsQuery.data?.settings ?? emptyAiSettings;
  const aiDraft: AdminAiSettings = {
    ...savedAiSettings,
    ...aiDraftOverride,
    chat: {
      ...savedAiSettings.chat,
      ...(aiDraftOverride.chat ?? {}),
    },
    embedding: {
      ...savedAiSettings.embedding,
      ...(aiDraftOverride.embedding ?? {}),
    },
  };
  aiDraft.ollamaHost = aiDraft.chat.baseUrl;
  aiDraft.model = aiDraft.chat.model;
  const aiStatus = aiStatusQuery.data?.status;
  const activeIndex = aiStatus?.embedding.activeIndex ?? null;
  const preparingIndex = aiStatus?.embedding.candidateIndexes.find(index => index.status === 'building' || index.status === 'ready') ?? null;
  const currentIndex = preparingIndex ?? activeIndex;
  const chunkCoverage = aiStatus?.embedding.chunkCoverage ?? {
    indexedChunkCount: 0,
    totalChunkCount: 0,
  };
  const canListChatModels = isEnabled && aiDraft.chat.provider === 'ollama' && aiDraft.chat.baseUrl.trim().length > 0;
  const chatModelsQuery = useAdminOllamaModelsQuery({
    host: aiDraft.chat.baseUrl,
    enabled: canListChatModels,
  });
  const availableChatModelNames = useMemo(
    () => chatModelsQuery.data?.models.map(model => model.name) ?? [],
    [chatModelsQuery.data?.models],
  );
  const chatModelOptions = useMemo(() => {
    const currentModel = aiDraft.chat.model.trim();
    const names = availableChatModelNames.filter(model =>
      !isCatalogEmbeddingModel(aiDraft.chat.provider, model) || model === currentModel,
    );
    if (currentModel.length > 0 && !names.includes(currentModel)) {
      names.unshift(currentModel);
    }

    return names;
  }, [aiDraft.chat.model, aiDraft.chat.provider, availableChatModelNames]);
  const effectiveDefaultChatModel = aiDraft.chat.model.trim() || (chatModelOptions[0] ?? '');
  const effectiveAllowedChatModels = allowedChatModels.length === 0
    ? chatModelOptions
    : chatModelOptions.filter(model => allowedChatModels.includes(model) || model === effectiveDefaultChatModel);
  const chatAvailabilityQuery = useAdminAiAvailabilityQuery({
    host: aiDraft.chat.baseUrl,
    model: effectiveDefaultChatModel,
    enabled: canListChatModels && effectiveDefaultChatModel.length > 0,
  });
  const chatAvailability = chatAvailabilityQuery.data?.availability;
  const chatConnectionStatus = getConnectionStatusLabel({
    enabled: aiDraft.chat.baseUrl.trim().length > 0 && effectiveDefaultChatModel.length > 0,
    isLoading: chatAvailabilityQuery.isFetching,
    reachable: chatAvailability?.reachable,
    modelAvailable: chatAvailability?.modelAvailable,
  });
  const isChatConfigValid =
    aiDraft.chat.baseUrl.trim().length > 0
    && effectiveDefaultChatModel.length > 0;
  const isEmbeddingConfigValid =
    aiDraft.embedding.baseUrl.trim().length > 0
    && aiDraft.embedding.model.trim().length > 0
    && Number.isInteger(aiDraft.embedding.dimensions)
    && aiDraft.embedding.dimensions > 0;
  const readinessChecks = [
    {
      label: 'Chat provider',
      statusLabel: 'Configured',
      missingLabel: 'No chat provider configured',
      isMet: aiDraft.chat.provider.length > 0 && aiDraft.chat.baseUrl.trim().length > 0,
    },
    {
      label: 'Embedding provider',
      statusLabel: 'Configured',
      missingLabel: 'No embedding provider configured',
      isMet: aiDraft.embedding.provider.length > 0 && aiDraft.embedding.baseUrl.trim().length > 0,
    },
    {
      label: 'Default chat model',
      statusLabel: 'Selected',
      missingLabel: 'No default chat model selected',
      isMet: effectiveDefaultChatModel.length > 0,
    },
    {
      label: 'Embedding model',
      statusLabel: 'Selected',
      missingLabel: 'No embedding model selected',
      isMet: aiDraft.embedding.model.trim().length > 0,
    },
  ];
  const isAiReady = readinessChecks.every(check => check.isMet);
  const indexProgress = currentIndex
    ? getIndexProgress(currentIndex)
    : chunkCoverage.totalChunkCount > 0
      ? Math.min(100, Math.round((chunkCoverage.indexedChunkCount / chunkCoverage.totalChunkCount) * 100))
      : 0;
  const platformStatus = !aiDraft.aiFeaturesEnabled ? 'Disabled' : isAiReady ? 'Active' : 'Needs configuration';
  const platformTone = !aiDraft.aiFeaturesEnabled ? 'inactive' : isAiReady ? 'enabled' : 'warning';
  const isSemanticIndexIncomplete = aiDraft.aiFeaturesEnabled
    && indexProgress < 100
    && (currentIndex !== null || chunkCoverage.totalChunkCount > 0);
  const semanticStatus = !aiDraft.aiFeaturesEnabled
    ? 'Paused'
    : isSemanticIndexIncomplete ? 'Building'
    : currentIndex
      ? formatIndexStatus(currentIndex.status)
      : isEmbeddingConfigValid ? 'Ready to index' : 'Needs configuration';
  const semanticStatusMessage = aiDraft.aiFeaturesEnabled
    ? 'Indexing continues in the background. Search switches to a new index only after it is ready.'
    : 'Indexing is paused, but your progress is saved. When you enable AI again, indexing will automatically continue from where it left off.';
  const semanticProgressStatus: ChunkProgressVisualStatus = !aiDraft.aiFeaturesEnabled
    ? 'paused'
    : currentIndex?.status === 'failed'
      ? 'failed'
      : isSemanticIndexIncomplete ? 'building' : currentIndex?.status ?? 'idle';
  const semanticIndexTone: SettingsStatusTone = currentIndex?.status === 'failed'
    ? 'warning'
    : !aiDraft.aiFeaturesEnabled
      ? 'inactive'
      : isSemanticIndexIncomplete ? 'warning' : currentIndex ? 'enabled' : 'inactive';
  const chatStatus = chatConnectionStatus === 'Healthy'
    ? 'Ready'
    : isChatConfigValid ? chatConnectionStatus : 'Needs configuration';
  const translationStatus = isChatConfigValid ? (chatConnectionStatus === 'Error' ? 'Provider error' : 'Ready') : 'Needs configuration';
  const indexedChunks = chunkCoverage.indexedChunkCount;
  const configuredEmbeddingModel = savedAiSettings.embedding.model || aiDraft.embedding.model;
  const configuredEmbeddingProvider = savedAiSettings.embedding.provider || aiDraft.embedding.provider;
  const configuredEmbeddingDimensions = savedAiSettings.embedding.dimensions || aiDraft.embedding.dimensions;
  const embeddingModelOptions = useMemo<EmbeddingModelOption[]>(() => {
    const discoveredModels = chatModelsQuery.data?.models ?? [];
    const configuredModel = savedAiSettings.embedding.model.trim() || aiDraft.embedding.model.trim();
    const activeModel = activeIndex?.model.trim() ?? '';
    const optionByKey = new Map<string, EmbeddingModelOption>();

    function addModelOption(model: string) {
      if (model.length === 0) return;

      const discovered = discoveredModels.find(item => item.name === model);
      const key = `${aiDraft.embedding.provider}:${aiDraft.embedding.baseUrl}:${model}`;

      optionByKey.set(key, {
        key,
        provider: aiDraft.embedding.provider,
        providerLabel: formatProvider(aiDraft.embedding.provider),
        baseUrl: aiDraft.embedding.baseUrl,
        model,
        dimensions: aiDraft.embedding.dimensions,
        isActive: activeIndex?.provider === aiDraft.embedding.provider && activeIndex.model === model,
        isConfigured: savedAiSettings.embedding.provider === aiDraft.embedding.provider && savedAiSettings.embedding.model === model,
        isDiscovered: discovered !== undefined,
        size: discovered?.size ?? null,
        modifiedAt: discovered?.modifiedAt ?? null,
      });
    }

    for (const catalogModel of popularEmbeddingModelCatalog) {
      if (catalogModel.provider !== aiDraft.embedding.provider) {
        continue;
      }

      for (const discovered of discoveredModels) {
        if (matchesCatalogModel(discovered.name, catalogModel.model)) {
          addModelOption(discovered.name);
        }
      }
    }

    addModelOption(configuredModel);
    addModelOption(activeModel);

    return Array.from(optionByKey.values())
      .sort((left, right) =>
        left.providerLabel.localeCompare(right.providerLabel) || left.model.localeCompare(right.model),
      );
  }, [
    activeIndex?.model,
    aiDraft.embedding.baseUrl,
    aiDraft.embedding.dimensions,
    aiDraft.embedding.model,
    aiDraft.embedding.provider,
    chatModelsQuery.data?.models,
    activeIndex?.provider,
    savedAiSettings.embedding.model,
    savedAiSettings.embedding.provider,
  ]);
  const selectedEmbeddingModel = embeddingModelOptions.find(option => option.key === selectedEmbeddingModelKey) ?? null;
  const selectedEmbeddingModelChanged = selectedEmbeddingModel !== null && (
    savedAiSettings.embedding.provider !== selectedEmbeddingModel.provider
    || savedAiSettings.embedding.baseUrl !== selectedEmbeddingModel.baseUrl
    || savedAiSettings.embedding.model !== selectedEmbeddingModel.model
    || savedAiSettings.embedding.dimensions !== selectedEmbeddingModel.dimensions
  );

  function mergeAiDraft(next: AiSettingsDraftOverride): AdminAiSettings {
    const merged: AdminAiSettings = {
      ...aiDraft,
      ...next,
      chat: {
        ...aiDraft.chat,
        ...(next.chat ?? {}),
      },
      embedding: {
        ...aiDraft.embedding,
        ...(next.embedding ?? {}),
      },
    };

    merged.ollamaHost = merged.chat.baseUrl;
    merged.model = merged.chat.model;
    return merged;
  }

  function normalizeAiSettingsForSave(settings: AdminAiSettings): AdminAiSettings {
    const chatBaseUrl = settings.chat.baseUrl.trim();
    const chatModel = settings.chat.model.trim() || effectiveDefaultChatModel.trim();
    const embeddingBaseUrl = settings.embedding.baseUrl.trim() || chatBaseUrl;
    const embeddingModel = settings.embedding.model.trim() || savedAiSettings.embedding.model || emptyAiSettings.embedding.model;
    const embeddingDimensions = settings.embedding.dimensions > 0
      ? settings.embedding.dimensions
      : savedAiSettings.embedding.dimensions || emptyAiSettings.embedding.dimensions;

    return {
      ...settings,
      chat: {
        ...settings.chat,
        baseUrl: chatBaseUrl,
        model: chatModel,
      },
      embedding: {
        ...settings.embedding,
        baseUrl: embeddingBaseUrl,
        model: embeddingModel,
        dimensions: embeddingDimensions,
      },
      ollamaHost: chatBaseUrl,
      model: chatModel,
    };
  }

  const aiSettingsMutation = useMutation({
    mutationFn: (settings: AdminAiSettings) => updateAdminAiSettings(normalizeAiSettingsForSave(settings)),
    onSuccess: async ({ settings }) => {
      toast.success('AI settings saved.');
      setAiDraftOverride(settings);
      queryClient.setQueryData<MeResponse | undefined>(meQueryKeys.all, current =>
        current === undefined
          ? current
          : {
              ...current,
              aiFeaturesEnabled: settings.aiFeaturesEnabled,
            },
      );
      await queryClient.invalidateQueries({ queryKey: adminQueryKeys.aiSettings() });
      await queryClient.invalidateQueries({ queryKey: adminQueryKeys.aiStatus() });
      await queryClient.invalidateQueries({ queryKey: meQueryKeys.all });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Could not save AI settings.');
    },
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;

    window.localStorage.setItem('arkivra.admin.ai.allowedChatModels', JSON.stringify(allowedChatModels));
  }, [allowedChatModels]);

  function updateChatDraft(next: Partial<AdminAiProviderSettings>) {
    setAiDraftOverride(draft => ({ ...draft, chat: { ...(draft.chat ?? {}), ...next } }));
  }

  function updateEmbeddingDraft(next: Partial<AdminAiSettings['embedding']>) {
    setAiDraftOverride(draft => ({ ...draft, embedding: { ...(draft.embedding ?? {}), ...next } }));
  }

  function persistAiDraft(next: AiSettingsDraftOverride, options: { confirmEmbeddingChange?: boolean } = {}) {
    const merged = mergeAiDraft(next);
    const nextEmbeddingConfigChanged =
      savedAiSettings.embedding.provider !== merged.embedding.provider
      || savedAiSettings.embedding.baseUrl !== merged.embedding.baseUrl
      || savedAiSettings.embedding.model !== merged.embedding.model
      || savedAiSettings.embedding.dimensions !== merged.embedding.dimensions;

    setAiDraftOverride(merged);

    if (options.confirmEmbeddingChange && nextEmbeddingConfigChanged) {
      const nextOption = embeddingModelOptions.find(option =>
        option.provider === merged.embedding.provider
        && option.baseUrl === merged.embedding.baseUrl
        && option.model === merged.embedding.model,
      );
      setSelectedEmbeddingModelKey(nextOption?.key ?? '');
      setIsEmbeddingModelDialogOpen(true);
      return;
    }

    aiSettingsMutation.mutate(merged);
  }

  function persistProviderSettings() {
    if (!isChatConfigValid) {
      return;
    }

    persistAiDraft({
      chat: {
        baseUrl: aiDraft.chat.baseUrl,
      },
      embedding: {
        baseUrl: aiDraft.embedding.baseUrl,
      },
    });
  }

  function openChatModelsDialog() {
    const defaultModel = effectiveDefaultChatModel || chatModelOptions[0] || '';
    const allowed = effectiveAllowedChatModels.length > 0
      ? effectiveAllowedChatModels
      : defaultModel ? [defaultModel] : [];

    setDraftDefaultChatModel(defaultModel);
    setDraftAllowedChatModels(chatModelOptions.filter(model => allowed.includes(model) || model === defaultModel));
    setIsChatModelsDialogOpen(true);
  }

  function updateDraftAllowedChatModel(model: string, checked: boolean) {
    setDraftAllowedChatModels((current) => {
      const next = new Set(current);

      if (checked) {
        next.add(model);
      } else if (model !== draftDefaultChatModel) {
        next.delete(model);
      }

      if (draftDefaultChatModel.length > 0) {
        next.add(draftDefaultChatModel);
      }

      return chatModelOptions.filter(option => next.has(option));
    });
  }

  function updateDraftDefaultChatModel(model: string) {
    setDraftDefaultChatModel(model);
    setDraftAllowedChatModels(current => chatModelOptions.filter(option => current.includes(option) || option === model));
  }

  function saveChatModelsDialog() {
    if (draftDefaultChatModel.length === 0) {
      return;
    }

    const allowed = chatModelOptions.filter(model =>
      draftAllowedChatModels.includes(model) || model === draftDefaultChatModel,
    );
    setAllowedChatModels(allowed);
    setIsChatModelsDialogOpen(false);

    if (draftDefaultChatModel !== effectiveDefaultChatModel) {
      persistAiDraft({ chat: { model: draftDefaultChatModel } });
    }
  }

  return (
    <AdminAccessBoundary
      title="AI settings"
      description="Configure optional AI capabilities and semantic search for this Arkivra instance."
      isEnabled={isEnabled}
      isLoading={meQuery.isLoading}
    >
      <Stack gap="3">
        {aiSettingsQuery.isLoading ? <Text textStyle="sm" color="fg.muted">Loading AI settings...</Text> : null}

        <AiSettingsSection
          title="AI Readiness"
          description="Requirements that must be in place before AI can be enabled."
          tone={isAiReady ? 'success' : 'warning'}
        >
          <Grid templateColumns={{ base: '1fr', xl: 'minmax(0, 1fr) minmax(13rem, 0.32fr)' }} gap="4" alignItems="stretch">
            <SimpleGrid
              columns={{ base: 1, md: 2, xl: 4 }}
              gap="0"
              rounded="md"
              borderWidth="1px"
              borderColor="border.surface"
              bg="bg.surface"
              overflow="hidden"
            >
              {readinessChecks.map((check, index) => (
                <Box
                  key={check.label}
                  borderRightWidth={{ base: '0', md: index % 2 === 0 ? '1px' : '0', xl: index === readinessChecks.length - 1 ? '0' : '1px' }}
                  borderBottomWidth={{ base: index === readinessChecks.length - 1 ? '0' : '1px', md: index < 2 ? '1px' : '0', xl: '0' }}
                  borderColor="border.surface"
                >
                  <RequirementStatus label={check.label} statusLabel={check.statusLabel} missingLabel={check.missingLabel} isMet={check.isMet} />
                </Box>
              ))}
            </SimpleGrid>
            <Box borderLeftWidth={{ base: '0', xl: '1px' }} borderTopWidth={{ base: '1px', xl: '0' }} borderColor="border.surface" ps={{ base: '0', xl: '4' }} pt={{ base: '3', xl: '0' }}>
              <Stack gap="1">
                <Text textStyle="sm" fontWeight="semibold" color={isAiReady ? 'fg.success' : 'fg.warning'}>
                  {isAiReady ? 'All set!' : 'Configuration required'}
                </Text>
                <Text textStyle="sm" color="fg.muted">
                  {isAiReady ? 'You can enable AI features.' : 'Configure the missing requirements before enabling AI.'}
                </Text>
              </Stack>
            </Box>
          </Grid>
        </AiSettingsSection>

        <AiSettingsSection
          title="AI features"
          description="Enable or disable AI capabilities across Arkivra."
          actions={<SettingsStatusBadge tone={platformTone}>{platformStatus}</SettingsStatusBadge>}
        >
          <Grid templateColumns={{ base: '1fr', lg: 'minmax(18rem, 1fr) minmax(16rem, 0.95fr)' }} gap="4">
            <Stack gap="4" minW="0">
              <Stack gap="2.5">
                <Text textStyle="sm" fontWeight="semibold" color="fg">AI features</Text>
                <HStack gap="3">
                  <Switch
                    aria-label="Enable AI features"
                    checked={aiDraft.aiFeaturesEnabled}
                    colorPalette={accentColor}
                    disabled={(!aiDraft.aiFeaturesEnabled && !isAiReady) || aiSettingsMutation.isPending}
                    onCheckedChange={(checked) => {
                      if (checked && !isAiReady) {
                        toast.warning('Complete AI readiness requirements before enabling AI.');
                        return;
                      }

                      persistAiDraft({ aiFeaturesEnabled: checked });
                    }}
                  />
                  <Text textStyle="sm" fontWeight="semibold" color="fg">{aiDraft.aiFeaturesEnabled ? 'Enabled' : 'Disabled'}</Text>
                </HStack>
              </Stack>
              <Text textStyle="sm" color="fg.muted">
                When enabled, semantic search indexing and AI chat capabilities will be available.
              </Text>
            </Stack>

            <Stack gap="3" minW="0" borderLeftWidth={{ base: '0', lg: '1px' }} borderColor="border.surface" pl={{ base: '0', lg: '5' }}>
              <Text textStyle="sm" fontWeight="semibold" color="fg">Feature status</Text>
              <Stack gap="1">
                <CapabilityStatus label="Semantic Search" status={semanticStatus} tone={aiDraft.aiFeaturesEnabled && isEmbeddingConfigValid ? 'ready' : aiDraft.aiFeaturesEnabled ? 'warning' : 'disabled'} />
                <CapabilityStatus label="AI Chat" status={aiDraft.aiFeaturesEnabled ? chatStatus : 'Paused'} tone={aiDraft.aiFeaturesEnabled && isChatConfigValid ? 'ready' : aiDraft.aiFeaturesEnabled ? 'warning' : 'disabled'} />
                <CapabilityStatus label="Translation" status={aiDraft.aiFeaturesEnabled ? translationStatus : 'Paused'} tone={aiDraft.aiFeaturesEnabled && isChatConfigValid ? 'ready' : aiDraft.aiFeaturesEnabled ? 'warning' : 'disabled'} />
              </Stack>
            </Stack>
          </Grid>
        </AiSettingsSection>

        <AiSettingsSection
          title="Semantic Search"
          description="The index enables semantic search across your documents."
          actions={
            <>
              <SettingsStatusBadge tone={semanticIndexTone}>
                {semanticStatus}
              </SettingsStatusBadge>
              <Button
                type="button"
                variant="outline"
                size="sm"
                aria-label={showSemanticIndexDetails ? 'Hide semantic search details' : 'View semantic search details'}
                onClick={() => setShowSemanticIndexDetails(current => !current)}
              >
                {showSemanticIndexDetails ? 'Hide details' : 'View details'}
              </Button>
            </>
          }
        >
          <Stack gap="4">
            <Grid templateColumns={{ base: '1fr', lg: 'minmax(0, 1.35fr) minmax(18rem, 0.9fr)' }} gap="4" alignItems="stretch">
              <Stack gap="3">
                <SemanticIndexProgressSummary
                  indexedChunks={indexedChunks}
                  expectedChunks={chunkCoverage.totalChunkCount}
                  progress={indexProgress}
                  status={semanticProgressStatus}
                />
                <SimpleGrid columns={{ base: 1, md: 3 }} gap="3">
                  <CompactMetric label="Live index model" value={currentIndex?.model ?? (aiDraft.embedding.model || 'Not selected')} />
                  <CompactMetric label="Index version" value={currentIndex?.id ?? 'No index'} />
                  <CompactMetric label="Last updated" value={formatShortDateTime(currentIndex?.updatedAt)} />
                </SimpleGrid>
                {showSemanticIndexDetails ? (
                  <SimpleGrid columns={{ base: 1, md: 2 }} gap="3">
                    <CompactMetric label="Started time" value={formatShortDateTime(currentIndex?.buildStartedAt ?? currentIndex?.createdAt)} />
                    <CompactMetric label="Expected chunks" value={chunkCoverage.totalChunkCount.toLocaleString()} />
                  </SimpleGrid>
                ) : null}
              </Stack>

              <Box rounded="md" borderWidth="1px" borderColor="blue.muted" bg="blue.subtle" px="4" py="4">
                <Stack gap="2">
                  <HStack gap="2" align="flex-start">
                    <Box color="fg.info" mt="0.5" flexShrink={0}>
                      <Info size={15} />
                    </Box>
                    <Text textStyle="sm" fontWeight="semibold" color="blue.solid">Current status: {semanticStatus}</Text>
                  </HStack>
                  <Text textStyle="sm" color="fg.muted">
                    {semanticStatusMessage}
                  </Text>
                </Stack>
              </Box>
            </Grid>
          </Stack>
        </AiSettingsSection>

        <SimpleGrid columns={{ base: 1, xl: 2 }} gap="3" alignItems="stretch">
          <AiSettingsSection
            title="Embedding"
            description="Configure the model used to create vector embeddings for semantic search."
            minH="19rem"
          >
            <Stack gap="4">
              <Stack gap="2">
                <Text textStyle="xs" fontWeight="semibold" color="fg.muted">Selected model</Text>
                <Flex
                  align="center"
                  justify="space-between"
                  gap="3"
                  rounded="md"
                  borderWidth="1px"
                  borderColor="border.surface"
                  bg="bg.surface"
                  px="3"
                  py="2"
                >
                  <HStack gap="2.5" minW="0">
                    <Flex
                      boxSize="7"
                      align="center"
                      justify="center"
                      rounded="md"
                      borderWidth="1px"
                      borderColor="border.surface"
                      bg="bg.subtle"
                      color="fg.muted"
                      flexShrink={0}
                    >
                      <Package size={17} />
                    </Flex>
                    <Stack gap="0" minW="0">
                      <Text textStyle="sm" fontWeight="semibold" color="fg" truncate>
                        {configuredEmbeddingModel || 'Not selected'}
                      </Text>
                      <Text textStyle="xs" color="fg.muted" truncate>
                        {formatProvider(configuredEmbeddingProvider)}
                        {' · '}
                        {configuredEmbeddingDimensions.toLocaleString()}
                        {' dimensions'}
                      </Text>
                    </Stack>
                  </HStack>
                  <SettingsStatusBadge tone={configuredEmbeddingModel ? 'enabled' : 'inactive'} density="compact">
                    {configuredEmbeddingModel ? 'Selected' : 'Not selected'}
                  </SettingsStatusBadge>
                </Flex>
              </Stack>
              <HStack gap="2" align="center">
                <Text textStyle="xs" fontWeight="semibold" color="fg.muted">Status</Text>
                <SettingsStatusBadge tone={semanticIndexTone} density="compact">
                  {semanticStatus}
                </SettingsStatusBadge>
              </HStack>
              <Alert status="warning" colorPalette="orange" borderColor="orange.muted" bg="orange.subtle" alignItems="flex-start">
                <AlertTriangle size={16} />
                <AlertDescription>
                  <Stack gap="1">
                    <Text fontWeight="semibold">Changing the embedding model requires rebuilding the semantic search index.</Text>
                    <Text>
                      {aiDraft.aiFeaturesEnabled
                        ? 'A full reindexing job will run in the background and may take several hours depending on your data size.'
                        : 'When AI features are enabled, a full reindexing job will run in the background and may take several hours depending on your data size.'}
                    </Text>
                  </Stack>
                </AlertDescription>
              </Alert>
              <Button
                type="button"
                variant="outline"
                size="sm"
                alignSelf="flex-start"
                disabled={!isEmbeddingConfigValid || aiSettingsMutation.isPending}
                onClick={() => {
                  const currentOption = embeddingModelOptions.find(option =>
                    option.provider === savedAiSettings.embedding.provider
                    && option.baseUrl === savedAiSettings.embedding.baseUrl
                    && option.model === savedAiSettings.embedding.model,
                  ) ?? embeddingModelOptions[0];

                  setSelectedEmbeddingModelKey(currentOption?.key ?? '');
                  setIsEmbeddingModelDialogOpen(true);
                }}
              >
                Change model
              </Button>
            </Stack>
          </AiSettingsSection>

          <AiSettingsSection
            title="Chat"
            description="Configure the model used for AI chat responses."
            minH="19rem"
          >
            <Stack gap="4">
              <Stack gap="2">
                <Text textStyle="xs" fontWeight="semibold" color="fg.muted">Selected model</Text>
                <Flex
                  align="center"
                  justify="space-between"
                  gap="3"
                  rounded="md"
                  borderWidth="1px"
                  borderColor="border.surface"
                  bg="bg.surface"
                  px="3"
                  py="2"
                >
                  <HStack gap="2.5" minW="0">
                    <Flex
                      boxSize="7"
                      align="center"
                      justify="center"
                      rounded="md"
                      borderWidth="1px"
                      borderColor="border.surface"
                      bg="bg.subtle"
                      color="fg.muted"
                      flexShrink={0}
                    >
                      <Send size={17} />
                    </Flex>
                    <Stack gap="0" minW="0">
                      <Text textStyle="sm" fontWeight="semibold" color="fg" truncate>
                        {effectiveDefaultChatModel || 'Not selected'}
                      </Text>
                      <Text textStyle="xs" color="fg.muted" truncate>
                        {formatProvider(aiDraft.chat.provider)}
                        {aiDraft.chat.baseUrl ? ` · ${aiDraft.chat.baseUrl}` : ''}
                      </Text>
                    </Stack>
                  </HStack>
                  <SettingsStatusBadge tone={effectiveDefaultChatModel ? 'enabled' : 'inactive'} density="compact">
                    {effectiveDefaultChatModel ? 'Default' : 'Not selected'}
                  </SettingsStatusBadge>
                </Flex>
              </Stack>
              <Stack gap="1.5">
                <Text textStyle="xs" color="fg.muted">Models available to users</Text>
                <HStack gap="2" flexWrap="wrap">
                  <SettingsStatusBadge tone={effectiveAllowedChatModels.length > 0 ? 'enabled' : 'inactive'} density="compact">
                    {effectiveAllowedChatModels.length.toLocaleString()}
                    {' '}
                    allowed
                  </SettingsStatusBadge>
                  <Text textStyle="xs" color="fg.muted">
                    Embedding models are omitted from chat choices.
                  </Text>
                </HStack>
              </Stack>
              <Button
                type="button"
                variant="outline"
                size="sm"
                alignSelf="flex-start"
                disabled={chatModelOptions.length === 0 || aiSettingsMutation.isPending}
                onClick={openChatModelsDialog}
              >
                Configure chat models
              </Button>
            </Stack>
          </AiSettingsSection>
        </SimpleGrid>

        <AiSettingsSection
          title="Providers"
          description="Infrastructure configuration for AI providers."
          actions={
            <Button type="button" size="sm" variant="outline" disabled>
              <Plus size={14} />
              Add Provider
            </Button>
          }
        >
          <Stack gap="2" rounded="md" borderWidth="1px" borderColor="border.surface" bg="bg.surface" overflow="hidden">
            <Box>
              <Grid templateColumns={{ base: '1fr', lg: 'minmax(10rem, 1fr) 8rem 7rem minmax(10rem, 0.8fr) auto' }} gap="3" alignItems="center" px="3" py="2.5">
                <Stack gap="0.5" minW="0">
                  <Text textStyle="sm" fontWeight="semibold" color="fg">Ollama</Text>
                  <Text textStyle="xs" color="fg.muted">Chat and embedding provider</Text>
                </Stack>
                <SettingsStatusBadge tone={chatConnectionStatus === 'Healthy' ? 'enabled' : chatConnectionStatus === 'Error' ? 'warning' : 'inactive'} density="compact">{chatConnectionStatus}</SettingsStatusBadge>
                <Text textStyle="sm" color="fg.muted">{chatModelsQuery.data?.models.length ?? 0} models</Text>
                <Text textStyle="sm" color="fg.muted">{chatAvailabilityQuery.dataUpdatedAt ? formatDate(new Date(chatAvailabilityQuery.dataUpdatedAt).toISOString()) : 'Not checked'}</Text>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  aria-label={expandedProvider === 'ollama' ? 'Hide details' : 'View details'}
                  justifySelf={{ base: 'start', lg: 'end' }}
                  onClick={() => setExpandedProvider(value => value === 'ollama' ? null : 'ollama')}
                >
                  {expandedProvider === 'ollama' ? 'Hide details' : 'View details'}
                </Button>
              </Grid>
              {expandedProvider === 'ollama' ? (
                <Box borderTopWidth="1px" borderColor="border.surface" bg="bg.subtle" px="3" py="2">
                  <SettingsRows density="compact">
                    <SettingsRow
                      density="compact"
                      label="Connection information"
                      description="Provider used for chat completions and embeddings."
                      control={
                        <Select
                          value={aiDraft.chat.provider}
                          onValueChange={(value) => persistAiDraft({ chat: { provider: value as AdminAiSettings['chat']['provider'] } })}
                          positioning={{ sameWidth: true }}
                        >
                          <SelectTrigger aria-label="Chat provider" bg="bg.surface">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {chatProviderOptions.map(option => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      }
                    />
                    <SettingsRow density="compact" label="Chat base URL" description="The base URL for the chat provider API." control={<Input aria-label="Chat provider base URL" type="url" value={aiDraft.chat.baseUrl} placeholder="http://127.0.0.1:11434" onBlur={persistProviderSettings} onChange={(event) => updateChatDraft({ baseUrl: event.target.value })} />} />
                    <SettingsRow density="compact" label="Embedding base URL" description="The base URL for the embedding provider API." control={<Input aria-label="Embedding provider base URL" type="url" value={aiDraft.embedding.baseUrl} placeholder="http://127.0.0.1:11434" onBlur={persistProviderSettings} onChange={(event) => updateEmbeddingDraft({ baseUrl: event.target.value })} />} />
                    <SettingsRow density="compact" label="Health status" meta={<Text textStyle="sm" color={chatAvailability?.error ? 'fg.error' : 'fg'}>{chatAvailability?.error ?? chatConnectionStatus}</Text>} />
                    <SettingsRow density="compact" label="Available models" meta={<Text textStyle="sm" color="fg">{chatModelsQuery.data?.models.map(model => model.name).join(', ') || 'No models discovered'}</Text>} />
                    <SettingsRow density="compact" label="API key / secret reference" description="Ollama does not require a stored API key in this configuration." control={<Input value={aiDraft.chat.apiKeySecretRef ?? 'Not configured'} readOnly bg="bg.subtle" color="fg.muted" />} />
                    <SettingsRow density="compact" label="Test connection" control={<Button type="button" size="sm" variant="outline" disabled={chatAvailabilityQuery.isFetching || !isChatConfigValid} onClick={() => void chatAvailabilityQuery.refetch()}>{chatAvailabilityQuery.isFetching ? 'Checking...' : 'Test connection'}</Button>} />
                  </SettingsRows>
                </Box>
              ) : null}
            </Box>

            <Box borderTopWidth="1px" borderColor="border.surface">
              <Grid templateColumns={{ base: '1fr', lg: 'minmax(10rem, 1fr) 8rem 7rem minmax(10rem, 0.8fr) auto' }} gap="3" alignItems="center" px="3" py="2.5">
                <Stack gap="0.5" minW="0">
                  <Text textStyle="sm" fontWeight="semibold" color="fg">Google Gemini</Text>
                  <Text textStyle="xs" color="fg.muted">Provider support reserved for this instance</Text>
                </Stack>
                <SettingsStatusBadge tone="inactive" density="compact">Not configured</SettingsStatusBadge>
                <Text textStyle="sm" color="fg.muted">0 models</Text>
                <Text textStyle="sm" color="fg.muted">Not checked</Text>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  aria-label={expandedProvider === 'gemini' ? 'Hide Google Gemini details' : 'View Google Gemini provider'}
                  justifySelf={{ base: 'start', lg: 'end' }}
                  onClick={() => setExpandedProvider(value => value === 'gemini' ? null : 'gemini')}
                >
                  {expandedProvider === 'gemini' ? 'Hide details' : 'View details'}
                </Button>
              </Grid>
              {expandedProvider === 'gemini' ? (
                <Box borderTopWidth="1px" borderColor="border.surface" bg="bg.subtle" px="3" py="2">
                  <SettingsRows density="compact">
                    <SettingsRow density="compact" label="Connection information" description="Gemini provider configuration has not been added to this instance." meta="Not configured" />
                    <SettingsRow density="compact" label="Health status" meta="Not checked" />
                    <SettingsRow density="compact" label="Available models" meta="No models discovered" />
                    <SettingsRow density="compact" label="Test connection" control={<Button type="button" size="sm" variant="outline" disabled>Test connection</Button>} />
                  </SettingsRows>
                </Box>
              ) : null}
            </Box>
          </Stack>
        </AiSettingsSection>
      </Stack>

      <Dialog open={isChatModelsDialogOpen} onOpenChange={setIsChatModelsDialogOpen}>
        <DialogContent maxW="40rem" w="calc(100vw - 2rem)">
          <DialogHeader px="5" pt="5" pb="3">
            <DialogTitle>Configure chat models</DialogTitle>
            <DialogDescription>
              Select which chat models users can choose and set the default model. Embedding models are omitted from this list.
            </DialogDescription>
          </DialogHeader>
          <DialogBody px="5" pb="4">
            <Box rounded="md" borderWidth="1px" borderColor="border.surface" bg="bg.surface" overflow="hidden">
              <Box px="3" py="2" borderBottomWidth="1px" borderColor="border.surface">
                <Grid templateColumns="minmax(0, 1fr) minmax(7rem, auto)" gap="3" alignItems="center">
                  <Text textStyle="sm" fontWeight="semibold" color="fg">Available chat models</Text>
                  <Text textStyle="xs" color="fg.muted" textAlign="end">Default</Text>
                </Grid>
              </Box>
              {chatModelOptions.length > 0 ? (
                <RadioGroup
                  name="default-chat-model"
                  value={draftDefaultChatModel}
                  onValueChange={updateDraftDefaultChatModel}
                  gap="0"
                  divideY="1px"
                  divideColor="border.surface"
                >
                  {chatModelOptions.map(model => (
                    <Grid
                      key={model}
                      templateColumns="minmax(0, 1fr) minmax(7rem, auto)"
                      gap="3"
                      alignItems="center"
                      px="3"
                      py="2.5"
                      _hover={{ bg: 'bg.subtle' }}
                    >
                      <Checkbox
                        checked={draftAllowedChatModels.includes(model)}
                        disabled={model === draftDefaultChatModel}
                        onCheckedChange={(checked) => updateDraftAllowedChatModel(model, checked)}
                      >
                        <Stack gap="0" minW="0">
                          <Text textStyle="sm" fontWeight="semibold" color={model === draftDefaultChatModel ? 'fg.muted' : 'fg'} truncate>
                            {model}
                          </Text>
                          <Text textStyle="xs" color="fg.muted" truncate>
                            {formatProvider(aiDraft.chat.provider)}
                            {aiDraft.chat.baseUrl ? ` · ${aiDraft.chat.baseUrl}` : ''}
                          </Text>
                        </Stack>
                      </Checkbox>
                      <HStack as="label" gap="2" justify="flex-end" cursor="pointer">
                        <RadioGroupItem value={model} />
                        <Text textStyle="xs" color={model === draftDefaultChatModel ? 'fg' : 'fg.muted'}>
                          {model === draftDefaultChatModel ? 'Default' : 'Use'}
                        </Text>
                      </HStack>
                    </Grid>
                  ))}
                </RadioGroup>
              ) : (
                <Text px="3" py="3" textStyle="sm" color="fg.muted">
                  {chatModelsQuery.isFetching ? 'Loading chat models from configured providers...' : 'No chat models are available from configured providers.'}
                </Text>
              )}
            </Box>
          </DialogBody>
          <DialogFooter px="5" pb="5" pt="0">
            <Button type="button" size="sm" variant="outline" onClick={() => setIsChatModelsDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={draftDefaultChatModel.length === 0 || aiSettingsMutation.isPending}
              onClick={saveChatModelsDialog}
            >
              {aiSettingsMutation.isPending ? 'Saving...' : 'Save chat models'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isEmbeddingModelDialogOpen} onOpenChange={setIsEmbeddingModelDialogOpen}>
        <DialogContent maxW="38rem" w="calc(100vw - 2rem)">
          <DialogHeader px="5" pt="5" pb="3">
            <DialogTitle>Change embedding model</DialogTitle>
            <DialogDescription>
              Select the model Arkivra should use for new semantic indexes. The live index keeps serving search until the new one is ready.
            </DialogDescription>
          </DialogHeader>
          <DialogBody px="5" pb="4">
            <Stack gap="4">
              <Box rounded="md" borderWidth="1px" borderColor="border.surface" bg="bg.surface" overflow="hidden">
                <Box px="3" py="2" borderBottomWidth="1px" borderColor="border.surface">
                  <Text textStyle="sm" fontWeight="semibold" color="fg">Available embedding models</Text>
                </Box>
                {embeddingModelOptions.length > 0 ? (
                  <RadioGroup
                    name="embedding-model"
                    value={selectedEmbeddingModelKey}
                    onValueChange={setSelectedEmbeddingModelKey}
                    gap="0"
                    divideY="1px"
                    divideColor="border.surface"
                  >
                    {embeddingModelOptions.map(option => (
                      <Flex
                        key={option.key}
                        as="label"
                        align="center"
                        justify="space-between"
                        gap="3"
                        px="3"
                        py="2.5"
                        cursor="pointer"
                        _hover={{ bg: 'bg.subtle' }}
                      >
                        <HStack gap="2.5" minW="0" align="center">
                          <RadioGroupItem value={option.key} />
                          <Stack gap="0" minW="0">
                            <Text textStyle="sm" fontWeight="semibold" color="fg" truncate>
                              {option.model}
                            </Text>
                            <Text textStyle="xs" color="fg.muted" truncate>
                              {option.providerLabel}
                              {option.baseUrl ? ` · ${option.baseUrl}` : ''}
                            </Text>
                          </Stack>
                        </HStack>
                        <HStack gap="1.5" flexShrink={0}>
                          {option.isConfigured ? <Badge variant="secondary" colorPalette="teal">Selected</Badge> : null}
                          {option.isActive && !option.isConfigured ? <Badge variant="outline">Live index</Badge> : null}
                          {!option.isDiscovered ? <Badge variant="outline" colorPalette="gray">Not listed</Badge> : null}
                        </HStack>
                      </Flex>
                    ))}
                  </RadioGroup>
                ) : (
                  <Text px="3" py="3" textStyle="sm" color="fg.muted">
                    {chatModelsQuery.isFetching ? 'Loading models from configured providers...' : 'No catalog embedding models were found from configured providers.'}
                  </Text>
                )}
              </Box>
              <Alert status="warning" colorPalette="orange" borderColor="orange.muted" bg="orange.subtle" alignItems="flex-start">
                <AlertTriangle size={16} />
                <AlertDescription>
                  <Stack gap="2">
                    <Text fontWeight="semibold">Changing the embedding model requires rebuilding the semantic search index.</Text>
                    <Stack as="ul" gap="1" ps="4">
                      <Text as="li">The current index will remain available until the new index is ready.</Text>
                      <Text as="li">
                        {aiDraft.aiFeaturesEnabled
                          ? 'A full reindexing job will run in the background.'
                          : 'When AI features are enabled, a full reindexing job will run in the background.'}
                      </Text>
                      <Text as="li">This may take several hours depending on your data size.</Text>
                    </Stack>
                  </Stack>
                </AlertDescription>
              </Alert>
            </Stack>
          </DialogBody>
          <DialogFooter px="5" pb="5" pt="0">
            <Button type="button" size="sm" variant="outline" onClick={() => setIsEmbeddingModelDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={selectedEmbeddingModel === null || !selectedEmbeddingModelChanged || aiSettingsMutation.isPending}
              onClick={() => {
                if (selectedEmbeddingModel === null) return;

                setIsEmbeddingModelDialogOpen(false);
                aiSettingsMutation.mutate(mergeAiDraft({
                  embedding: {
                    provider: selectedEmbeddingModel.provider,
                    baseUrl: selectedEmbeddingModel.baseUrl,
                    model: selectedEmbeddingModel.model,
                    dimensions: selectedEmbeddingModel.dimensions,
                  },
                }));
              }}
            >
              {aiSettingsMutation.isPending ? 'Saving...' : 'Confirm and rebuild'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminAccessBoundary>
  );
}

export const AdminPage = AdminOverviewPage;

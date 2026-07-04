'use client';

import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  type ColumnDef,
  type ColumnFiltersState,
  type FilterFn,
  type SortingState,
  type VisibilityState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table';
import {
  Archive,
  AlertTriangle,
  ChevronDown,
  ChevronsUpDown,
  Crown,
  Database,
  Download,
  EllipsisVertical,
  Eye,
  FileText,
  Folder,
  History,
  Layers3,
  Loader2,
  Lock,
  Mail,
  MessageSquare,
  Puzzle,
  RefreshCw,
  Search,
  Send,
  Settings,
  Settings2,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Tag,
  Trash2,
  Upload,
  UserCog,
  UserMinus,
  UserRoundPlus,
  Users,
  X,
} from 'lucide-react';
import { toast } from 'sonner';

import { DatePicker } from '@/components/date-picker';
import { BaseLayout } from '@/components/layouts/base-layout';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import {
  getVaultAuditEvents,
  type AuditLogFilters,
  type AuditLogItem,
  type PaginatedAuditLogResponse,
} from '@/app/admin/audit-log/audit-log.api';
import {
  formatAuditAdvancedEntries,
  formatAuditTimestamp,
  getAuditActivityDisplay,
  type AuditActivityCategory,
} from '@/app/admin/audit-log/audit-log-formatters';
import {
  addVaultMember,
  createVaultEmailInvitation,
  deleteVault,
  getMe,
  getVault,
  isPermissionRequestResponse,
  listVaultMembers,
  listVaultPendingInvitations,
  renameVault,
  removeVaultMember,
  updateVaultMember,
  type VaultDetail,
  type VaultMember,
  type VaultPendingInvitation,
  type VaultRole,
} from './vaults.api';

export type VaultManagementSection = 'members' | 'settings' | 'activity';

const roleOptions: Array<{ value: VaultRole; label: string }> = [
  { value: 'viewer', label: 'Viewer' },
  { value: 'editor', label: 'Editor' },
  { value: 'owner', label: 'Owner' },
];

const deletedResources = [
  { label: 'All folders', icon: Folder },
  { label: 'All documents', icon: FileText },
  { label: 'All document versions', icon: Layers3 },
  { label: 'Parsed content', icon: FileText },
  { label: 'AI indexes and embeddings', icon: Sparkles },
  { label: 'Tags', icon: Tag },
  { label: 'Permissions', icon: ShieldCheck },
  { label: 'Metadata', icon: Database },
  { label: 'Every other resource owned by this vault', icon: Puzzle },
];

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

interface AuditEventFilterOption {
  value: string;
  label: string;
}

const auditEventFilterGroups: Array<{ label: string; values: AuditEventFilterOption[] }> = [
  {
    label: 'Files',
    values: [
      { value: 'document.uploaded', label: 'Uploaded' },
      { value: 'document.viewed', label: 'Viewed' },
      { value: 'document.downloaded', label: 'Downloaded' },
      { value: 'document.deleted', label: 'Deleted' },
      { value: 'document.restored', label: 'Restored' },
    ],
  },
  {
    label: 'Vaults',
    values: [
      { value: 'vault.member_added', label: 'Member added' },
      { value: 'vault.member_removed', label: 'Member removed' },
      { value: 'vault.member_role_changed', label: 'Member role changed' },
      { value: 'vault.owner_promotion_requested', label: 'Ownership requested' },
      { value: 'vault.external_invitation_sent', label: 'External invitation sent' },
      { value: 'permission_request.created', label: 'Permission requested' },
    ],
  },
  {
    label: 'Users',
    values: [
      { value: 'auth.two_factor_enabled', label: 'Two-factor enabled' },
      { value: 'auth.two_factor_disabled', label: 'Two-factor disabled' },
      { value: 'auth.password_changed', label: 'Password changed' },
      { value: 'auth.password_set', label: 'Password set' },
      { value: 'auth.email_change_requested', label: 'Email change requested' },
      { value: 'auth.email_changed', label: 'Email changed' },
      { value: 'auth.oauth_linked', label: 'Sign-in provider connected' },
      { value: 'auth.oauth_unlinked', label: 'Sign-in provider disconnected' },
    ],
  },
  {
    label: 'AI',
    values: [
      { value: 'ai.features_toggled', label: 'Availability changed' },
      { value: 'ai.chat_model_changed', label: 'Chat model changed' },
      { value: 'ai.translation_model_changed', label: 'Translation model changed' },
      { value: 'ai.embedding_model_changed', label: 'Embedding model changed' },
    ],
  },
  {
    label: 'Security',
    values: [
      { value: 'document.access_denied', label: 'File access denied' },
      { value: 'vault.access_denied', label: 'Vault access denied' },
      { value: 'auth.sensitive_action_denied', label: 'Sensitive action denied' },
      { value: 'permission_request.rejected', label: 'Permission rejected' },
    ],
  },
];

const aiEventTypes = auditEventFilterGroups
  .find((group) => group.label === 'AI')!
  .values.map((option) => option.value);
const securityEventTypes = auditEventFilterGroups
  .find((group) => group.label === 'Security')!
  .values.map((option) => option.value);

const activityCategoryOptions = [
  { value: 'all', label: 'All events', icon: Search },
  { value: 'files', label: 'Files', icon: FileText },
  { value: 'vaults', label: 'Vaults', icon: Archive },
  { value: 'users', label: 'Users', icon: Users },
  { value: 'security', label: 'Security', icon: Lock },
  { value: 'ai', label: 'AI', icon: Sparkles },
  { value: 'system', label: 'System', icon: Settings },
] as const;

function formatVaultRole(role: VaultRole | null | undefined, isAdmin = false) {
  if (role === 'owner') return 'Owner';
  if (role === 'editor') return 'Editor';
  if (role === 'viewer') return 'Viewer';
  return isAdmin ? 'Administrative read-only access' : 'No membership';
}

function canManageVault(vault: VaultDetail | null) {
  return Boolean(vault?.role === 'owner' || vault?.isAdmin || vault?.accessMode === 'admin');
}

function getMemberDisplayName(member: VaultMember) {
  return member.name ?? member.email ?? 'Unknown member';
}

function getMemberStatus(member: VaultMember, currentUserId?: string): 'Current user' | 'Member' {
  return currentUserId === member.userId ? 'Current user' : 'Member';
}

type VaultMemberTableRow =
  | {
      kind: 'member';
      id: string;
      member: VaultMember;
      userId: string;
      email: string;
      name: string | null;
      role: VaultRole;
      status: 'Current user' | 'Member';
    }
  | {
      kind: 'pending';
      id: string;
      invitation: VaultPendingInvitation;
      userId: string | null;
      email: string;
      name: string | null;
      role: VaultRole;
      status: 'Pending approval' | 'Pending acceptance';
    };

function getMemberRowDisplayName(row: VaultMemberTableRow) {
  return row.name ?? row.email ?? 'Pending member';
}

function getMemberRowInitials(row: VaultMemberTableRow) {
  const source = getMemberRowDisplayName(row).trim();
  const parts = source.split(/\s+/).filter(Boolean);

  if (parts.length >= 2) {
    return `${parts[0]![0]}${parts[1]![0]}`.toUpperCase();
  }

  return source.slice(0, 2).toUpperCase() || '?';
}

function getRoleColor(role: string) {
  switch (role) {
    case 'Owner':
      return 'bg-primary/10 text-foreground';
    case 'Editor':
      return 'bg-secondary text-secondary-foreground';
    default:
      return 'bg-muted text-muted-foreground';
  }
}

function getStatusColor(status: string) {
  if (status === 'Current user') return 'bg-primary/10 text-foreground';
  if (status === 'Pending approval') return 'border-amber-200 bg-amber-50 text-amber-700';
  if (status === 'Pending acceptance') return 'border-blue-200 bg-blue-50 text-blue-700';
  return 'bg-secondary text-secondary-foreground';
}

const exactMemberFilter: FilterFn<VaultMemberTableRow> = (row, columnId, value) => {
  return row.getValue(columnId) === value;
};

function getPendingRequestLabel(invitation: VaultPendingInvitation) {
  if (invitation.requestType === 'vault.owner_promote') return 'Owner promotion pending approval';
  if (invitation.requestType === 'vault.external_invite')
    return 'External invitation pending approval';
  return 'Invitation pending approval';
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function getSelectedEventTypes(filters: AuditLogFilters) {
  if (Array.isArray(filters.eventType)) return filters.eventType;
  return filters.eventType ? [filters.eventType] : [];
}

function getAllEventTypeOptions() {
  return auditEventFilterGroups.flatMap((group) => group.values);
}

function getEventTypeFilterLabel(selectedEventTypes: string[]) {
  if (selectedEventTypes.length === 0) return 'All event types';
  if (selectedEventTypes.length === 1) {
    return (
      getAllEventTypeOptions().find((option) => option.value === selectedEventTypes[0])?.label ??
      '1 event type'
    );
  }
  return `${selectedEventTypes.length} event types`;
}

function getImportanceClassName(importance: 'info' | 'notice' | 'warning' | 'critical') {
  switch (importance) {
    case 'critical':
      return 'border-destructive/30 bg-destructive/10 text-destructive';
    case 'warning':
      return 'border-border bg-muted text-muted-foreground';
    case 'notice':
      return 'border-primary/20 bg-primary/10 text-foreground';
    default:
      return 'border-border bg-muted/40 text-muted-foreground';
  }
}

function getImportanceLabel(importance: 'info' | 'notice' | 'warning' | 'critical') {
  switch (importance) {
    case 'critical':
      return 'Important';
    case 'warning':
      return 'Warning';
    case 'notice':
      return 'Notice';
    default:
      return 'Info';
  }
}

function getCategoryIcon(category: AuditActivityCategory) {
  switch (category) {
    case 'files':
      return FileText;
    case 'vaults':
      return Archive;
    case 'users':
      return Users;
    case 'ai':
      return Sparkles;
    case 'security':
      return Lock;
    case 'system':
      return Settings;
  }
}

function getEventIcon(event: AuditLogItem, category: AuditActivityCategory) {
  switch (event.eventType) {
    case 'document.uploaded':
    case 'document.version_created':
      return Upload;
    case 'document.viewed':
      return Eye;
    case 'document.downloaded':
      return Download;
    case 'document.deleted':
    case 'document.version_deleted':
      return Trash2;
    case 'vault.member_added':
    case 'vault.member_removed':
    case 'vault.member_role_changed':
      return UserCog;
    case 'auth.email_change_requested':
    case 'auth.email_changed':
      return Mail;
    case 'ai.chat_model_changed':
      return MessageSquare;
    case 'ai.features_toggled':
    case 'ai.translation_model_changed':
    case 'ai.embedding_model_changed':
      return Sparkles;
    default:
      return getCategoryIcon(category);
  }
}

function getIconToneClassName(importance: 'info' | 'notice' | 'warning' | 'critical') {
  switch (importance) {
    case 'critical':
      return 'bg-destructive/10 text-destructive ring-destructive/30';
    case 'warning':
      return 'bg-muted text-muted-foreground ring-border';
    case 'notice':
      return 'bg-primary/10 text-foreground ring-primary/20';
    default:
      return 'bg-muted text-muted-foreground ring-border';
  }
}

function InfoRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <tr className="border-b last:border-b-0">
      <th
        scope="row"
        className="w-40 bg-muted/30 px-3 py-2 text-left align-top text-xs font-medium uppercase text-muted-foreground"
      >
        {label}
      </th>
      <td className="min-w-0 break-words px-3 py-2 align-top text-sm font-medium">{value}</td>
    </tr>
  );
}

function AuditDetailsDialog({
  event,
  onClose,
}: {
  event: AuditLogItem | null;
  onClose: () => void;
}) {
  const advancedEntries = event ? formatAuditAdvancedEntries(event) : [];
  const display = event ? getAuditActivityDisplay(event) : null;

  return (
    <Dialog open={event !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Advanced details</DialogTitle>
          <DialogDescription>
            {event && display
              ? `${display.title} · ${formatAuditTimestamp(event.occurredAt)}`
              : null}
          </DialogDescription>
        </DialogHeader>
        {event ? (
          <div className="overflow-hidden rounded-md border">
            <table className="w-full table-fixed border-collapse">
              <tbody>
                {advancedEntries.length > 0 ? (
                  advancedEntries.map((entry) => (
                    <InfoRow key={entry.key} label={entry.label} value={entry.value} />
                  ))
                ) : (
                  <InfoRow
                    label="Details"
                    value="No advanced details are available for this event."
                  />
                )}
              </tbody>
            </table>
          </div>
        ) : null}
        <DialogFooter>
          <Button type="button" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FilterDropdown({
  label,
  value,
  icon,
  active,
  onClear,
  children,
}: {
  label: string;
  value: string;
  icon?: ReactNode;
  active: boolean;
  onClear: () => void;
  children: ReactNode;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button asChild variant="outline" className="h-10 w-full justify-between px-3 font-normal">
          <div>
            <span className="flex min-w-0 items-center gap-2">
              {icon}
              <span className="truncate">{value}</span>
            </span>
            <span className="ml-2 flex shrink-0 items-center gap-1">
              {active ? (
                <button
                  type="button"
                  aria-label={`Clear ${label} filter`}
                  className="rounded-sm p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                  onPointerDown={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    onClear();
                  }}
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    onClear();
                  }}
                >
                  <X className="size-3.5" />
                </button>
              ) : null}
              <ChevronDown className="size-4 text-muted-foreground" />
            </span>
          </div>
        </Button>
      </DropdownMenuTrigger>
      {children}
    </DropdownMenu>
  );
}

function EventTypeMultiSelectFilter({
  label,
  triggerLabel,
  groups,
  selectedValues,
  onValueChange,
  onClear,
}: {
  label: string;
  triggerLabel: string;
  groups: Array<{ label: string; values: AuditEventFilterOption[] }>;
  selectedValues: string[];
  onValueChange: (values: string[]) => void;
  onClear: () => void;
}) {
  const [query, setQuery] = useState('');
  const selectedSet = useMemo(() => new Set(selectedValues), [selectedValues]);
  const filteredGroups = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (normalizedQuery.length === 0) return groups;

    return groups
      .map((group) => ({
        ...group,
        values: group.values.filter((option) =>
          option.label.toLowerCase().includes(normalizedQuery),
        ),
      }))
      .filter((group) => group.values.length > 0);
  }, [groups, query]);

  function toggleValue(value: string, checked: boolean) {
    const nextValues = new Set(selectedValues);
    if (checked) {
      nextValues.add(value);
    } else {
      nextValues.delete(value);
    }
    onValueChange(Array.from(nextValues));
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className="h-10 w-full justify-between px-3 font-normal"
        >
          <span className="flex min-w-0 items-center gap-2">
            <Search className="size-4 shrink-0 text-muted-foreground" />
            <span className="truncate">{triggerLabel}</span>
          </span>
          <span className="ml-2 flex shrink-0 items-center gap-1">
            {selectedValues.length > 0 ? (
              <span
                role="button"
                tabIndex={0}
                aria-label={`Clear ${label.toLowerCase()} filter`}
                className="rounded-sm p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                onPointerDown={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  onClear();
                }}
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  onClear();
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    event.stopPropagation();
                    onClear();
                  }
                }}
              >
                <X className="size-3.5" />
              </span>
            ) : null}
            <ChevronsUpDown className="size-4 text-muted-foreground" />
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-0">
        <div className="border-b p-3">
          <div className="text-sm font-medium">{label}</div>
          <Input
            value={query}
            className="mt-2"
            placeholder={`Search ${label.toLowerCase()}`}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <div className="max-h-72 overflow-auto p-2">
          {filteredGroups.length === 0 ? (
            <div className="px-2 py-6 text-center text-sm text-muted-foreground">
              No event types found.
            </div>
          ) : (
            filteredGroups.map((group) => (
              <div key={group.label} className="py-1">
                <div className="px-2 py-1 text-xs font-medium uppercase text-muted-foreground">
                  {group.label}
                </div>
                {group.values.map((option) => {
                  const checked = selectedSet.has(option.value);
                  return (
                    <label
                      key={option.value}
                      className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-sm hover:bg-accent"
                    >
                      <Checkbox
                        checked={checked}
                        onCheckedChange={(nextChecked) =>
                          toggleValue(option.value, nextChecked === true)
                        }
                      />
                      <span className="min-w-0 flex-1 truncate">{option.label}</span>
                    </label>
                  );
                })}
              </div>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function RoleSelect({
  value,
  disabled,
  disabledRoles = [],
  onValueChange,
}: {
  value: VaultRole;
  disabled?: boolean;
  disabledRoles?: VaultRole[];
  onValueChange: (role: VaultRole) => void;
}) {
  return (
    <Select
      value={value}
      disabled={disabled}
      onValueChange={(next) => onValueChange(next as VaultRole)}
    >
      <SelectTrigger className="w-full min-w-36">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {roleOptions.map((option) => (
          <SelectItem
            key={option.value}
            value={option.value}
            disabled={disabledRoles.includes(option.value)}
          >
            <span className="inline-flex items-center gap-2">
              {option.value === 'owner' ? <Crown className="size-4" /> : null}
              {option.label}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function VaultDeleteConfirmDialog({
  open,
  vault,
  isPending,
  errorMessage,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  vault: { id: string; name: string } | null;
  isPending: boolean;
  errorMessage: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const [confirmation, setConfirmation] = useState('');
  const isValid = vault !== null && confirmation === vault.name;

  useEffect(() => {
    if (!open) setConfirmation('');
  }, [open, vault?.id]);

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen && !isPending) onCancel();
      }}
    >
      <DialogContent className="max-h-[min(48rem,calc(100svh-2rem))] overflow-y-auto sm:max-w-4xl">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (isValid && !isPending) onConfirm();
          }}
          className="space-y-6"
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              <span className="flex size-10 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
                <Trash2 className="size-5" />
              </span>
              Delete vault
            </DialogTitle>
            <DialogDescription>
              This permanently deletes the vault and everything owned by it.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {deletedResources.map(({ label, icon: Icon }) => (
              <div
                key={label}
                className="flex min-h-12 items-center gap-3 rounded-md border bg-muted/20 p-3 text-sm"
              >
                <Icon className="size-4 shrink-0 text-muted-foreground" />
                <span className="font-medium">{label}</span>
              </div>
            ))}
          </div>

          <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4">
            <div className="flex gap-3">
              <AlertTriangle className="mt-0.5 size-5 shrink-0 text-destructive" />
              <div className="space-y-2 text-sm">
                <p className="font-semibold text-destructive">
                  This action is permanent and cannot be undone.
                </p>
                <p>
                  The vault and everything inside it will be permanently deleted. Nothing will be
                  moved to Trash.
                </p>
              </div>
            </div>

            <div className="mt-4 space-y-2">
              <Label htmlFor="delete-vault-confirmation">Type the vault name to confirm</Label>
              <code className="block rounded-md border bg-background px-3 py-2 text-sm font-semibold">
                {vault?.name ?? ''}
              </code>
              <Input
                id="delete-vault-confirmation"
                value={confirmation}
                disabled={isPending}
                autoComplete="off"
                spellCheck={false}
                placeholder="Enter vault name"
                onChange={(event) => setConfirmation(event.target.value)}
              />
              {errorMessage ? <p className="text-sm text-destructive">{errorMessage}</p> : null}
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" disabled={isPending} onClick={onCancel}>
              Cancel
            </Button>
            <Button type="submit" variant="destructive" disabled={!isValid || isPending}>
              {isPending ? 'Deleting...' : 'Delete vault'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function VaultManagementTabs({
  section,
  vault,
  vaultId,
}: {
  section: VaultManagementSection;
  vault: VaultDetail | null;
  vaultId: string;
}) {
  const navigate = useNavigate();
  const canManage = canManageVault(vault);
  const visibleTabs = [
    ...(canManage ? [{ value: 'members' as const, label: 'Members', icon: Users }] : []),
    ...(canManage ? [{ value: 'settings' as const, label: 'Settings', icon: Settings2 }] : []),
    ...(canManage ? [{ value: 'activity' as const, label: 'Activity', icon: History }] : []),
  ];

  if (visibleTabs.length === 0) {
    return null;
  }

  return (
    <Tabs
      value={visibleTabs.some((tab) => tab.value === section) ? section : 'members'}
      onValueChange={(value) => navigate(`/vaults/${vaultId}/${value}`)}
      className="gap-4"
    >
      <TabsList className="w-fit">
        {visibleTabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <TabsTrigger key={tab.value} value={tab.value} className="gap-2">
              <Icon className="size-4" />
              {tab.label}
            </TabsTrigger>
          );
        })}
      </TabsList>
    </Tabs>
  );
}

function MemberAccessFields({
  role,
  disabled,
  idPrefix,
  onRoleChange,
}: {
  idPrefix: string;
  role: VaultRole;
  disabled?: boolean;
  onRoleChange: (role: VaultRole) => void;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={`${idPrefix}-role`}>Vault role</Label>
      <RoleSelect value={role} disabled={disabled} onValueChange={onRoleChange} />
    </div>
  );
}

function VaultInviteDialog({
  open,
  canManageMembers,
  pending,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  canManageMembers: boolean;
  pending: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (input: { mode: 'direct' | 'email'; target: string; role: VaultRole }) => void;
}) {
  const [mode, setMode] = useState<'direct' | 'email'>('direct');
  const [target, setTarget] = useState('');
  const [role, setRole] = useState<VaultRole>('viewer');

  useEffect(() => {
    if (!open) {
      setMode('direct');
      setTarget('');
      setRole('viewer');
    }
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !pending && onOpenChange(nextOpen)}>
      <DialogContent>
        <form
          className="space-y-5"
          onSubmit={(event) => {
            event.preventDefault();
            onSubmit({ mode, target, role });
          }}
        >
          <DialogHeader>
            <DialogTitle>Invite member</DialogTitle>
            <DialogDescription>Invite a new member to this vault.</DialogDescription>
          </DialogHeader>

          <div className="grid overflow-hidden rounded-md border sm:grid-cols-2">
            {[
              { value: 'direct' as const, label: 'Email or user ID' },
              { value: 'email' as const, label: 'Email invitation' },
            ].map((option) => (
              <button
                key={option.value}
                type="button"
                className={cn(
                  'flex min-h-12 items-center justify-center gap-2 border-b-2 px-3 text-sm font-medium',
                  mode === option.value
                    ? 'border-primary bg-primary/10 text-foreground'
                    : 'border-transparent text-muted-foreground',
                )}
                onClick={() => setMode(option.value)}
              >
                <Mail className="size-4" />
                {option.label}
              </button>
            ))}
          </div>

          <div className="space-y-2">
            <Label htmlFor="vault-invite-target">
              {mode === 'email' ? 'Email' : 'Email or user ID'}
            </Label>
            <Input
              id="vault-invite-target"
              type={mode === 'email' ? 'email' : 'text'}
              value={target}
              disabled={!canManageMembers || pending}
              placeholder={
                mode === 'email' ? 'Enter email address' : 'Enter email address or user ID'
              }
              onChange={(event) => setTarget(event.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              {mode === 'email'
                ? 'Owner invitations are queued for admin approval when required.'
                : 'Existing users are added directly; email addresses create invitations.'}
            </p>
          </div>

          <MemberAccessFields
            idPrefix="vault-invite"
            role={role}
            disabled={!canManageMembers || pending}
            onRoleChange={setRole}
          />

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={!canManageMembers || pending}>
              <Send className="size-4" />
              {pending ? 'Sending...' : 'Send invite'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function MemberRemovalDialog({
  pendingAction,
  memberName,
  isPending,
  onCancel,
  onConfirm,
}: {
  pendingAction: { type: 'remove-member' | 'remove-owner-role'; member: VaultMember } | null;
  memberName: string;
  isPending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Dialog
      open={pendingAction !== null}
      onOpenChange={(open) => !open && !isPending && onCancel()}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {pendingAction?.type === 'remove-owner-role'
              ? 'Remove owner role?'
              : 'Remove member from vault?'}
          </DialogTitle>
          <DialogDescription>
            {pendingAction?.type === 'remove-owner-role'
              ? `${memberName} will become a viewer and will no longer manage vault settings or members.`
              : `${memberName} will lose access to this vault.`}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="outline" disabled={isPending} onClick={onCancel}>
            Cancel
          </Button>
          <Button type="button" variant="destructive" disabled={isPending} onClick={onConfirm}>
            {isPending
              ? 'Removing...'
              : pendingAction?.type === 'remove-owner-role'
                ? 'Remove owner role'
                : 'Remove from vault'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function VaultMembersPanel({ vault, vaultId }: { vault: VaultDetail; vaultId: string }) {
  const [members, setMembers] = useState<VaultMember[]>([]);
  const [pendingInvitations, setPendingInvitations] = useState<VaultPendingInvitation[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | undefined>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [memberDrafts, setMemberDrafts] = useState<Record<string, { role: VaultRole }>>({});
  const [pendingMemberAction, setPendingMemberAction] = useState<{
    type: 'remove-member' | 'remove-owner-role';
    member: VaultMember;
  } | null>(null);
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const [rowSelection, setRowSelection] = useState({});
  const [globalFilter, setGlobalFilter] = useState('');

  const canManageMembers = canManageVault(vault);
  const ownerCount = useMemo(
    () => members.filter((member) => member.role === 'owner').length,
    [members],
  );

  const loadMembers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [membersResult, invitationsResult, meResult] = await Promise.all([
        listVaultMembers({ vaultId }),
        listVaultPendingInvitations({ vaultId }),
        getMe().catch(() => null),
      ]);
      setMembers(membersResult.members);
      setPendingInvitations(invitationsResult.invitations);
      setCurrentUserId(meResult?.userId);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load members.');
    } finally {
      setLoading(false);
    }
  }, [vaultId]);

  useEffect(() => {
    void loadMembers();
  }, [loadMembers]);

  function getMemberDraft(member: VaultMember) {
    return memberDrafts[member.userId] ?? { role: member.role };
  }

  function setMemberDraft(member: VaultMember, draft: Partial<{ role: VaultRole }>) {
    setMemberDrafts((current) => ({
      ...current,
      [member.userId]: { ...getMemberDraft(member), ...draft },
    }));
  }

  async function updateMemberAccess(member: VaultMember, draft: Partial<{ role: VaultRole }>) {
    const nextDraft = { ...getMemberDraft(member), ...draft };
    if (member.role === 'owner' && nextDraft.role !== 'owner' && ownerCount <= 1) {
      toast.warning('At least one owner is required.');
      return;
    }

    setMemberDraft(member, draft);
    setPending(true);
    try {
      const result = await updateVaultMember({
        vaultId,
        memberUserId: member.userId,
        role: nextDraft.role,
      });
      toast.success(
        isPermissionRequestResponse(result)
          ? 'Member access request queued for admin approval.'
          : 'Member access updated.',
      );
      await loadMembers();
    } catch (updateError) {
      toast.error(updateError instanceof Error ? updateError.message : 'Could not update member.');
      setMemberDrafts((current) => {
        const next = { ...current };
        delete next[member.userId];
        return next;
      });
    } finally {
      setPending(false);
    }
  }

  async function submitInvite(input: {
    mode: 'direct' | 'email';
    target: string;
    role: VaultRole;
  }) {
    const target = input.target.trim();
    if (!target) {
      toast.warning(
        input.mode === 'email' ? 'Email is required.' : 'Email or user ID is required.',
      );
      return;
    }

    setPending(true);
    try {
      const result =
        input.mode === 'email' || target.includes('@')
          ? await createVaultEmailInvitation({
              vaultId,
              email: target,
              role: input.role,
            })
          : await addVaultMember({
              vaultId,
              userId: target,
              role: input.role,
            });
      toast.success(
        isPermissionRequestResponse(result)
          ? 'Member access request queued for admin approval.'
          : 'invitation' in result
            ? `Invitation created for ${result.invitation.email}.`
            : 'Member added to vault.',
      );
      setInviteOpen(false);
      await loadMembers();
    } catch (inviteError) {
      toast.error(inviteError instanceof Error ? inviteError.message : 'Could not invite member.');
    } finally {
      setPending(false);
    }
  }

  async function confirmPendingMemberAction() {
    if (pendingMemberAction === null) return;
    const { member, type } = pendingMemberAction;
    if (member.role === 'owner' && ownerCount <= 1) {
      toast.warning('At least one owner is required.');
      setPendingMemberAction(null);
      return;
    }

    setPending(true);
    try {
      if (type === 'remove-owner-role') {
        const result = await updateVaultMember({
          vaultId,
          memberUserId: member.userId,
          role: 'viewer',
        });
        toast.success(
          isPermissionRequestResponse(result)
            ? 'Member access request queued for admin approval.'
            : 'Owner role removed.',
        );
      } else {
        await removeVaultMember({ vaultId, memberUserId: member.userId });
        toast.success('Member removed from vault.');
      }
      setPendingMemberAction(null);
      await loadMembers();
    } catch (removeError) {
      toast.error(removeError instanceof Error ? removeError.message : 'Could not update member.');
    } finally {
      setPending(false);
    }
  }

  const memberTableRows = useMemo<VaultMemberTableRow[]>(
    () => [
      ...members.map((member) => ({
        kind: 'member' as const,
        id: `member-${member.userId}`,
        member,
        userId: member.userId,
        email: member.email,
        name: member.name,
        role: member.role,
        status: getMemberStatus(member, currentUserId),
      })),
      ...pendingInvitations.map((invitation) => ({
        kind: 'pending' as const,
        id: `${invitation.source}-${invitation.id}`,
        invitation,
        userId: invitation.targetUserId ?? null,
        email: invitation.email,
        name: invitation.name ?? null,
        role: invitation.role,
        status:
          invitation.status === 'approval_pending'
            ? ('Pending approval' as const)
            : ('Pending acceptance' as const),
      })),
    ],
    [currentUserId, members, pendingInvitations],
  );

  const globalMemberFilter: FilterFn<VaultMemberTableRow> = (row, _columnId, value) => {
    const query = String(value).trim().toLowerCase();
    if (query.length === 0) return true;

    const memberRow = row.original;
    return [
      getMemberRowDisplayName(memberRow),
      memberRow.email,
      formatVaultRole(memberRow.role),
      memberRow.status,
      memberRow.kind === 'pending' ? getPendingRequestLabel(memberRow.invitation) : '',
    ].some((field) => field.toLowerCase().includes(query));
  };

  const columns: ColumnDef<VaultMemberTableRow>[] = [
    {
      id: 'select',
      header: ({ table }) => (
        <div className="flex items-center justify-center px-2">
          <Checkbox
            checked={
              table.getIsAllPageRowsSelected() ||
              (table.getIsSomePageRowsSelected() && 'indeterminate')
            }
            onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
            aria-label="Select all"
          />
        </div>
      ),
      cell: ({ row }) => (
        <div className="flex items-center justify-center px-2">
          <Checkbox
            checked={row.getIsSelected()}
            disabled={!row.getCanSelect()}
            onCheckedChange={(value) => row.toggleSelected(!!value)}
            aria-label="Select row"
          />
        </div>
      ),
      enableSorting: false,
      enableHiding: false,
      size: 50,
    },
    {
      accessorFn: getMemberRowDisplayName,
      id: 'member',
      header: 'Member',
      cell: ({ row }) => {
        const memberRow = row.original;
        return (
          <div className="flex items-center gap-3">
            <Avatar className="h-8 w-8">
              <AvatarFallback className="text-xs font-medium">
                {getMemberRowInitials(memberRow)}
              </AvatarFallback>
            </Avatar>
            <div className="flex min-w-0 flex-col">
              <span className="truncate font-medium">{getMemberRowDisplayName(memberRow)}</span>
              {memberRow.email ? (
                <span className="truncate text-sm text-muted-foreground">{memberRow.email}</span>
              ) : null}
            </div>
          </div>
        );
      },
    },
    {
      accessorFn: (memberRow) => formatVaultRole(memberRow.role),
      id: 'role',
      header: 'Vault role',
      cell: ({ row }) => {
        const role = row.getValue('role') as string;
        return (
          <Badge variant="secondary" className={getRoleColor(role)}>
            {role}
          </Badge>
        );
      },
      filterFn: exactMemberFilter,
    },
    {
      accessorFn: (memberRow) => memberRow.status,
      id: 'status',
      header: 'Status',
      cell: ({ row }) => {
        const status = row.getValue('status') as string;
        return (
          <Badge variant="secondary" className={getStatusColor(status)}>
            {status}
          </Badge>
        );
      },
      filterFn: exactMemberFilter,
    },
    {
      id: 'actions',
      header: 'Actions',
      cell: ({ row }) => {
        const memberRow = row.original;
        if (memberRow.kind === 'pending') {
          return (
            <div className="flex justify-end">
              <Badge variant="outline">{getPendingRequestLabel(memberRow.invitation)}</Badge>
            </div>
          );
        }

        const member = memberRow.member;
        const disabled = pending || !canManageMembers;
        const isCurrentUser = currentUserId === member.userId;
        const canRemoveOrDemoteOwner = member.role !== 'owner' || ownerCount > 1;
        const canChangeRoleTo = (role: VaultRole) =>
          member.role !== role && !(member.role === 'owner' && role !== 'owner' && ownerCount <= 1);

        return (
          <div className="flex items-center justify-end gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 cursor-pointer"
                  disabled={pending}
                >
                  <EllipsisVertical className="size-4" />
                  <span className="sr-only">Member actions for {member.email}</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>Vault role</DropdownMenuLabel>
                {roleOptions.map((option) => (
                  <DropdownMenuItem
                    key={option.value}
                    className="cursor-pointer"
                    disabled={disabled || !canChangeRoleTo(option.value)}
                    onSelect={() => void updateMemberAccess(member, { role: option.value })}
                  >
                    {option.value === 'owner' ? (
                      <Crown className="mr-2 size-4" />
                    ) : (
                      <UserCog className="mr-2 size-4" />
                    )}
                    Set {option.label}
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                {member.role === 'owner' ? (
                  <DropdownMenuItem
                    variant="destructive"
                    className="cursor-pointer"
                    disabled={disabled || isCurrentUser || !canRemoveOrDemoteOwner}
                    onSelect={() => setPendingMemberAction({ type: 'remove-owner-role', member })}
                  >
                    <Crown className="mr-2 size-4" />
                    Remove owner role
                  </DropdownMenuItem>
                ) : null}
                <DropdownMenuItem
                  variant="destructive"
                  className="cursor-pointer"
                  disabled={disabled || isCurrentUser || !canRemoveOrDemoteOwner}
                  onSelect={() => setPendingMemberAction({ type: 'remove-member', member })}
                >
                  <UserMinus className="mr-2 size-4" />
                  Remove from vault
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        );
      },
      enableSorting: false,
      enableHiding: false,
    },
  ];

  const table = useReactTable({
    data: memberTableRows,
    columns,
    getRowId: (row) => row.id,
    enableRowSelection: (row) => row.original.kind === 'member',
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    onColumnVisibilityChange: setColumnVisibility,
    onRowSelectionChange: setRowSelection,
    onGlobalFilterChange: setGlobalFilter,
    globalFilterFn: globalMemberFilter,
    state: {
      sorting,
      columnFilters,
      columnVisibility,
      rowSelection,
      globalFilter,
    },
  });

  const roleFilter = table.getColumn('role')?.getFilterValue() as string;
  const statusFilter = table.getColumn('status')?.getFilterValue() as string;
  const columnLabel = (id: string): ReactNode => {
    const labels: Record<string, string> = {
      member: 'Member',
      role: 'Vault role',
      status: 'Status',
    };
    return labels[id] ?? id;
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">Members</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage who has access to this vault and their permissions.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { title: 'Total members', current: members.length.toLocaleString(), icon: Users },
          { title: 'Owners', current: ownerCount.toLocaleString(), icon: ShieldCheck },
          {
            title: 'Editors',
            current: members.filter((member) => member.role === 'editor').length.toLocaleString(),
            icon: UserCog,
          },
          {
            title: 'Viewers',
            current: members.filter((member) => member.role === 'viewer').length.toLocaleString(),
            icon: Eye,
          },
        ].map((metric) => {
          const Icon = metric.icon;

          return (
            <Card key={metric.title} className="border">
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <Icon className="size-6 text-muted-foreground" />
                </div>
                <div className="space-y-2">
                  <p className="flex items-baseline gap-2 text-sm font-medium text-muted-foreground">
                    <span>{metric.title}:</span>
                    <span className="text-2xl font-bold text-foreground">{metric.current}</span>
                  </p>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="w-full space-y-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-1 items-center space-x-2">
            <div className="relative max-w-sm flex-1">
              <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search members..."
                value={globalFilter ?? ''}
                onChange={(event) => setGlobalFilter(String(event.target.value))}
                className="pl-9"
              />
            </div>
            <Button
              variant="outline"
              size="icon"
              aria-label="Refresh members"
              disabled={loading}
              onClick={() => void loadMembers()}
            >
              <RefreshCw className={loading ? 'size-4 animate-spin' : 'size-4'} />
            </Button>
          </div>
          <div className="flex items-center space-x-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild id="member-column-visibility">
                <Button variant="outline" className="cursor-pointer">
                  Columns <ChevronDown className="ml-2 size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {table
                  .getAllColumns()
                  .filter((column) => column.getCanHide())
                  .map((column) => (
                    <DropdownMenuCheckboxItem
                      key={column.id}
                      checked={column.getIsVisible()}
                      onCheckedChange={(value) => column.toggleVisibility(!!value)}
                    >
                      {columnLabel(column.id)}
                    </DropdownMenuCheckboxItem>
                  ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <Button
              type="button"
              className="cursor-pointer"
              disabled={!canManageMembers || pending}
              onClick={() => setInviteOpen(true)}
            >
              <UserRoundPlus className="mr-2 size-4" />
              Invite member
            </Button>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="member-role-filter" className="text-sm font-medium">
              Vault role
            </Label>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  asChild
                  variant="outline"
                  className="h-10 w-full justify-between px-3 font-normal"
                >
                  <div id="member-role-filter">
                    <span className="flex min-w-0 items-center gap-2">
                      <UserCog className="size-4 shrink-0 text-muted-foreground" />
                      <span className="truncate">{roleFilter || 'Any role'}</span>
                    </span>
                    <span className="ml-2 flex shrink-0 items-center gap-1">
                      {roleFilter ? (
                        <button
                          type="button"
                          aria-label="Clear vault role filter"
                          className="rounded-sm p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                          onPointerDown={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            table.getColumn('role')?.setFilterValue(undefined);
                          }}
                          onClick={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            table.getColumn('role')?.setFilterValue(undefined);
                          }}
                        >
                          <X className="size-3.5" />
                        </button>
                      ) : null}
                      <ChevronDown className="size-4 text-muted-foreground" />
                    </span>
                  </div>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="start"
                sideOffset={6}
                className="w-[var(--radix-dropdown-menu-trigger-width)] rounded-md p-2 shadow-lg"
              >
                <DropdownMenuLabel className="px-2 pb-2 pt-1 text-sm font-medium">
                  Vault role
                </DropdownMenuLabel>
                <DropdownMenuRadioGroup
                  value={roleFilter || ''}
                  onValueChange={(value) =>
                    table.getColumn('role')?.setFilterValue(value || undefined)
                  }
                >
                  {['Owner', 'Editor', 'Viewer'].map((role) => (
                    <DropdownMenuRadioItem key={role} value={role} className="cursor-pointer py-2">
                      {role}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <div className="space-y-2">
            <Label htmlFor="member-status-filter" className="text-sm font-medium">
              Status
            </Label>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  asChild
                  variant="outline"
                  className="h-10 w-full justify-between px-3 font-normal"
                >
                  <div id="member-status-filter">
                    <span className="flex min-w-0 items-center gap-2">
                      <span
                        className={
                          statusFilter === 'Current user'
                            ? 'size-2.5 shrink-0 rounded-full bg-primary'
                            : statusFilter === 'Member'
                              ? 'size-2.5 shrink-0 rounded-full bg-muted-foreground'
                              : statusFilter === 'Pending approval'
                                ? 'size-2.5 shrink-0 rounded-full bg-amber-500'
                                : statusFilter === 'Pending acceptance'
                                  ? 'size-2.5 shrink-0 rounded-full bg-blue-500'
                                  : 'size-2.5 shrink-0 rounded-full border border-muted-foreground/50'
                        }
                      />
                      <span className="truncate">{statusFilter || 'Any status'}</span>
                    </span>
                    <span className="ml-2 flex shrink-0 items-center gap-1">
                      {statusFilter ? (
                        <button
                          type="button"
                          aria-label="Clear status filter"
                          className="rounded-sm p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                          onPointerDown={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            table.getColumn('status')?.setFilterValue(undefined);
                          }}
                          onClick={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            table.getColumn('status')?.setFilterValue(undefined);
                          }}
                        >
                          <X className="size-3.5" />
                        </button>
                      ) : null}
                      <ChevronDown className="size-4 text-muted-foreground" />
                    </span>
                  </div>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="start"
                sideOffset={6}
                className="w-[var(--radix-dropdown-menu-trigger-width)] rounded-md p-2 shadow-lg"
              >
                <DropdownMenuLabel className="px-2 pb-2 pt-1 text-sm font-medium">
                  Status
                </DropdownMenuLabel>
                <DropdownMenuRadioGroup
                  value={statusFilter || ''}
                  onValueChange={(value) =>
                    table.getColumn('status')?.setFilterValue(value || undefined)
                  }
                >
                  <DropdownMenuRadioItem value="Current user" className="cursor-pointer py-2">
                    Current user
                  </DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="Member" className="cursor-pointer py-2">
                    Member
                  </DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="Pending approval" className="cursor-pointer py-2">
                    Pending approval
                  </DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="Pending acceptance" className="cursor-pointer py-2">
                    Pending acceptance
                  </DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {error ? (
          <div className="flex items-center justify-between gap-3 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            <span>{error}</span>
            <Button type="button" variant="outline" size="sm" onClick={() => void loadMembers()}>
              Retry
            </Button>
          </div>
        ) : null}

        <div className="rounded-md border">
          <Table>
            <TableHeader>
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <TableHead key={header.id}>
                      {header.isPlaceholder
                        ? null
                        : flexRender(header.column.columnDef.header, header.getContext())}
                    </TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell
                    colSpan={table.getVisibleFlatColumns().length}
                    className="h-24 text-center"
                  >
                    Loading members...
                  </TableCell>
                </TableRow>
              ) : table.getRowModel().rows?.length ? (
                table.getRowModel().rows.map((row) => (
                  <TableRow key={row.id} data-state={row.getIsSelected() && 'selected'}>
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id}>
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell
                    colSpan={table.getVisibleFlatColumns().length}
                    className="h-24 text-center"
                  >
                    No results.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        <div className="flex items-center justify-between space-x-2 py-4">
          <div className="flex items-center space-x-2">
            <Label htmlFor="member-page-size" className="text-sm font-medium">
              Show
            </Label>
            <Select
              value={`${table.getState().pagination.pageSize}`}
              onValueChange={(value) => {
                table.setPageSize(Number(value));
              }}
            >
              <SelectTrigger className="w-20 cursor-pointer" id="member-page-size">
                <SelectValue placeholder={table.getState().pagination.pageSize} />
              </SelectTrigger>
              <SelectContent side="top">
                {[10, 20, 30, 40, 50].map((pageSize) => (
                  <SelectItem key={pageSize} value={`${pageSize}`}>
                    {pageSize}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="hidden flex-1 text-sm text-muted-foreground sm:block">
            {table.getFilteredSelectedRowModel().rows.length} of{' '}
            {table.getFilteredRowModel().rows.length} row(s) selected.
          </div>
          <div className="flex items-center space-x-6 lg:space-x-8">
            <div className="hidden items-center space-x-2 sm:flex">
              <p className="text-sm font-medium">Page</p>
              <strong className="text-sm">
                {table.getPageCount() === 0 ? 0 : table.getState().pagination.pageIndex + 1} of{' '}
                {table.getPageCount()}
              </strong>
            </div>
            <div className="flex items-center space-x-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => table.previousPage()}
                disabled={!table.getCanPreviousPage()}
                className="cursor-pointer"
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => table.nextPage()}
                disabled={!table.getCanNextPage()}
                className="cursor-pointer"
              >
                Next
              </Button>
            </div>
          </div>
        </div>

        <div className="flex gap-2 rounded-md border bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
          <ShieldCheck className="size-4 shrink-0" />
          Owners can manage vault settings and members. At least one owner is required.
        </div>
      </div>

      <VaultInviteDialog
        open={inviteOpen}
        canManageMembers={canManageMembers}
        pending={pending}
        onOpenChange={setInviteOpen}
        onSubmit={(input) => void submitInvite(input)}
      />
      <MemberRemovalDialog
        pendingAction={pendingMemberAction}
        memberName={
          pendingMemberAction ? getMemberDisplayName(pendingMemberAction.member) : 'this member'
        }
        isPending={pending}
        onCancel={() => setPendingMemberAction(null)}
        onConfirm={() => void confirmPendingMemberAction()}
      />
    </div>
  );
}

function VaultSettingsPanel({
  vault,
  vaultId,
  onVaultUpdated,
}: {
  vault: VaultDetail;
  vaultId: string;
  onVaultUpdated: (vault: VaultDetail) => void;
}) {
  const navigate = useNavigate();
  const [name, setName] = useState(vault.name);
  const [description, setDescription] = useState(vault.description ?? '');
  const [pending, setPending] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const canManage = canManageVault(vault);

  useEffect(() => {
    setName(vault.name);
    setDescription(vault.description ?? '');
  }, [vault.id, vault.name, vault.description]);

  async function handleRename(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    try {
      const result = await renameVault({
        vaultId,
        name: name.trim() || vault.name,
        description: description.trim() || null,
      });
      onVaultUpdated(result.vault);
      toast.success('Vault details updated.');
    } catch (renameError) {
      toast.error(
        renameError instanceof Error ? renameError.message : 'Could not update vault details.',
      );
    } finally {
      setPending(false);
    }
  }

  async function handleDelete() {
    setPending(true);
    setDeleteError(null);
    try {
      const result = await deleteVault({ vaultId });
      if (isPermissionRequestResponse(result)) {
        toast.success('Vault deletion request queued for admin approval.');
        setDeleteOpen(false);
        return;
      }

      toast.success('Vault deleted.');
      navigate('/vaults', { replace: true });
    } catch (deleteRequestError) {
      setDeleteError(
        deleteRequestError instanceof Error
          ? deleteRequestError.message
          : 'Could not delete vault.',
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">Settings</h2>
        <p className="mt-1 text-sm text-muted-foreground">Manage your vault settings.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>General</CardTitle>
          <CardDescription>Update the basic information about this vault.</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_auto] lg:items-end"
            onSubmit={handleRename}
          >
            <div className="space-y-2">
              <Label htmlFor="vault-settings-name">Vault name</Label>
              <Input
                id="vault-settings-name"
                value={name}
                disabled={!canManage || pending}
                onChange={(event) => setName(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="vault-settings-description">Description</Label>
              <Textarea
                id="vault-settings-description"
                value={description}
                disabled={!canManage || pending}
                placeholder="What belongs in this vault?"
                onChange={(event) => setDescription(event.target.value)}
              />
            </div>
            <Button type="submit" disabled={!canManage || pending}>
              {pending ? 'Saving...' : 'Save changes'}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card className="border-destructive/40 bg-destructive/5">
        <CardHeader>
          <CardTitle className="text-destructive">Danger zone</CardTitle>
          <CardDescription>These actions cannot be undone.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">
            Delete this vault permanently and remove all data.
          </p>
          <Button
            type="button"
            variant="destructive"
            disabled={!canManage || pending}
            onClick={() => {
              setDeleteError(null);
              setDeleteOpen(true);
            }}
          >
            Delete vault
          </Button>
        </CardContent>
      </Card>

      <VaultDeleteConfirmDialog
        open={deleteOpen}
        vault={vault}
        isPending={pending}
        errorMessage={deleteError}
        onCancel={() => {
          setDeleteOpen(false);
          setDeleteError(null);
        }}
        onConfirm={() => void handleDelete()}
      />
    </div>
  );
}

function VaultActivityPanel({ vaultId }: { vaultId: string }) {
  const [auditState, setAuditState] = useState<{
    data: PaginatedAuditLogResponse | null;
    isLoading: boolean;
    error: Error | null;
  }>({ data: null, isLoading: true, error: null });
  const [filters, setFilters] = useState<AuditLogFilters>({});
  const [selectedEvent, setSelectedEvent] = useState<AuditLogItem | null>(null);
  const [isFetchingNextPage, setIsFetchingNextPage] = useState(false);

  const events = useMemo(() => auditState.data?.events ?? [], [auditState.data?.events]);
  const nextCursor = auditState.data?.nextCursor ?? null;
  const selectedEventTypes = getSelectedEventTypes(filters);
  const activeActivityCategory = useMemo(() => {
    if (selectedEventTypes.length === 0) {
      if (filters.eventCategory === 'document') return 'files';
      if (filters.eventCategory === 'vault') return 'vaults';
      if (filters.eventCategory === 'auth') return 'users';
      if (filters.eventCategory === 'system') return 'system';
      return 'all';
    }

    if (
      selectedEventTypes.length === aiEventTypes.length &&
      aiEventTypes.every((value) => selectedEventTypes.includes(value))
    ) {
      return 'ai';
    }

    if (
      selectedEventTypes.length === securityEventTypes.length &&
      securityEventTypes.every((value) => selectedEventTypes.includes(value))
    ) {
      return 'security';
    }

    return 'all';
  }, [filters.eventCategory, selectedEventTypes]);

  const loadAuditEvents = useCallback(
    async ({
      append = false,
      cursor = null,
    }: {
      append?: boolean;
      cursor?: string | null;
    } = {}) => {
      if (append) {
        setIsFetchingNextPage(true);
      } else {
        setAuditState((current) => ({ data: current.data, isLoading: true, error: null }));
      }

      try {
        const result = await getVaultAuditEvents({ vaultId, filters, cursor });
        setAuditState((current) => ({
          data:
            append && current.data
              ? {
                  events: [...current.data.events, ...result.events],
                  nextCursor: result.nextCursor,
                }
              : result,
          isLoading: false,
          error: null,
        }));
      } catch (error) {
        setAuditState((current) => ({
          data: append ? current.data : null,
          isLoading: false,
          error: error instanceof Error ? error : new Error('Unable to load audit log.'),
        }));
      } finally {
        setIsFetchingNextPage(false);
      }
    },
    [filters, vaultId],
  );

  useEffect(() => {
    void loadAuditEvents();
  }, [loadAuditEvents]);

  function setFilter(key: keyof AuditLogFilters, value: string) {
    setFilters((current) => ({
      ...current,
      [key]: value.length > 0 ? value : undefined,
    }));
  }

  function setDateFilter(key: 'dateFrom' | 'dateTo', value: string) {
    setFilters((current) => {
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
    setFilters((current) => ({
      ...current,
      eventCategory: values.length > 0 ? undefined : current.eventCategory,
      eventType: values.length > 0 ? values : undefined,
    }));
  }

  function setActivityCategory(value: (typeof activityCategoryOptions)[number]['value']) {
    setFilters((current) => {
      const next: AuditLogFilters = {
        ...current,
        eventCategory: undefined,
        eventType: undefined,
      };

      switch (value) {
        case 'files':
          next.eventCategory = 'document';
          break;
        case 'vaults':
          next.eventCategory = 'vault';
          break;
        case 'users':
          next.eventCategory = 'auth';
          break;
        case 'security':
          next.eventType = securityEventTypes;
          break;
        case 'ai':
          next.eventType = aiEventTypes;
          break;
        case 'system':
          next.eventCategory = 'system';
          break;
        default:
          break;
      }

      return next;
    });
  }

  return (
    <div className="@container/main w-full space-y-4">
      <div className="flex flex-wrap gap-2">
        {activityCategoryOptions.map((option) => {
          const Icon = option.icon;
          const active = activeActivityCategory === option.value;

          return (
            <Button
              key={option.value}
              type="button"
              variant={active ? 'secondary' : 'outline'}
              size="sm"
              className="h-9 cursor-pointer gap-2"
              onClick={() => setActivityCategory(option.value)}
            >
              <Icon className="size-4" />
              {option.label}
            </Button>
          );
        })}
      </div>

      <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-4">
        <div className="space-y-2">
          <Label>Event type</Label>
          <EventTypeMultiSelectFilter
            label="event type"
            triggerLabel={getEventTypeFilterLabel(selectedEventTypes)}
            groups={auditEventFilterGroups}
            selectedValues={selectedEventTypes}
            onValueChange={setEventTypeFilter}
            onClear={() => setEventTypeFilter([])}
          />
        </div>

        <div className="space-y-2">
          <Label>Importance</Label>
          <FilterDropdown
            label="importance"
            value={
              auditSeverityOptions.find((option) => option.value === (filters.severity ?? 'all'))
                ?.label ?? 'All severities'
            }
            active={Boolean(filters.severity)}
            onClear={() => setFilter('severity', '')}
            icon={<ShieldAlert className="size-4 shrink-0 text-muted-foreground" />}
          >
            <DropdownMenuContent
              align="start"
              sideOffset={6}
              className="w-[var(--radix-dropdown-menu-trigger-width)] rounded-md p-2 shadow-lg"
            >
              <DropdownMenuLabel className="px-2 pb-2 pt-1 text-sm font-medium">
                Importance
              </DropdownMenuLabel>
              <DropdownMenuRadioGroup
                value={filters.severity ?? 'all'}
                onValueChange={(value) => setFilter('severity', value === 'all' ? '' : value)}
              >
                {auditSeverityOptions.map((option) => (
                  <DropdownMenuRadioItem
                    key={option.value}
                    value={option.value}
                    className="cursor-pointer py-2"
                  >
                    {option.label}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </FilterDropdown>
        </div>

        <div className="space-y-2">
          <Label>Outcome</Label>
          <FilterDropdown
            label="outcome"
            value={
              auditOutcomeOptions.find((option) => option.value === (filters.outcome ?? 'all'))
                ?.label ?? 'All outcomes'
            }
            active={Boolean(filters.outcome)}
            onClear={() => setFilter('outcome', '')}
          >
            <DropdownMenuContent
              align="start"
              sideOffset={6}
              className="w-[var(--radix-dropdown-menu-trigger-width)] rounded-md p-2 shadow-lg"
            >
              <DropdownMenuLabel className="px-2 pb-2 pt-1 text-sm font-medium">
                Outcome
              </DropdownMenuLabel>
              <DropdownMenuRadioGroup
                value={filters.outcome ?? 'all'}
                onValueChange={(value) => setFilter('outcome', value === 'all' ? '' : value)}
              >
                {auditOutcomeOptions.map((option) => (
                  <DropdownMenuRadioItem
                    key={option.value}
                    value={option.value}
                    className="cursor-pointer py-2"
                  >
                    {option.label}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </FilterDropdown>
        </div>

        <div className="space-y-2">
          <Label htmlFor="vault-audit-from">From</Label>
          <DatePicker
            id="vault-audit-from"
            value={filters.dateFrom ?? ''}
            max={filters.dateTo}
            placeholder="From date"
            ariaLabel="Vault audit log from date"
            onChange={(value) => setDateFilter('dateFrom', value)}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="vault-audit-to">To</Label>
          <DatePicker
            id="vault-audit-to"
            value={filters.dateTo ?? ''}
            min={filters.dateFrom}
            placeholder="To date"
            ariaLabel="Vault audit log to date"
            onChange={(value) => setDateFilter('dateTo', value)}
          />
        </div>

        <div className="flex items-end">
          <Button
            type="button"
            variant="outline"
            className="h-10 w-full cursor-pointer gap-2"
            disabled={auditState.isLoading}
            onClick={() => void loadAuditEvents()}
          >
            <RefreshCw className={auditState.isLoading ? 'size-4 animate-spin' : 'size-4'} />
            Refresh
          </Button>
        </div>
      </div>

      {auditState.error ? (
        <div className="flex items-center justify-between gap-3 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          <span>{getErrorMessage(auditState.error, 'Unable to load audit log.')}</span>
          <Button type="button" variant="outline" size="sm" onClick={() => void loadAuditEvents()}>
            Retry
          </Button>
        </div>
      ) : null}

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Event</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Importance</TableHead>
              <TableHead>Occurred</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {auditState.isLoading ? (
              <TableRow>
                <TableCell colSpan={4} className="h-24 text-center">
                  Loading audit log...
                </TableCell>
              </TableRow>
            ) : events.length > 0 ? (
              events.map((event) => {
                const display = getAuditActivityDisplay(event);
                const EventIcon = getEventIcon(event, display.category);

                return (
                  <TableRow
                    key={event.id}
                    role="button"
                    tabIndex={0}
                    className="cursor-pointer"
                    onClick={() => setSelectedEvent(event)}
                    onKeyDown={(keyboardEvent) => {
                      if (keyboardEvent.key === 'Enter' || keyboardEvent.key === ' ') {
                        keyboardEvent.preventDefault();
                        setSelectedEvent(event);
                      }
                    }}
                  >
                    <TableCell className="min-w-[360px]">
                      <div className="flex min-w-0 items-start gap-3">
                        <div
                          className={`mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-md ring-1 ${getIconToneClassName(display.importance)}`}
                        >
                          <EventIcon className="size-4" />
                        </div>
                        <div className="flex min-w-0 flex-col gap-1">
                          <span className="truncate font-medium">
                            <span className="font-semibold">{display.actor}</span>{' '}
                            <span>{display.action}</span>
                          </span>
                          {display.subject ? (
                            <span className="truncate text-sm text-muted-foreground">
                              {display.subject}
                            </span>
                          ) : null}
                          {display.detail ? (
                            <span className="truncate text-xs text-muted-foreground">
                              {display.detail}
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{display.categoryLabel}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={getImportanceClassName(display.importance)}
                      >
                        {getImportanceLabel(display.importance)}
                      </Badge>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                      {formatAuditTimestamp(event.occurredAt)}
                    </TableCell>
                  </TableRow>
                );
              })
            ) : (
              <TableRow>
                <TableCell colSpan={4} className="h-24 text-center">
                  No audit events match these filters.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex flex-col gap-3 py-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-sm text-muted-foreground">
          {events.length} audit event{events.length === 1 ? '' : 's'} loaded.
        </div>
        <Button
          type="button"
          variant="outline"
          className="cursor-pointer"
          disabled={!nextCursor || isFetchingNextPage}
          onClick={() => void loadAuditEvents({ append: true, cursor: nextCursor })}
        >
          {isFetchingNextPage ? 'Loading...' : nextCursor ? 'Load more' : 'No more events'}
        </Button>
      </div>

      <AuditDetailsDialog event={selectedEvent} onClose={() => setSelectedEvent(null)} />
    </div>
  );
}

export default function VaultManagementPage({ section }: { section: VaultManagementSection }) {
  const navigate = useNavigate();
  const { vaultId = '' } = useParams();
  const [vault, setVault] = useState<VaultDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadVault = useCallback(async () => {
    if (!vaultId) return;
    setLoading(true);
    setError(null);
    try {
      const result = await getVault({ vaultId });
      setVault(result.vault);
    } catch (vaultError) {
      setError(vaultError instanceof Error ? vaultError.message : 'Unable to load vault.');
    } finally {
      setLoading(false);
    }
  }, [vaultId]);

  useEffect(() => {
    void loadVault();
  }, [loadVault]);

  const canManage = canManageVault(vault);
  const title = vault?.name ? `${vault.name} ${section}` : `Vault ${section}`;

  return (
    <BaseLayout>
      <div className="space-y-6 px-4 lg:px-6">
        <div className="space-y-3 border-b pb-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
            <Button
              type="button"
              variant="outline"
              className="w-fit"
              onClick={() => navigate(`/vaults/${vaultId}`)}
            >
              Back to vault
            </Button>
          </div>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            {vault ? (
              <p className="text-sm text-muted-foreground">
                {formatVaultRole(vault.role, vault.isAdmin)}
              </p>
            ) : (
              <div />
            )}
            <VaultManagementTabs section={section} vault={vault} vaultId={vaultId} />
          </div>
        </div>

        {loading ? (
          <div className="flex h-48 items-center justify-center gap-2 rounded-lg border bg-muted/20 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Loading vault...
          </div>
        ) : error ? (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
            {error}
          </div>
        ) : !vault ? (
          <div className="rounded-lg border bg-muted/20 p-4 text-sm text-muted-foreground">
            Vault not found.
          </div>
        ) : !canManage ? (
          <Card>
            <CardHeader>
              <CardTitle>Vault management is restricted</CardTitle>
              <CardDescription>
                Only vault owners and platform admins can view members, settings, and activity logs.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button
                type="button"
                variant="outline"
                onClick={() => navigate(`/vaults/${vaultId}`)}
              >
                Back to vault
              </Button>
            </CardContent>
          </Card>
        ) : section === 'members' ? (
          <VaultMembersPanel vault={vault} vaultId={vaultId} />
        ) : section === 'settings' ? (
          <VaultSettingsPanel vault={vault} vaultId={vaultId} onVaultUpdated={setVault} />
        ) : (
          <VaultActivityPanel vaultId={vaultId} />
        )}
      </div>
    </BaseLayout>
  );
}

'use client';

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  Archive,
  ChevronDown,
  ChevronsUpDown,
  Download,
  Eye,
  FileText,
  Lock,
  Mail,
  MessageSquare,
  RefreshCw,
  Settings,
  Search,
  ShieldAlert,
  Sparkles,
  Trash2,
  Upload,
  UserCog,
  Users,
  X,
} from 'lucide-react';

import { BaseLayout } from '@/components/layouts/base-layout';
import { DatePicker } from '@/components/date-picker';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { getMe } from '../ai-settings/ai-settings.api';
import { listVaults, type VaultSummary } from '@/app/vaults/vaults.api';
import {
  getAdminAuditEvents,
  type AuditLogFilters,
  type AuditLogItem,
  type PaginatedAuditLogResponse,
} from './audit-log.api';
import {
  formatAuditAdvancedEntries,
  formatAuditTimestamp,
  getAuditActivityDisplay,
  type AuditActivityCategory,
} from './audit-log-formatters';

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

const emptyAuditState: AsyncState<PaginatedAuditLogResponse> = {
  data: null,
  isLoading: true,
  error: null,
};

const emptyVaultsState: AsyncState<{ vaults: VaultSummary[] }> = {
  data: null,
  isLoading: false,
  error: null,
};

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

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function getSelectedEventTypes(filters: AuditLogFilters) {
  if (Array.isArray(filters.eventType)) return filters.eventType;
  return filters.eventType ? [filters.eventType] : [];
}

function getSelectedVaultIds(filters: AuditLogFilters) {
  if (Array.isArray(filters.vaultId)) return filters.vaultId;
  return filters.vaultId ? [filters.vaultId] : [];
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

function getSelectedVaultsLabel({
  selectedVaultIds,
  vaults,
  isLoading,
}: {
  selectedVaultIds: string[];
  vaults: VaultSummary[];
  isLoading: boolean;
}) {
  if (selectedVaultIds.length === 0) return isLoading ? 'Loading vaults...' : 'All vaults';

  const selectedVaults = selectedVaultIds
    .map((vaultId) => vaults.find((vault) => vault.id === vaultId))
    .filter((vault): vault is VaultSummary => vault !== undefined);

  if (selectedVaults.length !== selectedVaultIds.length) {
    return selectedVaultIds.length === 1 ? 'Selected vault' : `${selectedVaultIds.length} vaults`;
  }

  if (selectedVaults.length <= 2) {
    return selectedVaults.map((vault) => vault.name).join(', ');
  }

  return `${selectedVaults[0]?.name}, ${selectedVaults[1]?.name} +${selectedVaults.length - 2}`;
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

function VaultMultiSelectFilter({
  label,
  triggerLabel,
  options,
  selectedValues,
  isLoading,
  hasError,
  onValueChange,
  onClear,
}: {
  label: string;
  triggerLabel: string;
  options: Array<{ value: string; label: string }>;
  selectedValues: string[];
  isLoading: boolean;
  hasError: boolean;
  onValueChange: (values: string[]) => void;
  onClear: () => void;
}) {
  const [query, setQuery] = useState('');
  const selectedSet = useMemo(() => new Set(selectedValues), [selectedValues]);
  const filteredOptions = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (normalizedQuery.length === 0) return options;
    return options.filter((option) => option.label.toLowerCase().includes(normalizedQuery));
  }, [options, query]);

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
            <Archive className="size-4 shrink-0 text-muted-foreground" />
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
          {isLoading ? (
            <div className="px-2 py-6 text-center text-sm text-muted-foreground">Loading...</div>
          ) : hasError ? (
            <div className="px-2 py-6 text-center text-sm text-muted-foreground">
              Unable to load vaults.
            </div>
          ) : filteredOptions.length === 0 ? (
            <div className="px-2 py-6 text-center text-sm text-muted-foreground">
              No vaults found.
            </div>
          ) : (
            filteredOptions.map((option) => {
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
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
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

export default function AdminAuditLogPage() {
  const [meState, setMeState] = useState<AsyncState<{ isAdmin: boolean }>>(emptyMeState);
  const [auditState, setAuditState] =
    useState<AsyncState<PaginatedAuditLogResponse>>(emptyAuditState);
  const [vaultsState, setVaultsState] =
    useState<AsyncState<{ vaults: VaultSummary[] }>>(emptyVaultsState);
  const [filters, setFilters] = useState<AuditLogFilters>({});
  const [selectedEvent, setSelectedEvent] = useState<AuditLogItem | null>(null);
  const [isFetchingNextPage, setIsFetchingNextPage] = useState(false);

  const isAdmin = meState.data?.isAdmin === true;
  const events = useMemo(() => auditState.data?.events ?? [], [auditState.data?.events]);
  const nextCursor = auditState.data?.nextCursor ?? null;
  const selectedEventTypes = getSelectedEventTypes(filters);
  const selectedVaultIds = getSelectedVaultIds(filters);
  const vaults = useMemo(() => vaultsState.data?.vaults ?? [], [vaultsState.data?.vaults]);
  const selectedVaultLabel = getSelectedVaultsLabel({
    selectedVaultIds,
    vaults,
    isLoading: vaultsState.isLoading,
  });
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
        const result = await getAdminAuditEvents({ filters, cursor });
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
    [filters],
  );

  const loadVaults = useCallback(async () => {
    setVaultsState((current) => ({ data: current.data, isLoading: true, error: null }));

    try {
      const result = await listVaults();
      setVaultsState({ data: result, isLoading: false, error: null });
    } catch (error) {
      setVaultsState({
        data: null,
        isLoading: false,
        error: error instanceof Error ? error : new Error('Unable to load vaults.'),
      });
    }
  }, []);

  useEffect(() => {
    void loadMe();
  }, [loadMe]);

  useEffect(() => {
    if (isAdmin) {
      void loadAuditEvents();
    }
  }, [isAdmin, loadAuditEvents]);

  useEffect(() => {
    if (isAdmin) {
      void loadVaults();
    }
  }, [isAdmin, loadVaults]);

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

  function setVaultFilter(values: string[]) {
    setFilters((current) => ({
      ...current,
      vaultId: values.length > 0 ? values : undefined,
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

  if (meState.isLoading) {
    return (
      <BaseLayout
        title="Audit log"
        description="Security, compliance, permission, and administrative events."
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
        title="Audit log"
        description="Security, compliance, permission, and administrative events."
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
        title="Audit log"
        description="Security, compliance, permission, and administrative events."
      >
        <div className="px-4 lg:px-6">
          <Card>
            <CardHeader>
              <CardTitle>Platform administrator required</CardTitle>
              <CardDescription>
                Only platform administrators can view the audit log.
              </CardDescription>
            </CardHeader>
          </Card>
        </div>
      </BaseLayout>
    );
  }

  return (
    <BaseLayout
      title="Audit log"
      description="Security, compliance, permission, and administrative events."
    >
      <div className="@container/main px-4 lg:px-6">
        <Card>
          <CardContent>
            <div className="w-full space-y-4">
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
                      auditSeverityOptions.find(
                        (option) => option.value === (filters.severity ?? 'all'),
                      )?.label ?? 'All severities'
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
                        onValueChange={(value) =>
                          setFilter('severity', value === 'all' ? '' : value)
                        }
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
                      auditOutcomeOptions.find(
                        (option) => option.value === (filters.outcome ?? 'all'),
                      )?.label ?? 'All outcomes'
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
                        onValueChange={(value) =>
                          setFilter('outcome', value === 'all' ? '' : value)
                        }
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
                  <Label>Vault</Label>
                  <VaultMultiSelectFilter
                    label="vault"
                    triggerLabel={selectedVaultLabel}
                    options={vaults.map((vault) => ({ value: vault.id, label: vault.name }))}
                    selectedValues={selectedVaultIds}
                    isLoading={vaultsState.isLoading}
                    hasError={vaultsState.error !== null}
                    onValueChange={setVaultFilter}
                    onClear={() => setVaultFilter([])}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="admin-audit-from">From</Label>
                  <DatePicker
                    id="admin-audit-from"
                    value={filters.dateFrom ?? ''}
                    max={filters.dateTo}
                    placeholder="From date"
                    ariaLabel="Audit log from date"
                    onChange={(value) => setDateFilter('dateFrom', value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="admin-audit-to">To</Label>
                  <DatePicker
                    id="admin-audit-to"
                    value={filters.dateTo ?? ''}
                    min={filters.dateFrom}
                    placeholder="To date"
                    ariaLabel="Audit log to date"
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
                    <RefreshCw
                      className={auditState.isLoading ? 'size-4 animate-spin' : 'size-4'}
                    />
                    Refresh
                  </Button>
                </div>
              </div>

              {auditState.error ? (
                <div className="flex items-center justify-between gap-3 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                  <span>{getErrorMessage(auditState.error, 'Unable to load audit log.')}</span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => void loadAuditEvents()}
                  >
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
            </div>
          </CardContent>
        </Card>
      </div>

      <AuditDetailsDialog event={selectedEvent} onClose={() => setSelectedEvent(null)} />
    </BaseLayout>
  );
}

import { useQuery } from '@tanstack/react-query';
import {
  checkOllamaModelAvailability,
  getAdminAiSettings,
  getAdminAiStatus,
  listPermissionRequests,
  listAdminUsers,
  listAdminVaults,
  listBackups,
  listOllamaModels,
} from './admin.api';
import type { AdminAiStatus, PermissionRequestStatus } from './admin.types';

const AI_STATUS_POLL_INTERVAL_MS = 2000;
const AI_STATUS_IDLE_POLL_INTERVAL_MS = 10000;

export const adminQueryKeys = {
  all: ['admin'] as const,
  users: () => [...adminQueryKeys.all, 'users'] as const,
  permissionRequests: (status: PermissionRequestStatus = 'pending') =>
    [...adminQueryKeys.all, 'permission-requests', status] as const,
  vaults: () => [...adminQueryKeys.all, 'vaults'] as const,
  backups: () => [...adminQueryKeys.all, 'backups'] as const,
  ai: () => [...adminQueryKeys.all, 'ai'] as const,
  aiSettings: () => [...adminQueryKeys.ai(), 'settings'] as const,
  aiStatus: () => [...adminQueryKeys.ai(), 'status'] as const,
  aiModels: (host: string) => [...adminQueryKeys.ai(), 'models', host] as const,
  aiAvailability: (host: string, model: string) =>
    [...adminQueryKeys.ai(), 'availability', host, model] as const,
};

export function useAdminUsersQuery({ enabled = true }: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: adminQueryKeys.users(),
    queryFn: listAdminUsers,
    enabled,
  });
}

export function usePermissionRequestsQuery({
  status = 'pending',
  enabled = true,
}: {
  status?: PermissionRequestStatus;
  enabled?: boolean;
} = {}) {
  return useQuery({
    queryKey: adminQueryKeys.permissionRequests(status),
    queryFn: () => listPermissionRequests({ status }),
    enabled,
  });
}

export function useAdminVaultsQuery({ enabled = true }: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: adminQueryKeys.vaults(),
    queryFn: listAdminVaults,
    enabled,
  });
}

export function useAdminBackupsQuery({ enabled = true }: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: adminQueryKeys.backups(),
    queryFn: listBackups,
    enabled,
  });
}

export function useAdminAiSettingsQuery({ enabled = true }: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: adminQueryKeys.aiSettings(),
    queryFn: getAdminAiSettings,
    enabled,
  });
}

function shouldPollAiStatus(status: AdminAiStatus | undefined) {
  if (status?.aiFeaturesEnabled !== true) {
    return false as const;
  }

  const hasWritableIndex = status.embedding.activeIndex !== null
    || status.embedding.candidateIndexes.some(index => index.status === 'building' || index.status === 'ready');

  if (!hasWritableIndex) {
    return false as const;
  }

  if (status.embedding.chunkCoverage.indexedChunkCount < status.embedding.chunkCoverage.totalChunkCount) {
    return AI_STATUS_POLL_INTERVAL_MS;
  }

  return AI_STATUS_IDLE_POLL_INTERVAL_MS;
}

export function useAdminAiStatusQuery({ enabled = true }: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: adminQueryKeys.aiStatus(),
    queryFn: getAdminAiStatus,
    enabled,
    refetchInterval: query =>
      shouldPollAiStatus(query.state.data?.status),
  });
}

export function useAdminOllamaModelsQuery({
  host,
  enabled = true,
}: {
  host: string;
  enabled?: boolean;
}) {
  return useQuery({
    queryKey: adminQueryKeys.aiModels(host),
    queryFn: () => listOllamaModels({ host }),
    enabled,
  });
}

export function useAdminAiAvailabilityQuery({
  host,
  model,
  enabled = true,
}: {
  host: string;
  model: string;
  enabled?: boolean;
}) {
  return useQuery({
    queryKey: adminQueryKeys.aiAvailability(host, model),
    queryFn: () => checkOllamaModelAvailability({ host, model }),
    enabled,
  });
}

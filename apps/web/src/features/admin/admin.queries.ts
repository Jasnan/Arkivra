import { useQuery } from '@tanstack/react-query';
import {
  checkAiModelAvailability,
  getAdminAiSettings,
  getAdminAiStatus,
  listPermissionRequests,
  listAdminUsers,
  listAdminVaults,
  listBackups,
  listAiChatModels,
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
  aiModels: (provider: string, host: string) => [...adminQueryKeys.ai(), 'models', provider, host] as const,
  aiAvailability: (provider: string, host: string, model: string, apiKeySecretRef: string | null | undefined) =>
    [...adminQueryKeys.ai(), 'availability', provider, host, model, apiKeySecretRef ?? ''] as const,
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
  provider = 'ollama',
  enabled = true,
}: {
  host: string;
  provider?: 'ollama' | 'gemini';
  enabled?: boolean;
}) {
  return useQuery({
    queryKey: adminQueryKeys.aiModels(provider, host),
    queryFn: () => listAiChatModels({ host, provider }),
    enabled,
  });
}

export function useAdminAiAvailabilityQuery({
  host,
  model,
  provider = 'ollama',
  apiKeySecretRef,
  enabled = true,
}: {
  host: string;
  model: string;
  provider?: 'ollama' | 'gemini';
  apiKeySecretRef?: string | null;
  enabled?: boolean;
}) {
  return useQuery({
    queryKey: adminQueryKeys.aiAvailability(provider, host, model, apiKeySecretRef),
    queryFn: () => checkAiModelAvailability({ host, model, provider, apiKeySecretRef }),
    enabled,
  });
}

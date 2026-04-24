import { useQuery } from '@tanstack/react-query';
import {
  checkOllamaModelAvailability,
  getAdminAiSettings,
  listAdminUsers,
  listAdminVaults,
  listBackups,
  listOllamaModels,
} from './admin.api';

export const adminQueryKeys = {
  all: ['admin'] as const,
  users: () => [...adminQueryKeys.all, 'users'] as const,
  vaults: () => [...adminQueryKeys.all, 'vaults'] as const,
  backups: () => [...adminQueryKeys.all, 'backups'] as const,
  ai: () => [...adminQueryKeys.all, 'ai'] as const,
  aiSettings: () => [...adminQueryKeys.ai(), 'settings'] as const,
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

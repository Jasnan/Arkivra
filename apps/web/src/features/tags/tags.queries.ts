import { useQuery } from '@tanstack/react-query';
import { listAccessibleTags, listTags } from './tags.api';

export const tagQueryKeys = {
  all: ['tags'] as const,
  list: (vaultId: string) => [...tagQueryKeys.all, 'list', vaultId] as const,
  accessible: (vaultId?: string) => [...tagQueryKeys.all, 'accessible', vaultId ?? 'all'] as const,
};

export function useTagsQuery({ vaultId }: { vaultId: string }) {
  return useQuery({
    queryKey: tagQueryKeys.list(vaultId),
    queryFn: () => listTags({ vaultId }),
    enabled: vaultId.length > 0,
  });
}

export function useAccessibleTagsQuery({ vaultId }: { vaultId?: string } = {}) {
  return useQuery({
    queryKey: tagQueryKeys.accessible(vaultId),
    queryFn: () => listAccessibleTags({ vaultId }),
    staleTime: 30_000,
  });
}

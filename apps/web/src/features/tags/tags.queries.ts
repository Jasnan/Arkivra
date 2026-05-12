import { useQuery } from '@tanstack/react-query';
import { listTags } from './tags.api';

export const tagQueryKeys = {
  all: ['tags'] as const,
  list: () => [...tagQueryKeys.all, 'list'] as const,
  accessible: () => [...tagQueryKeys.all, 'accessible'] as const,
};

export function useTagsQuery(_args?: { vaultId?: string }) {
  return useQuery({
    queryKey: tagQueryKeys.list(),
    queryFn: listTags,
    staleTime: 30_000,
  });
}

export function useAccessibleTagsQuery(_args: { vaultId?: string } = {}) {
  return useQuery({
    queryKey: tagQueryKeys.accessible(),
    queryFn: listTags,
    staleTime: 30_000,
  });
}

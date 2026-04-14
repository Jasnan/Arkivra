import { useQuery } from '@tanstack/react-query';
import { listTags } from './tags.api';

export const tagQueryKeys = {
  all: ['tags'] as const,
  list: (vaultId: string) => [...tagQueryKeys.all, 'list', vaultId] as const,
};

export function useTagsQuery({ vaultId }: { vaultId: string }) {
  return useQuery({
    queryKey: tagQueryKeys.list(vaultId),
    queryFn: () => listTags({ vaultId }),
    enabled: vaultId.length > 0,
  });
}

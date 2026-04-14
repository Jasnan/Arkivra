import { useQuery } from '@tanstack/react-query';
import { getMe } from './me.api';

export const meQueryKeys = {
  all: ['me'] as const,
};

export function useMeQuery() {
  return useQuery({
    queryKey: meQueryKeys.all,
    queryFn: getMe,
  });
}

import { useMutation, useQuery } from '@tanstack/react-query';
import { getUserUiPreferences, updateUserUiPreferences } from './user-preferences.api';

export const userPreferencesQueryKeys = {
  all: ['user-preferences'] as const,
  ui: () => [...userPreferencesQueryKeys.all, 'ui'] as const,
};

export function useUserUiPreferencesQuery({ enabled = true }: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: userPreferencesQueryKeys.ui(),
    queryFn: getUserUiPreferences,
    enabled,
    retry: false,
  });
}

export function useUpdateUserUiPreferencesMutation() {
  return useMutation({
    mutationFn: updateUserUiPreferences,
  });
}

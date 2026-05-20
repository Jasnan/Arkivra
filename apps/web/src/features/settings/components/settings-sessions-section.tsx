import { Box, Flex, HStack, Stack, Text } from '@chakra-ui/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Laptop, LogOut } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { useMeQuery } from '@/features/me/me.queries';
import { authClient } from '@/lib/auth-client';
import { SettingsSection, SettingsStatusBadge } from './settings-ui';

interface SessionManagementClient {
  listSessions?: () => Promise<{ data?: AuthSessionSummary[] | null; error?: { message?: string } | null }>;
  revokeSession?: (input: { token: string }) => Promise<{ error?: { message?: string } | null }>;
  revokeOtherSessions?: () => Promise<{ error?: { message?: string } | null }>;
}

interface AuthSessionSummary {
  id: string;
  token: string;
  createdAt?: string | Date | null;
  updatedAt?: string | Date | null;
  expiresAt?: string | Date | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}

function formatDateTime(value: string | Date | null | undefined) {
  if (!value) return 'Not available';

  return new Intl.DateTimeFormat('en', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function getCurrentBrowserLabel() {
  if (typeof navigator === 'undefined') return 'Current browser';

  const userAgent = navigator.userAgent;
  const browser = userAgent.includes('Firefox')
    ? 'Firefox'
    : userAgent.includes('Edg')
      ? 'Microsoft Edge'
      : userAgent.includes('Chrome')
        ? 'Chrome'
        : userAgent.includes('Safari')
          ? 'Safari'
          : 'Browser';
  const platform = navigator.platform || 'this device';

  return `${browser} on ${platform}`;
}

function getCurrentHostLabel() {
  if (typeof window === 'undefined') return 'Local session';
  return window.location.host || 'Local session';
}

function getSessionDisplay(session: AuthSessionSummary) {
  return {
    device: session.userAgent || 'Unknown browser or device',
    location: session.ipAddress || 'Unknown address',
    lastActive: formatDateTime(session.updatedAt ?? session.createdAt),
  };
}

function getSessionTimestamp(value: string | Date | null | undefined) {
  if (!value) return 0;

  const timestamp = new Date(value).getTime();
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function isSessionActive(session: AuthSessionSummary) {
  if (!session.expiresAt) return true;
  return getSessionTimestamp(session.expiresAt) > Date.now();
}

function sortSessions(sessions: AuthSessionSummary[], currentSessionId: string | undefined) {
  return [...sessions].sort((left, right) => {
    const leftIsCurrent = left.id === currentSessionId;
    const rightIsCurrent = right.id === currentSessionId;

    if (leftIsCurrent !== rightIsCurrent) {
      return leftIsCurrent ? -1 : 1;
    }

    const leftIsActive = isSessionActive(left);
    const rightIsActive = isSessionActive(right);

    if (leftIsActive !== rightIsActive) {
      return leftIsActive ? -1 : 1;
    }

    const leftLastActive = getSessionTimestamp(left.updatedAt ?? left.createdAt);
    const rightLastActive = getSessionTimestamp(right.updatedAt ?? right.createdAt);

    return rightLastActive - leftLastActive;
  });
}

export function SettingsSessionsSection() {
  const queryClient = useQueryClient();
  const meQuery = useMeQuery();
  const sessionClient = authClient as SessionManagementClient;
  const canListSessions = typeof sessionClient.listSessions === 'function';
  const currentBrowserLabel = getCurrentBrowserLabel();
  const currentHostLabel = getCurrentHostLabel();

  const sessionsQuery = useQuery({
    queryKey: ['settings', 'sessions'],
    enabled: canListSessions,
    queryFn: async () => {
      const { data, error } = await sessionClient.listSessions!();

      if (error) {
        throw new Error(error.message ?? 'Could not load sessions.');
      }

      return data ?? [];
    },
  });
  const sortedSessions = sortSessions(sessionsQuery.data ?? [], meQuery.data?.sessionId);

  const signOutOtherSessionsMutation = useMutation({
    mutationFn: async () => {
      const revokeOtherSessions = sessionClient.revokeOtherSessions;

      if (!revokeOtherSessions) {
        return;
      }

      const { error } = await revokeOtherSessions();

      if (error) {
        throw new Error(error.message ?? 'Could not sign out other sessions.');
      }
    },
    onSuccess: () => {
      toast.success('Other sessions signed out.');
      void queryClient.invalidateQueries({ queryKey: ['settings', 'sessions'] });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Could not sign out other sessions.');
    },
  });

  const revokeSessionMutation = useMutation({
    mutationFn: async (session: AuthSessionSummary) => {
      const revokeSession = sessionClient.revokeSession;

      if (!revokeSession) {
        return;
      }

      const { error } = await revokeSession({ token: session.token });

      if (error) {
        throw new Error(error.message ?? 'Could not revoke session.');
      }
    },
    onSuccess: async () => {
      toast.success('Session revoked.');
      await queryClient.invalidateQueries({ queryKey: ['settings', 'sessions'] });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Could not revoke session.');
    },
  });

  return (
    <SettingsSection
      title="Sessions"
      density="compact"
      actions={
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={signOutOtherSessionsMutation.isPending}
          onClick={() => {
            signOutOtherSessionsMutation.mutate();
          }}
        >
          <LogOut size={15} />
          {signOutOtherSessionsMutation.isPending ? 'Signing out...' : 'Sign out others'}
        </Button>
      }
    >
      <Stack gap="2">
        {sortedSessions.length > 0 ? (
          sortedSessions.map((session) => {
            const isCurrentSession = session.id === meQuery.data?.sessionId;
            const display = getSessionDisplay(session);

            return (
              <Box key={session.id} rounded="md" borderWidth="1px" borderColor="border.surface" bg="bg.subtle" p="3">
                <Flex align="center" justify="space-between" gap="3">
                  <HStack gap="2.5" minW="0">
                    <Flex boxSize="8" align="center" justify="center" rounded="md" bg="teal.subtle" color="teal.fg" flexShrink={0}>
                      <Laptop size={16} />
                    </Flex>
                    <Stack gap="0.5" minW="0">
                      <HStack gap="2" flexWrap="wrap">
                        <Text fontSize="sm" fontWeight="semibold">
                          {isCurrentSession ? 'Current session' : 'Active session'}
                        </Text>
                        {isCurrentSession ? <SettingsStatusBadge density="compact" tone="enabled">This device</SettingsStatusBadge> : null}
                      </HStack>
                      <Text textStyle="sm" color="fg.muted" truncate>
                        {display.device}
                      </Text>
                      <Text textStyle="xs" color="fg.subtle" truncate>
                        {display.location} · Last active {display.lastActive}
                      </Text>
                    </Stack>
                  </HStack>
                  {isCurrentSession ? (
                    <Text flexShrink={0} fontSize="xs" fontWeight="medium" color="teal.fg">
                      Active now
                    </Text>
                  ) : (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={revokeSessionMutation.isPending}
                      onClick={() => {
                        revokeSessionMutation.mutate(session);
                      }}
                    >
                      Revoke
                    </Button>
                  )}
                </Flex>
              </Box>
            );
          })
        ) : (
          <Box rounded="md" borderWidth="1px" borderColor="border.surface" bg="bg.subtle" p="3">
            <Flex align="center" justify="space-between" gap="3">
              <HStack gap="2.5" minW="0">
                <Flex boxSize="8" align="center" justify="center" rounded="md" bg="teal.subtle" color="teal.fg" flexShrink={0}>
                  <Laptop size={16} />
                </Flex>
                <Stack gap="0.5" minW="0">
                  <HStack gap="2">
                    <Text fontSize="sm" fontWeight="semibold">
                      Current session
                    </Text>
                    <SettingsStatusBadge density="compact" tone="enabled">This device</SettingsStatusBadge>
                  </HStack>
                  <Text textStyle="sm" color="fg.muted" truncate>
                    {currentBrowserLabel} · {currentHostLabel}
                  </Text>
                </Stack>
              </HStack>
              <Text flexShrink={0} fontSize="xs" fontWeight="medium" color="teal.fg">
                Active now
              </Text>
            </Flex>
          </Box>
        )}
      </Stack>
    </SettingsSection>
  );
}

import { Box } from '@chakra-ui/react';
import { ActivityEventTimeline } from './activity-event-timeline';
import { useVaultActivityQuery } from '@/features/audit/audit.queries';

export function VaultActivityPanel({ vaultId }: { vaultId: string }) {
  const activityQuery = useVaultActivityQuery({ vaultId });
  const events = activityQuery.data?.pages.flatMap(page => page.activity) ?? [];

  return (
    <Box minH="640px" overflow="auto" rounded="lg" bg="bg.surface" p={{ base: '1', md: '2' }}>
      <ActivityEventTimeline
        events={events}
        isLoading={activityQuery.isLoading}
        isError={activityQuery.isError}
        emptyTitle="No vault activity yet"
        emptyDescription="Vault and document activity will appear here."
        hasNextPage={activityQuery.hasNextPage}
        isFetchingNextPage={activityQuery.isFetchingNextPage}
        onLoadMore={() => { void activityQuery.fetchNextPage(); }}
      />
    </Box>
  );
}

import { Box } from '@chakra-ui/react';
import { ActivityEventTimeline } from './activity-event-timeline';
import { useDocumentActivityQuery } from '@/features/audit/audit.queries';

export function DocumentActivityPanel({
  vaultId,
  documentId,
}: {
  vaultId: string;
  documentId: string;
}) {
  const activityQuery = useDocumentActivityQuery({ vaultId, documentId });
  const events = activityQuery.data?.pages.flatMap(page => page.activity) ?? [];

  return (
    <Box minH="820px" overflow="auto" rounded="lg" bg="bg.surface" p={{ base: '1', md: '2' }}>
      <ActivityEventTimeline
        events={events}
        isLoading={activityQuery.isLoading}
        isError={activityQuery.isError}
        hasNextPage={activityQuery.hasNextPage}
        isFetchingNextPage={activityQuery.isFetchingNextPage}
        onLoadMore={() => { void activityQuery.fetchNextPage(); }}
      />
    </Box>
  );
}

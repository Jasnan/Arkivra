import { Box, Flex, Icon, Stack, Text, Timeline } from '@chakra-ui/react';
import {
  AlertCircle,
  Blocks,
  CheckCircle2,
  Clock3,
  FilePenLine,
  FileText,
  FolderInput,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Trash2,
  UploadCloud,
  UserRound,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { ActivityFeedItem } from '@/features/audit/audit.types';
import {
  formatAuditMetadataLabel,
  formatAuditMetadataValue,
  formatAuditTimestamp,
} from '@/features/audit/audit-formatters';

interface ActivityTone {
  icon: typeof UploadCloud;
  bg: string;
  color: string;
  borderColor: string;
}

const processingCopy: Record<string, { title: string; description: string; tone: ActivityTone }> = {
  queued: {
    title: 'Document queued',
    description: 'Document added to the processing queue.',
    tone: { icon: Clock3, bg: 'blue.subtle', color: 'blue.fg', borderColor: 'blue.muted' },
  },
  partitioning: {
    title: 'Document partitioning',
    description: 'Identifying and extracting document sections.',
    tone: { icon: Blocks, bg: 'yellow.subtle', color: 'yellow.fg', borderColor: 'yellow.muted' },
  },
  chunking: {
    title: 'Document chunking',
    description: 'Splitting document into smaller, readable chunks.',
    tone: { icon: Blocks, bg: 'orange.subtle', color: 'orange.fg', borderColor: 'orange.muted' },
  },
  summarising: {
    title: 'Document summarising',
    description: 'Generating AI summary from document content.',
    tone: { icon: FileText, bg: 'purple.subtle', color: 'purple.fg', borderColor: 'purple.muted' },
  },
  completed: {
    title: 'Document processing completed',
    description: 'All processing steps have finished successfully.',
    tone: { icon: CheckCircle2, bg: 'green.subtle', color: 'green.fg', borderColor: 'green.muted' },
  },
  failed: {
    title: 'Document processing failed',
    description: 'Processing could not finish for this document.',
    tone: { icon: AlertCircle, bg: 'red.subtle', color: 'red.fg', borderColor: 'red.muted' },
  },
};

function getMetadataString(event: ActivityFeedItem, key: string) {
  const value = event.metadata[key];
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function getActivityTone(event: ActivityFeedItem): ActivityTone {
  if (event.activityType === 'document.processing_status_changed') {
    return processingCopy[getMetadataString(event, 'processing_status') ?? '']?.tone
      ?? { icon: Sparkles, bg: 'blue.subtle', color: 'blue.fg', borderColor: 'blue.muted' };
  }

  switch (event.activityType) {
    case 'document.created':
      return { icon: UploadCloud, bg: 'green.subtle', color: 'green.fg', borderColor: 'green.muted' };
    case 'document.metadata_updated':
      return { icon: FilePenLine, bg: 'purple.subtle', color: 'purple.fg', borderColor: 'purple.muted' };
    case 'document.deleted':
      return { icon: Trash2, bg: 'red.subtle', color: 'red.fg', borderColor: 'red.muted' };
    case 'document.restored':
      return { icon: RotateCcw, bg: 'green.subtle', color: 'green.fg', borderColor: 'green.muted' };
    case 'document.moved':
      return { icon: FolderInput, bg: 'blue.subtle', color: 'blue.fg', borderColor: 'blue.muted' };
    default:
      return { icon: FileText, bg: 'bg.subtle', color: 'fg.muted', borderColor: 'border.surface' };
  }
}

function getActivityTitle(event: ActivityFeedItem) {
  if (event.activityType === 'document.processing_status_changed') {
    return processingCopy[getMetadataString(event, 'processing_status') ?? '']?.title ?? event.summary;
  }

  return event.summary;
}

function getActivityDescription(event: ActivityFeedItem) {
  if (event.activityType === 'document.processing_status_changed') {
    return processingCopy[getMetadataString(event, 'processing_status') ?? '']?.description
      ?? 'Document processing status changed.';
  }

  if (event.activityType === 'document.created') {
    return 'File was successfully uploaded to the vault.';
  }

  if (event.activityType === 'document.metadata_updated') {
    return 'Document metadata was changed.';
  }

  if (event.activityType === 'document.deleted') {
    return 'Document was moved to trash.';
  }

  if (event.activityType === 'document.restored') {
    return 'Document was restored from trash.';
  }

  if (event.activityType === 'document.moved') {
    return 'Document location changed.';
  }

  return null;
}

export function ActivityEventTimeline({
  events,
  isLoading,
  isError,
  emptyTitle = 'No activity recorded yet',
  emptyDescription = 'Audit history starts from when this feature is deployed.',
  hasNextPage,
  isFetchingNextPage,
  onLoadMore,
}: {
  events: ActivityFeedItem[];
  isLoading: boolean;
  isError: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  hasNextPage?: boolean;
  isFetchingNextPage?: boolean;
  onLoadMore?: () => void;
}) {
  if (isLoading) {
    return <Text fontSize="sm" color="fg.muted">Loading activity...</Text>;
  }

  if (isError) {
    return <Text fontSize="sm" color="fg.error">Unable to load activity.</Text>;
  }

  if (events.length === 0) {
    return (
      <Flex minH="64" align="center" justify="center" rounded="lg" borderWidth="1px" borderStyle="dashed" borderColor="border.surface" bg="bg.subtle" p="6" textAlign="center">
        <Box>
          <Flex mx="auto" mb="3" boxSize="10" align="center" justify="center" rounded="full" bg="bg.surface" color="teal.fg">
            <ShieldCheck size={20} />
          </Flex>
          <Text fontSize="sm" fontWeight="semibold" color="fg">{emptyTitle}</Text>
          <Text mt="1" fontSize="sm" color="fg.muted">{emptyDescription}</Text>
        </Box>
      </Flex>
    );
  }

  return (
    <Flex direction="column" gap="4">
      <Timeline.Root size="lg" variant="subtle" maxW="2xl">
        {events.map((event) => {
          const tone = getActivityTone(event);
          const description = getActivityDescription(event);

          return (
            <Timeline.Item key={event.id}>
              <Timeline.Connector>
                <Timeline.Separator />
                <Timeline.Indicator>
                  <Icon as={tone.icon} boxSize="4" />
                </Timeline.Indicator>
              </Timeline.Connector>
              <Timeline.Content gap="4">
                <Stack gap="1" minW="0">
                  <Timeline.Title>
                    <Text textStyle="sm" fontWeight="semibold" color="fg" lineClamp={2}>
                      {getActivityTitle(event)}
                    </Text>
                  </Timeline.Title>
                  <Timeline.Description>
                    <Stack>
                      <Flex align="center" gap="2" wrap="wrap" color="fg.muted">
                      <Text textStyle="xs">{formatAuditTimestamp(event.occurredAt)}</Text>
                      <Text textStyle="xs">•</Text>
                      <Flex align="center" gap="1.5" minW="0">
                        <UserRound size={14} />
                        <Text textStyle="xs" fontWeight={event.actorDisplayName === 'System' ? 'normal' : 'semibold'} color={event.actorDisplayName === 'System' ? 'fg.muted' : 'fg'}>
                          {event.actorDisplayName}
                        </Text>
                      </Flex>
                    </Flex>
                    {description ? (
                      <Text textStyle="sm" color="fg.muted" lineClamp={2}>
                        {description}
                      </Text>
                    ) : null}
                    {Object.keys(event.metadata).length > 0 ? (
                      <Flex mt="1" flexWrap="wrap" gap="1">
                        {Object.entries(event.metadata).map(([key, value]) => {
                          const formattedValue = formatAuditMetadataValue(key, value);
                          return formattedValue.length > 0 ? (
                            <Text key={key} rounded="md" borderWidth="1px" borderColor="border.surface" bg="bg.subtle" px="2" py="1" textStyle="xs" color="fg.muted">
                              {formatAuditMetadataLabel(key)}: {formattedValue}
                            </Text>
                          ) : null;
                        })}
                      </Flex>
                    ) : null}
                    </Stack>
                  </Timeline.Description>
                </Stack>
              </Timeline.Content>
            </Timeline.Item>
          );
        })}
      </Timeline.Root>

      {hasNextPage && onLoadMore ? (
        <Button type="button" variant="outline" alignSelf="center" disabled={isFetchingNextPage} onClick={onLoadMore}>
          {isFetchingNextPage ? 'Loading...' : 'Load older events'}
        </Button>
      ) : null}
    </Flex>
  );
}

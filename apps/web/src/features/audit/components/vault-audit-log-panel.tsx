import { useMemo, useState } from 'react';
import { Box, Flex, Grid, Text } from '@chakra-ui/react';
import { SlidersHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Field, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { RadioDropdownMenu } from '@/components/ui/radio-dropdown-menu';
import type { AuditLogFilters } from '@/features/audit/audit.types';
import { useVaultAuditLogQuery } from '@/features/audit/audit.queries';
import {
  formatAuditMetadataEntries,
  formatAuditTimestamp,
} from '@/features/audit/audit-formatters';

const eventTypeOptions = [
  { value: 'all', label: 'All events' },
  { value: 'document.uploaded', label: 'document.uploaded' },
  { value: 'document.viewed', label: 'document.viewed' },
  { value: 'document.downloaded', label: 'document.downloaded' },
  { value: 'document.deleted', label: 'document.deleted' },
  { value: 'document.delete_failed', label: 'document.delete_failed' },
  { value: 'document.access_denied', label: 'document.access_denied' },
  { value: 'vault.member_added', label: 'vault.member_added' },
  { value: 'vault.member_removed', label: 'vault.member_removed' },
  { value: 'vault.member_role_changed', label: 'vault.member_role_changed' },
] as const;

const outcomeOptions = [
  { value: 'all', label: 'All outcomes' },
  { value: 'success', label: 'success' },
  { value: 'failure', label: 'failure' },
  { value: 'denied', label: 'denied' },
] as const;

export function VaultAuditLogPanel({ vaultId }: { vaultId: string }) {
  const [filters, setFilters] = useState<AuditLogFilters>({});
  const normalizedFilters = useMemo(() => filters, [filters]);
  const auditQuery = useVaultAuditLogQuery({ vaultId, filters: normalizedFilters });
  const events = auditQuery.data?.pages.flatMap(page => page.events) ?? [];

  function setFilter(key: keyof AuditLogFilters, value: string) {
    setFilters(current => ({
      ...current,
      [key]: value.length > 0 ? value : undefined,
    }));
  }

  const isForbidden = auditQuery.isError && (auditQuery.error as { status?: number }).status === 403;

  return (
    <Flex direction="column" gap="4">
      <Grid gap="3" templateColumns={{ base: '1fr', md: 'repeat(3, minmax(0, 1fr))', xl: 'repeat(6, minmax(0, 1fr))' }}>
        <Field>
          <FieldLabel>Event type</FieldLabel>
          <RadioDropdownMenu
            ariaLabel="Filter vault audit log by event type"
            value={filters.eventType ?? 'all'}
            options={eventTypeOptions}
            onValueChange={(value) => setFilter('eventType', value === 'all' ? '' : value)}
          />
        </Field>
        <Field>
          <FieldLabel>Outcome</FieldLabel>
          <RadioDropdownMenu
            ariaLabel="Filter vault audit log by outcome"
            value={filters.outcome ?? 'all'}
            options={outcomeOptions}
            onValueChange={(value) => setFilter('outcome', value === 'all' ? '' : value)}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="audit-actor-id">Actor</FieldLabel>
          <Input id="audit-actor-id" value={filters.actorId ?? ''} placeholder="User id" bg="bg.surface" onChange={(event) => setFilter('actorId', event.target.value)} />
        </Field>
        <Field>
          <FieldLabel htmlFor="audit-document-id">Document</FieldLabel>
          <Input id="audit-document-id" value={filters.documentId ?? ''} placeholder="Document id" bg="bg.surface" onChange={(event) => setFilter('documentId', event.target.value)} />
        </Field>
        <Field>
          <FieldLabel htmlFor="audit-date-from">From</FieldLabel>
          <Input id="audit-date-from" type="date" value={filters.dateFrom ?? ''} bg="bg.surface" onChange={(event) => setFilter('dateFrom', event.target.value)} />
        </Field>
        <Field>
          <FieldLabel htmlFor="audit-date-to">To</FieldLabel>
          <Input id="audit-date-to" type="date" value={filters.dateTo ?? ''} bg="bg.surface" onChange={(event) => setFilter('dateTo', event.target.value)} />
        </Field>
      </Grid>

      {auditQuery.isLoading ? (
        <Text fontSize="sm" color="fg.muted">Loading audit log...</Text>
      ) : null}

      {isForbidden ? (
        <Flex minH="64" align="center" justify="center" rounded="lg" borderWidth="1px" borderStyle="dashed" borderColor="border.surface" bg="bg.subtle" p="6" textAlign="center">
          <Box>
            <Flex mx="auto" mb="3" boxSize="10" align="center" justify="center" rounded="full" bg="bg.surface" color="fg.muted">
              <SlidersHorizontal size={20} />
            </Flex>
            <Text fontSize="sm" fontWeight="semibold" color="fg">Audit log unavailable</Text>
            <Text mt="1" fontSize="sm" color="fg.muted">Only vault owners and administrators can view the full audit log.</Text>
          </Box>
        </Flex>
      ) : auditQuery.isError ? (
        <Text fontSize="sm" color="fg.error">Unable to load audit log.</Text>
      ) : null}

      {!auditQuery.isLoading && !auditQuery.isError && events.length === 0 ? (
        <Flex minH="64" align="center" justify="center" rounded="lg" borderWidth="1px" borderStyle="dashed" borderColor="border.surface" bg="bg.subtle" p="6" textAlign="center">
          <Box>
            <Text fontSize="sm" fontWeight="semibold" color="fg">No audit events yet</Text>
            <Text mt="1" fontSize="sm" color="fg.muted">Audit history starts from this deployment.</Text>
          </Box>
        </Flex>
      ) : null}

      {events.length > 0 ? (
        <Flex direction="column" gap="2">
          {events.map(event => (
            <Box key={event.id} rounded="lg" borderWidth="1px" borderColor="border.surface" bg="bg.surface" px="4" py="3">
              <Flex align="start" justify="space-between" gap="3">
                <Box minW="0">
                  <Text fontSize="sm" fontWeight="medium" color="fg">{event.summary}</Text>
                  <Text mt="1" fontSize="xs" color="fg.muted">
                    {formatAuditTimestamp(event.occurredAt)} · {event.eventType} · {event.outcome}
                  </Text>
                  <Text mt="1" fontSize="xs" color="fg.muted">
                    Actor: {event.actorDisplayName}
                    {event.targetDisplayName ? ` · Target: ${event.targetDisplayName}` : event.targetId ? ` · Target: ${event.targetId}` : ''}
                  </Text>
                </Box>
                <Text flexShrink={0} rounded="full" bg="bg.subtle" px="2" py="0.5" fontSize="xs" color="fg.muted">
                  {event.eventCategory}
                </Text>
              </Flex>
              {formatAuditMetadataEntries(event.metadata).length > 0 ? (
                <Flex mt="3" flexWrap="wrap" gap="2">
                  {formatAuditMetadataEntries(event.metadata).map(entry => (
                    <Text key={entry.key} rounded="md" bg="bg.subtle" px="2" py="1" fontSize="xs" color="fg.muted">
                      {entry.label}: {entry.value}
                    </Text>
                  ))}
                </Flex>
              ) : null}
            </Box>
          ))}
        </Flex>
      ) : null}

      {auditQuery.hasNextPage ? (
        <Button type="button" variant="outline" alignSelf="flex-start" disabled={auditQuery.isFetchingNextPage} onClick={() => { void auditQuery.fetchNextPage(); }}>
          {auditQuery.isFetchingNextPage ? 'Loading...' : 'Load more'}
        </Button>
      ) : null}
    </Flex>
  );
}

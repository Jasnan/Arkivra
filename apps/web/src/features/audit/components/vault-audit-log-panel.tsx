import { useMemo, useState } from 'react';
import { Box, Flex, Grid, Text } from '@chakra-ui/react';
import { SlidersHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Field, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { AuditLogFilters } from '@/features/audit/audit.types';
import { useVaultAuditLogQuery } from '@/features/audit/audit.queries';
import {
  formatAuditMetadataLabel,
  formatAuditMetadataValue,
  formatAuditTimestamp,
} from '@/features/audit/audit-formatters';

const eventTypeOptions = [
  'document.uploaded',
  'document.viewed',
  'document.downloaded',
  'document.deleted',
  'document.delete_failed',
  'document.access_denied',
  'vault.member_added',
  'vault.member_removed',
  'vault.member_role_changed',
  'audit_log.viewed',
  'audit_log.searched',
];

const outcomeOptions = ['success', 'failure', 'denied'];

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
          <Select value={filters.eventType ?? 'all'} onValueChange={(value) => setFilter('eventType', value === 'all' ? '' : value)} positioning={{ sameWidth: true }}>
            <SelectTrigger bg="bg.surface">
              <SelectValue placeholder="All events" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All events</SelectItem>
              {eventTypeOptions.map(value => (
                <SelectItem key={value} value={value}>{value}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field>
          <FieldLabel>Outcome</FieldLabel>
          <Select value={filters.outcome ?? 'all'} onValueChange={(value) => setFilter('outcome', value === 'all' ? '' : value)} positioning={{ sameWidth: true }}>
            <SelectTrigger bg="bg.surface">
              <SelectValue placeholder="All outcomes" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All outcomes</SelectItem>
              {outcomeOptions.map(value => (
                <SelectItem key={value} value={value}>{value}</SelectItem>
              ))}
            </SelectContent>
          </Select>
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
              {Object.keys(event.metadata).length > 0 ? (
                <Flex mt="3" flexWrap="wrap" gap="2">
                  {Object.entries(event.metadata).map(([key, value]) => {
                    const formattedValue = formatAuditMetadataValue(key, value);
                    return formattedValue.length > 0 ? (
                      <Text key={key} rounded="md" bg="bg.subtle" px="2" py="1" fontSize="xs" color="fg.muted">
                        {formatAuditMetadataLabel(key)}: {formattedValue}
                      </Text>
                    ) : null;
                  })}
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

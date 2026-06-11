import { Box, Flex, Grid, HStack, Stack, Text } from '@chakra-ui/react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Field, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { RadioDropdownMenu } from '@/components/ui/radio-dropdown-menu';
import { SearchCombobox } from '@/components/ui/search-combobox';
import { AuditDateFilterPicker } from '@/features/audit/components/audit-date-filter-picker';
import { useAdminAuditLogQuery } from '@/features/audit/audit.queries';
import type { AuditLogFilters } from '@/features/audit/audit.types';
import { formatAuditMetadataEntries, formatAuditTimestamp } from '@/features/audit/audit-formatters';
import { useMeQuery } from '@/features/me/me.queries';
import { AdminAccessBoundary } from './admin-shared';

const auditCategoryOptions = [
  { value: 'all', label: 'All categories' },
  { value: 'auth', label: 'auth' },
  { value: 'vault', label: 'vault' },
  { value: 'document', label: 'document' },
  { value: 'permission', label: 'permission' },
  { value: 'audit', label: 'audit' },
  { value: 'system', label: 'system' },
] as const;
const auditSeverityOptions = [
  { value: 'all', label: 'All severities' },
  { value: 'info', label: 'info' },
  { value: 'notice', label: 'notice' },
  { value: 'warning', label: 'warning' },
  { value: 'critical', label: 'critical' },
] as const;
const auditOutcomeOptions = [
  { value: 'all', label: 'All outcomes' },
  { value: 'success', label: 'success' },
  { value: 'failure', label: 'failure' },
  { value: 'denied', label: 'denied' },
] as const;
const auditEventTypeOptions = [
  { value: 'document.uploaded', label: 'Document Uploaded' },
  { value: 'document.viewed', label: 'Document Viewed' },
  { value: 'document.downloaded', label: 'Document Downloaded' },
  { value: 'document.deleted', label: 'Document Deleted' },
  { value: 'document.delete_failed', label: 'Document Delete Failed' },
  { value: 'document.access_denied', label: 'Document Access Denied' },
  { value: 'vault.member_added', label: 'Vault Member Added' },
  { value: 'vault.member_removed', label: 'Vault Member Removed' },
  { value: 'vault.member_role_changed', label: 'Vault Member Role Changed' },
  { value: 'vault.access_denied', label: 'Vault Access Denied' },
  { value: 'ai.features_toggled', label: 'AI toggled' },
  { value: 'ai.chat_model_changed', label: 'AI chat model changed' },
  { value: 'ai.translation_model_changed', label: 'AI translation model changed' },
  { value: 'ai.embedding_model_changed', label: 'AI embedding model changed' },
] as const;

export function AdminAuditLogPage() {
  const meQuery = useMeQuery();
  const isEnabled = meQuery.data?.isAdmin === true;
  const [filters, setFilters] = useState<AuditLogFilters>({});
  const auditQuery = useAdminAuditLogQuery({ filters, enabled: isEnabled });
  const events = auditQuery.data?.pages.flatMap(page => page.events) ?? [];
  const selectedEventTypes = Array.isArray(filters.eventType)
    ? filters.eventType
    : filters.eventType
      ? [filters.eventType]
      : [];

  function setFilter(key: keyof AuditLogFilters, value: string) {
    setFilters(current => ({
      ...current,
      [key]: value.length > 0 ? value : undefined,
    }));
  }

  function setDateFilter(key: 'dateFrom' | 'dateTo', value: string) {
    setFilters(current => {
      const next: AuditLogFilters = {
        ...current,
        [key]: value.length > 0 ? value : undefined,
      };

      if (key === 'dateFrom' && value && current.dateTo && value > current.dateTo) {
        next.dateTo = value;
      }

      if (key === 'dateTo' && value && current.dateFrom && value < current.dateFrom) {
        next.dateFrom = value;
      }

      return next;
    });
  }

  function setEventTypeFilter(values: string[]) {
    setFilters(current => ({
      ...current,
      eventType: values.length > 0 ? values : undefined,
    }));
  }

  return (
    <AdminAccessBoundary
      title="Audit log"
      description="Security, compliance, permission, and administrative events."
      isEnabled={isEnabled}
      isLoading={meQuery.isLoading}
    >
        <Grid gap="3" templateColumns={{ base: '1fr', md: 'repeat(3, minmax(0, 1fr))', xl: 'repeat(4, minmax(0, 1fr))' }}>
          <Field>
            <FieldLabel>Category</FieldLabel>
            <RadioDropdownMenu
              ariaLabel="Filter audit log by category"
              value={filters.eventCategory ?? 'all'}
              options={auditCategoryOptions}
              onValueChange={(value) => setFilter('eventCategory', value === 'all' ? '' : value)}
            />
          </Field>
          <Field>
            <FieldLabel>Severity</FieldLabel>
            <RadioDropdownMenu
              ariaLabel="Filter audit log by severity"
              value={filters.severity ?? 'all'}
              options={auditSeverityOptions}
              onValueChange={(value) => setFilter('severity', value === 'all' ? '' : value)}
            />
          </Field>
          <Field>
            <FieldLabel>Outcome</FieldLabel>
            <RadioDropdownMenu
              ariaLabel="Filter audit log by outcome"
              value={filters.outcome ?? 'all'}
              options={auditOutcomeOptions}
              onValueChange={(value) => setFilter('outcome', value === 'all' ? '' : value)}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="admin-audit-event-type">Event type</FieldLabel>
            <SearchCombobox
              label="Event type"
              inputId="admin-audit-event-type"
              ariaLabel="Filter audit log by event type"
              placeholder="All event types"
              searchPlaceholder="Search event types"
              emptyLabel="No event types found."
              options={auditEventTypeOptions.map((option) => ({ ...option, meta: option.value }))}
              value={selectedEventTypes}
              multiple
              onValueChange={setEventTypeFilter}
              hideLabel
              controlSize="toolbar"
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="admin-audit-vault">Vault</FieldLabel>
            <Input id="admin-audit-vault" value={filters.vaultId ?? ''} placeholder="Vault id" bg="bg.surface" onChange={(event) => setFilter('vaultId', event.target.value)} />
          </Field>
          <Field>
            <FieldLabel htmlFor="admin-audit-from">From</FieldLabel>
            <AuditDateFilterPicker
              id="admin-audit-from"
              label="From"
              value={filters.dateFrom}
              max={filters.dateTo}
              onValueChange={(value) => setDateFilter('dateFrom', value)}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="admin-audit-to">To</FieldLabel>
            <AuditDateFilterPicker
              id="admin-audit-to"
              label="To"
              value={filters.dateTo}
              min={filters.dateFrom}
              onValueChange={(value) => setDateFilter('dateTo', value)}
            />
          </Field>
        </Grid>

        {auditQuery.isLoading ? <Text textStyle="sm" color="fg.muted">Loading audit log...</Text> : null}
        {auditQuery.isError ? <Text textStyle="sm" color="fg.error">Unable to load audit log.</Text> : null}
        {!auditQuery.isLoading && !auditQuery.isError && events.length === 0 ? (
          <Text textStyle="sm" color="fg.muted">No audit events match these filters.</Text>
        ) : null}

        {events.length > 0 ? (
          <Stack gap="2">
            {events.map(event => (
              <Box key={event.id} rounded="lg" borderWidth="1px" borderColor="border.surface" bg="bg.surface" px="4" py="3">
                <Flex align="start" justify="space-between" gap="3">
                  <Box minW="0">
                    <Text textStyle="sm" fontWeight="semibold" color="fg">{event.summary}</Text>
                    <Text mt="1" textStyle="xs" color="fg.muted">
                      {formatAuditTimestamp(event.occurredAt)} · {event.eventType} · {event.outcome}
                    </Text>
                    <Text mt="1" textStyle="xs" color="fg.muted">
                      Actor: {event.actorDisplayName}
                      {event.vaultId ? ` · Vault: ${event.vaultId}` : ''}
                      {event.documentId ? ` · Document: ${event.documentId}` : ''}
                    </Text>
                  </Box>
                  <HStack gap="1.5" flexShrink={0}>
                    <Badge variant="secondary">{event.severity}</Badge>
                    <Badge variant="outline">{event.eventCategory}</Badge>
                  </HStack>
                </Flex>
                {formatAuditMetadataEntries(event.metadata).length > 0 ? (
                  <Flex mt="3" flexWrap="wrap" gap="2">
                    {formatAuditMetadataEntries(event.metadata).map(entry => (
                      <Text key={entry.key} rounded="md" bg="bg.subtle" px="2" py="1" textStyle="xs" color="fg.muted">
                        {entry.label}: {entry.value}
                      </Text>
                    ))}
                  </Flex>
                ) : null}
              </Box>
            ))}
          </Stack>
        ) : null}

        {auditQuery.hasNextPage ? (
          <Button type="button" variant="outline" alignSelf="flex-start" disabled={auditQuery.isFetchingNextPage} onClick={() => { void auditQuery.fetchNextPage(); }}>
            {auditQuery.isFetchingNextPage ? 'Loading...' : 'Load more'}
          </Button>
        ) : null}
    </AdminAccessBoundary>
  );
}

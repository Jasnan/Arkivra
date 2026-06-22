import type { ReactNode } from 'react';
import { Box, Flex, HStack, SimpleGrid, Stack, Table, Text } from '@chakra-ui/react';
import { MoreVertical, Plus, Server, Sparkles } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { AdminAiModelCatalogEntry, AdminAiSettings } from '@/features/admin/admin.types';
import { formatDate } from '@/features/documents/documents.utils';
import { SettingsStatusBadge } from '@/features/settings/components/settings-ui';
import { AiSettingsSection } from './admin-ai-settings-page-sections';

interface AdminAiProviderSectionProps {
  aiDraft: AdminAiSettings;
  effectiveOllamaBaseUrl: string;
  expandedProvider: 'ollama' | 'gemini' | null;
  geminiAvailability?: { modelAvailable?: boolean; error?: string | null };
  geminiDataUpdatedAt: number;
  geminiModels: AdminAiModelCatalogEntry[];
  geminiProviderStatus: string;
  geminiProviderTone: 'enabled' | 'inactive' | 'warning';
  isSaving: boolean;
  ollamaDataUpdatedAt: number;
  ollamaIsFetching: boolean;
  ollamaModels: AdminAiModelCatalogEntry[];
  ollamaProviderStatus: string;
  ollamaProviderTone: 'enabled' | 'inactive' | 'warning';
  onExpandedProviderChange: (provider: 'ollama' | 'gemini' | null) => void;
  onTestGeminiConnection: () => void;
  onTestOllamaConnection: () => void;
  onUseGeminiForChat: () => void;
  onUseOllamaForChat: () => void;
}

export function AdminAiProviderSection({
  aiDraft,
  effectiveOllamaBaseUrl,
  expandedProvider,
  geminiAvailability,
  geminiDataUpdatedAt,
  geminiModels,
  geminiProviderStatus,
  geminiProviderTone,
  isSaving,
  ollamaDataUpdatedAt,
  ollamaIsFetching,
  ollamaModels,
  ollamaProviderStatus,
  ollamaProviderTone,
  onExpandedProviderChange,
  onTestGeminiConnection,
  onTestOllamaConnection,
  onUseGeminiForChat,
  onUseOllamaForChat,
}: AdminAiProviderSectionProps) {
  return (
    <AiSettingsSection
      title="Providers"
      description="Manage AI providers for this instance."
      actions={
        <Button type="button" size="sm" variant="outline" disabled>
          <Plus size={14} />
          Add provider
        </Button>
      }
    >
      <Box
        rounded="md"
        borderWidth="1px"
        borderColor="border.surface"
        bg="bg.surface"
        overflow="hidden"
      >
        <Table.ScrollArea>
          <Table.Root
            size="sm"
            variant="line"
            textStyle="table"
            css={{
              '& thead th': {
                paddingBlock: '0.625rem',
                color: 'var(--chakra-colors-fg-muted)',
                fontWeight: '600',
                borderColor: 'var(--chakra-colors-border-surface)',
              },
              '& tbody td': {
                borderColor: 'var(--chakra-colors-border-divider)',
                verticalAlign: 'middle',
              },
              '& tbody tr:last-of-type td': {
                borderBottomWidth: '0',
              },
            }}
          >
            <Table.Header>
              <Table.Row>
                <Table.ColumnHeader minW="17rem">Provider</Table.ColumnHeader>
                <Table.ColumnHeader minW="9rem">Status</Table.ColumnHeader>
                <Table.ColumnHeader minW="8rem">Models</Table.ColumnHeader>
                <Table.ColumnHeader minW="11rem">Last checked</Table.ColumnHeader>
                <Table.ColumnHeader minW="10rem">Actions</Table.ColumnHeader>
                <Table.ColumnHeader w="3rem" />
              </Table.Row>
            </Table.Header>
            <Table.Body>
              <ProviderTableRow
                icon={<Sparkles size={18} />}
                name="Google Gemini"
                status={geminiProviderStatus}
                statusTone={geminiProviderTone}
                modelCount={geminiModels.length}
                updatedAt={geminiDataUpdatedAt}
                actionLabel={expandedProvider === 'gemini' ? 'Hide' : 'View'}
                actionAriaLabel={
                  expandedProvider === 'gemini'
                    ? 'Hide Google Gemini provider'
                    : 'View Google Gemini provider'
                }
                onAction={() =>
                  onExpandedProviderChange(expandedProvider === 'gemini' ? null : 'gemini')
                }
              />
              {expandedProvider === 'gemini' ? (
                <ProviderDetailsRow>
                  <ProviderDetailsPanel>
                    <ProviderDetailCard
                      title="Connection information"
                      description="Gemini chat uses Google AI Studio's OpenAI-compatible API."
                      action={
                        aiDraft.chat.provider === 'gemini' ? (
                          <SettingsStatusBadge tone="enabled" density="compact">
                            Active for chat
                          </SettingsStatusBadge>
                        ) : (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={!geminiAvailability?.modelAvailable || isSaving}
                            onClick={onUseGeminiForChat}
                          >
                            Use for chat
                          </Button>
                        )
                      }
                    />
                    <ProviderDetailCard
                      title="Health status"
                      value={
                        <Text
                          textStyle="sm"
                          color={geminiAvailability?.error ? 'fg.error' : 'fg'}
                          overflowWrap="anywhere"
                        >
                          {geminiAvailability?.error ?? geminiProviderStatus}
                        </Text>
                      }
                    />
                    <ProviderModelsCard models={geminiModels.map((model) => model.model)} />
                    <ProviderDetailCard
                      title="Test connection"
                      description="Refresh provider availability from the API server."
                      action={
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={geminiProviderStatus === 'Checking'}
                          onClick={onTestGeminiConnection}
                        >
                          {geminiProviderStatus === 'Checking' ? 'Checking...' : 'Test connection'}
                        </Button>
                      }
                    />
                  </ProviderDetailsPanel>
                </ProviderDetailsRow>
              ) : null}

              <ProviderTableRow
                icon={<Server size={18} />}
                name="Ollama"
                description="Self-hosted"
                status={ollamaProviderStatus}
                statusTone={ollamaProviderTone}
                modelCount={ollamaModels.length}
                updatedAt={ollamaDataUpdatedAt}
                actionLabel={expandedProvider === 'ollama' ? 'Hide' : 'View'}
                actionAriaLabel={expandedProvider === 'ollama' ? 'Hide details' : 'View details'}
                onAction={() =>
                  onExpandedProviderChange(expandedProvider === 'ollama' ? null : 'ollama')
                }
              />
              {expandedProvider === 'ollama' ? (
                <ProviderDetailsRow>
                  <ProviderDetailsPanel>
                    <ProviderDetailCard
                      title="Connection information"
                      description="Provider used for chat completions, translation, and embeddings."
                      action={
                        aiDraft.chat.provider === 'ollama' ? (
                          <SettingsStatusBadge tone="enabled" density="compact">
                            Active for chat
                          </SettingsStatusBadge>
                        ) : (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={
                              !effectiveOllamaBaseUrl.trim() ||
                              ollamaProviderStatus !== 'Healthy' ||
                              isSaving
                            }
                            onClick={onUseOllamaForChat}
                          >
                            Use for chat
                          </Button>
                        )
                      }
                    />
                    <ProviderDetailCard
                      title="Ollama endpoint"
                      description="Configured on the API server with ARKIVRA_OLLAMA_HOST."
                      value={
                        <Text textStyle="sm" color="fg" fontFamily="mono" overflowWrap="anywhere">
                          {effectiveOllamaBaseUrl}
                        </Text>
                      }
                    />
                    <ProviderDetailCard
                      title="Health status"
                      value={
                        <Text
                          textStyle="sm"
                          color={ollamaProviderStatus === 'Error' ? 'fg.error' : 'fg'}
                          overflowWrap="anywhere"
                        >
                          {ollamaProviderStatus}
                        </Text>
                      }
                    />
                    <ProviderModelsCard models={ollamaModels.map((model) => model.model)} />
                    <ProviderDetailCard
                      title="Test connection"
                      description="Refresh provider availability from the API server."
                      action={
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={ollamaIsFetching || effectiveOllamaBaseUrl.trim().length === 0}
                          onClick={onTestOllamaConnection}
                        >
                          {ollamaIsFetching ? 'Checking...' : 'Test connection'}
                        </Button>
                      }
                    />
                  </ProviderDetailsPanel>
                </ProviderDetailsRow>
              ) : null}

              <ProviderTableRow
                icon={<Server size={18} />}
                name="OpenRouter"
                description="Not configured"
                status="Not configured"
                statusTone="inactive"
                modelCount={0}
                updatedAt={0}
                actionLabel="View"
                actionAriaLabel="View OpenRouter provider"
                disabled
                onAction={() => undefined}
              />
            </Table.Body>
          </Table.Root>
        </Table.ScrollArea>
      </Box>
    </AiSettingsSection>
  );
}

function ProviderDetailsPanel({ children }: { children: ReactNode }) {
  return (
    <SimpleGrid columns={{ base: 1, xl: 2 }} gap="3" minW="0">
      {children}
    </SimpleGrid>
  );
}

function ProviderDetailCard({
  action,
  description,
  title,
  value,
}: {
  title: string;
  description?: ReactNode;
  value?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <Flex
      direction={{ base: 'column', md: 'row' }}
      align={{ base: 'stretch', md: 'flex-start' }}
      justify="space-between"
      gap="3"
      minW="0"
      rounded="md"
      borderWidth="1px"
      borderColor="border.surface"
      bg="bg.surface"
      p="3"
    >
      <Stack gap="1" minW="0">
        <Text textStyle="sm" fontWeight="semibold" color="fg">
          {title}
        </Text>
        {description ? (
          <Text textStyle="sm" color="fg.muted" overflowWrap="anywhere">
            {description}
          </Text>
        ) : null}
        {value ? <Box minW="0">{value}</Box> : null}
      </Stack>
      {action ? (
        <Flex flexShrink={0} justify={{ base: 'flex-start', md: 'flex-end' }}>
          {action}
        </Flex>
      ) : null}
    </Flex>
  );
}

function ProviderModelsCard({ models }: { models: string[] }) {
  return (
    <Box
      minW="0"
      rounded="md"
      borderWidth="1px"
      borderColor="border.surface"
      bg="bg.surface"
      p="3"
      gridColumn={{ base: 'auto', xl: '1 / -1' }}
    >
      <Stack gap="2" minW="0">
        <HStack justify="space-between" gap="3" align="center">
          <Text textStyle="sm" fontWeight="semibold" color="fg">
            Available models
          </Text>
          <Badge variant="secondary" flexShrink={0}>
            {models.length.toLocaleString()}
          </Badge>
        </HStack>
        {models.length > 0 ? (
          <Flex gap="2" wrap="wrap" minW="0">
            {models.map((model) => (
              <Badge
                key={model}
                variant="outline"
                colorPalette="gray"
                maxW="full"
                whiteSpace="normal"
                wordBreak="break-word"
              >
                {model}
              </Badge>
            ))}
          </Flex>
        ) : (
          <Text textStyle="sm" color="fg.muted">
            No catalog models.
          </Text>
        )}
      </Stack>
    </Box>
  );
}

function ProviderTableRow({
  actionAriaLabel,
  actionLabel,
  description,
  disabled = false,
  icon,
  modelCount,
  name,
  status,
  statusTone,
  updatedAt,
  onAction,
}: {
  actionAriaLabel: string;
  actionLabel: string;
  description?: string;
  disabled?: boolean;
  icon: ReactNode;
  modelCount: number;
  name: string;
  status: string;
  statusTone: 'enabled' | 'inactive' | 'warning';
  updatedAt: number;
  onAction: () => void;
}) {
  return (
    <Table.Row>
      <Table.Cell>
        <HStack gap="3" minW="0">
          <Flex
            boxSize="8"
            align="center"
            justify="center"
            rounded="md"
            bg="bg.subtle"
            color="fg"
            flexShrink={0}
            aria-hidden="true"
          >
            {icon}
          </Flex>
          <Stack gap="0" minW="0">
            <Text textStyle="sm" fontWeight="semibold" color="fg" truncate>
              {name}
            </Text>
            {description ? (
              <Text textStyle="xs" color="fg.muted" truncate>
                {description}
              </Text>
            ) : null}
          </Stack>
        </HStack>
      </Table.Cell>
      <Table.Cell>
        <SettingsStatusBadge tone={statusTone} density="compact">
          {status}
        </SettingsStatusBadge>
      </Table.Cell>
      <Table.Cell>
        <Text textStyle="sm" color="fg.muted">
          {modelCount.toLocaleString()} models
        </Text>
      </Table.Cell>
      <Table.Cell>
        <Text textStyle="sm" color="fg.muted">
          {updatedAt ? formatDate(new Date(updatedAt).toISOString()) : 'Not checked'}
        </Text>
      </Table.Cell>
      <Table.Cell>
        <Button
          type="button"
          size="sm"
          variant="outline"
          aria-label={actionAriaLabel}
          disabled={disabled}
          onClick={onAction}
        >
          {actionLabel}
        </Button>
      </Table.Cell>
      <Table.Cell>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          aria-label={`${name} provider actions`}
          disabled={disabled}
        >
          <MoreVertical size={16} />
        </Button>
      </Table.Cell>
    </Table.Row>
  );
}

function ProviderDetailsRow({ children }: { children: ReactNode }) {
  return (
    <Table.Row>
      <Table.Cell colSpan={6} bg="bg.subtle" p="0">
        <Box px="3" py="2">
          {children}
        </Box>
      </Table.Cell>
    </Table.Row>
  );
}

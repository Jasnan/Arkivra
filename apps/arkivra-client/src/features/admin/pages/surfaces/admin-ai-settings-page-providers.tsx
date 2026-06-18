import type { ReactNode } from 'react';
import { Box, Flex, HStack, Stack, Table, Text } from '@chakra-ui/react';
import { MoreVertical, Plus, Server, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { AdminAiSettings } from '@/features/admin/admin.types';
import { formatDate } from '@/features/documents/documents.utils';
import {
  SettingsRow,
  SettingsRows,
  SettingsStatusBadge,
} from '@/features/settings/components/settings-ui';
import { curatedGeminiChatModels } from './admin-ai-settings-page-model-catalog';
import { AiSettingsSection } from './admin-ai-settings-page-sections';

interface AdminAiProviderSectionProps {
  aiDraft: AdminAiSettings;
  effectiveOllamaBaseUrl: string;
  expandedProvider: 'ollama' | 'gemini' | null;
  geminiAvailability?: { modelAvailable?: boolean; error?: string | null };
  geminiDataUpdatedAt: number;
  geminiProviderStatus: string;
  geminiProviderTone: 'enabled' | 'inactive' | 'warning';
  isSaving: boolean;
  ollamaDataUpdatedAt: number;
  ollamaIsFetching: boolean;
  ollamaModels: Array<{ name: string }>;
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
                description="Primary provider"
                status={geminiProviderStatus}
                statusTone={geminiProviderTone}
                modelCount={curatedGeminiChatModels.length}
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
                  <SettingsRows density="compact">
                    <SettingsRow
                      density="compact"
                      label="Connection information"
                      description="Gemini chat uses Google AI Studio's OpenAI-compatible API."
                      control={
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
                    <SettingsRow
                      density="compact"
                      label="Health status"
                      meta={
                        <Text textStyle="sm" color={geminiAvailability?.error ? 'fg.error' : 'fg'}>
                          {geminiAvailability?.error ?? geminiProviderStatus}
                        </Text>
                      }
                    />
                    <SettingsRow
                      density="compact"
                      label="Available models"
                      meta={curatedGeminiChatModels.join(', ')}
                    />
                    <SettingsRow
                      density="compact"
                      label="Test connection"
                      control={
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
                  </SettingsRows>
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
                actionLabel={expandedProvider === 'ollama' ? 'Hide' : 'Configure'}
                actionAriaLabel={
                  expandedProvider === 'ollama' ? 'Hide details' : 'View details'
                }
                onAction={() =>
                  onExpandedProviderChange(expandedProvider === 'ollama' ? null : 'ollama')
                }
              />
              {expandedProvider === 'ollama' ? (
                <ProviderDetailsRow>
                  <SettingsRows density="compact">
                    <SettingsRow
                      density="compact"
                      label="Connection information"
                      description="Provider used for chat completions, translation, and embeddings."
                      control={
                        aiDraft.chat.provider === 'ollama' ? (
                          <SettingsStatusBadge tone="enabled" density="compact">
                            Active for chat
                          </SettingsStatusBadge>
                        ) : (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={!effectiveOllamaBaseUrl.trim() || isSaving}
                            onClick={onUseOllamaForChat}
                          >
                            Use for chat
                          </Button>
                        )
                      }
                    />
                    <SettingsRow
                      density="compact"
                      label="Ollama endpoint"
                      description="Configured on the API server with ARKIVRA_OLLAMA_HOST."
                      meta={
                        <Text textStyle="sm" color="fg" fontFamily="mono">
                          {effectiveOllamaBaseUrl}
                        </Text>
                      }
                    />
                    <SettingsRow
                      density="compact"
                      label="Health status"
                      meta={
                        <Text
                          textStyle="sm"
                          color={ollamaProviderStatus === 'Error' ? 'fg.error' : 'fg'}
                        >
                          {ollamaProviderStatus}
                        </Text>
                      }
                    />
                    <SettingsRow
                      density="compact"
                      label="Available models"
                      meta={
                        <Text textStyle="sm" color="fg">
                          {ollamaModels.map((model) => model.name).join(', ') ||
                            'No models discovered'}
                        </Text>
                      }
                    />
                    <SettingsRow
                      density="compact"
                      label="Test connection"
                      control={
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
                  </SettingsRows>
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
                actionLabel="Configure"
                actionAriaLabel="Configure OpenRouter provider"
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
  description: string;
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
            <Text textStyle="xs" color="fg.muted" truncate>
              {description}
            </Text>
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

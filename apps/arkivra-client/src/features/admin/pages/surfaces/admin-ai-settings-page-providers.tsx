import { Box, Grid, Stack, Text } from '@chakra-ui/react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
  onOllamaBaseUrlChange: (baseUrl: string) => void;
  onPersistProviderSettings: () => void;
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
  onOllamaBaseUrlChange,
  onPersistProviderSettings,
  onTestGeminiConnection,
  onTestOllamaConnection,
  onUseGeminiForChat,
  onUseOllamaForChat,
}: AdminAiProviderSectionProps) {
  return (
    <AiSettingsSection
      title="Provider"
      description="Ollama provider configuration, with additional provider slots reserved for future support."
      actions={
        <Button type="button" size="sm" variant="outline" disabled>
          <Plus size={14} />
          Add Provider
        </Button>
      }
    >
      <Stack
        gap="2"
        rounded="md"
        borderWidth="1px"
        borderColor="border.surface"
        bg="bg.surface"
        overflow="hidden"
      >
        <Box>
          <ProviderSummaryRow
            name="Ollama"
            description="Chat and embedding provider"
            status={ollamaProviderStatus}
            statusTone={ollamaProviderTone}
            modelCount={ollamaModels.length}
            updatedAt={ollamaDataUpdatedAt}
            actionLabel={expandedProvider === 'ollama' ? 'Hide details' : 'View details'}
            actionAriaLabel={expandedProvider === 'ollama' ? 'Hide details' : 'View details'}
            onAction={() =>
              onExpandedProviderChange(expandedProvider === 'ollama' ? null : 'ollama')
            }
          />
          {expandedProvider === 'ollama' ? (
            <Box borderTopWidth="1px" borderColor="border.surface" bg="bg.subtle" px="3" py="2">
              <SettingsRows density="compact">
                <SettingsRow
                  density="compact"
                  label="Connection information"
                  description="Provider used for chat completions and embeddings."
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
                  label="Ollama base URL"
                  description="The Ollama endpoint used for chat, translation, and embeddings."
                  control={
                    <Input
                      aria-label="Ollama base URL"
                      type="url"
                      value={effectiveOllamaBaseUrl}
                      placeholder="http://127.0.0.1:11434"
                      onBlur={onPersistProviderSettings}
                      onChange={(event) => onOllamaBaseUrlChange(event.target.value)}
                    />
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
            </Box>
          ) : null}
        </Box>

        <Box borderTopWidth="1px" borderColor="border.surface">
          <ProviderSummaryRow
            name="Google Gemini"
            description="Provider support reserved for this instance"
            status={geminiProviderStatus}
            statusTone={geminiProviderTone}
            modelCount={curatedGeminiChatModels.length}
            updatedAt={geminiDataUpdatedAt}
            actionLabel={expandedProvider === 'gemini' ? 'Hide details' : 'View details'}
            actionAriaLabel={
              expandedProvider === 'gemini'
                ? 'Hide Google Gemini details'
                : 'View Google Gemini provider'
            }
            onAction={() =>
              onExpandedProviderChange(expandedProvider === 'gemini' ? null : 'gemini')
            }
          />
          {expandedProvider === 'gemini' ? (
            <Box borderTopWidth="1px" borderColor="border.surface" bg="bg.subtle" px="3" py="2">
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
            </Box>
          ) : null}
        </Box>
      </Stack>
    </AiSettingsSection>
  );
}

function ProviderSummaryRow({
  actionAriaLabel,
  actionLabel,
  description,
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
  modelCount: number;
  name: string;
  status: string;
  statusTone: 'enabled' | 'inactive' | 'warning';
  updatedAt: number;
  onAction: () => void;
}) {
  return (
    <Grid
      templateColumns={{
        base: '1fr',
        lg: 'minmax(10rem, 1fr) 8rem 7rem minmax(10rem, 0.8fr) auto',
      }}
      gap="3"
      alignItems="center"
      px="3"
      py="2.5"
    >
      <Stack gap="0.5" minW="0">
        <Text textStyle="sm" fontWeight="semibold" color="fg">
          {name}
        </Text>
        <Text textStyle="xs" color="fg.muted">
          {description}
        </Text>
      </Stack>
      <SettingsStatusBadge tone={statusTone} density="compact">
        {status}
      </SettingsStatusBadge>
      <Text textStyle="sm" color="fg.muted">
        {modelCount} models
      </Text>
      <Text textStyle="sm" color="fg.muted">
        {updatedAt ? formatDate(new Date(updatedAt).toISOString()) : 'Not checked'}
      </Text>
      <Button
        type="button"
        size="sm"
        variant="outline"
        aria-label={actionAriaLabel}
        justifySelf={{ base: 'start', lg: 'end' }}
        onClick={onAction}
      >
        {actionLabel}
      </Button>
    </Grid>
  );
}

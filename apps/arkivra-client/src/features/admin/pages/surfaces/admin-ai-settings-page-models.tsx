import { Flex, HStack, SimpleGrid, Stack, Text } from '@chakra-ui/react';
import { Languages, Package, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { AdminAiSettings } from '@/features/admin/admin.types';
import { SettingsStatusBadge } from '@/features/settings/components/settings-ui';
import type { SettingsStatusTone } from '@/features/settings/components/settings-ui';
import { formatProvider } from './admin-ai-settings-page-model-catalog';
import type { EmbeddingModelOption } from './admin-ai-settings-page-model-catalog';
import { AiSettingsSection } from './admin-ai-settings-page-sections';

interface AdminAiModelSectionsProps {
  aiDraft: AdminAiSettings;
  chatModelOptions: string[];
  configuredEmbeddingDimensions: number;
  configuredEmbeddingModel: string;
  configuredEmbeddingProvider: AdminAiSettings['embedding']['provider'];
  effectiveAllowedChatModels: string[];
  effectiveDefaultChatModel: string;
  effectiveTranslationModel: string;
  embeddingModelOptions: EmbeddingModelOption[];
  isEmbeddingConfigValid: boolean;
  isSaving: boolean;
  savedEmbedding: AdminAiSettings['embedding'];
  semanticIndexTone: SettingsStatusTone;
  semanticStatus: string;
  translationConnectionStatus: string;
  translationModelCount: number;
  onChangeEmbeddingModel: (key: string) => void;
  onConfigureChatModels: () => void;
  onOpenEmbeddingModelDialog: () => void;
  onOpenTranslationModelDialog: () => void;
}

export function AdminAiModelSections({
  aiDraft,
  chatModelOptions,
  configuredEmbeddingDimensions,
  configuredEmbeddingModel,
  configuredEmbeddingProvider,
  effectiveAllowedChatModels,
  effectiveDefaultChatModel,
  effectiveTranslationModel,
  embeddingModelOptions,
  isEmbeddingConfigValid,
  isSaving,
  savedEmbedding,
  semanticIndexTone,
  semanticStatus,
  translationConnectionStatus,
  translationModelCount,
  onChangeEmbeddingModel,
  onConfigureChatModels,
  onOpenEmbeddingModelDialog,
  onOpenTranslationModelDialog,
}: AdminAiModelSectionsProps) {
  return (
    <SimpleGrid columns={{ base: 1, xl: 3 }} gap="3" alignItems="stretch">
      <AiSettingsSection
        title="Embedding"
        description="Configure the model used to create vector embeddings for semantic search."
        minH="19rem"
      >
        <Stack gap="4">
          <Stack gap="2">
            <Text textStyle="xs" fontWeight="semibold" color="fg.muted">
              Selected model
            </Text>
            <ModelSummary
              icon={<Package size={17} />}
              title={configuredEmbeddingModel || 'Not selected'}
              description={`${formatProvider(configuredEmbeddingProvider)} · ${configuredEmbeddingDimensions.toLocaleString()} dimensions`}
              badgeTone={configuredEmbeddingModel ? 'enabled' : 'inactive'}
              badgeLabel={configuredEmbeddingModel ? 'Selected' : 'Not selected'}
            />
          </Stack>
          <HStack gap="2" align="center">
            <Text textStyle="xs" fontWeight="semibold" color="fg.muted">
              Status
            </Text>
            <SettingsStatusBadge tone={semanticIndexTone} density="compact">
              {semanticStatus}
            </SettingsStatusBadge>
          </HStack>
          <Button
            type="button"
            variant="outline"
            size="sm"
            alignSelf="flex-start"
            disabled={!isEmbeddingConfigValid || isSaving}
            onClick={() => {
              const currentOption =
                embeddingModelOptions.find(
                  (option) =>
                    option.provider === savedEmbedding.provider &&
                    option.baseUrl === savedEmbedding.baseUrl &&
                    option.model === savedEmbedding.model,
                ) ?? embeddingModelOptions[0];

              onChangeEmbeddingModel(currentOption?.key ?? '');
              onOpenEmbeddingModelDialog();
            }}
          >
            Change model
          </Button>
        </Stack>
      </AiSettingsSection>

      <AiSettingsSection
        title="Chat"
        description="Configure the model used for AI chat responses."
        minH="19rem"
      >
        <Stack gap="4">
          <Stack gap="2">
            <Text textStyle="xs" fontWeight="semibold" color="fg.muted">
              Selected model
            </Text>
            <ModelSummary
              icon={<Send size={17} />}
              title={effectiveDefaultChatModel || 'Not selected'}
              description={`${formatProvider(aiDraft.chat.provider)}${aiDraft.chat.baseUrl ? ` · ${aiDraft.chat.baseUrl}` : ''}`}
              badgeTone={effectiveDefaultChatModel ? 'enabled' : 'inactive'}
              badgeLabel={effectiveDefaultChatModel ? 'Default' : 'Not selected'}
            />
          </Stack>
          <Stack gap="1.5">
            <Text textStyle="xs" color="fg.muted">
              Models available to users
            </Text>
            <HStack gap="2" flexWrap="wrap">
              <SettingsStatusBadge
                tone={effectiveAllowedChatModels.length > 0 ? 'enabled' : 'inactive'}
                density="compact"
              >
                {effectiveAllowedChatModels.length.toLocaleString()} allowed
              </SettingsStatusBadge>
              <Text textStyle="xs" color="fg.muted">
                Embedding models are omitted from chat choices.
              </Text>
            </HStack>
          </Stack>
          <Button
            type="button"
            variant="outline"
            size="sm"
            alignSelf="flex-start"
            disabled={chatModelOptions.length === 0 || isSaving}
            onClick={onConfigureChatModels}
          >
            Configure chat models
          </Button>
        </Stack>
      </AiSettingsSection>

      <AiSettingsSection
        title="Translation"
        description="Configure the model used for document translation."
        minH="19rem"
      >
        <Stack gap="4">
          <Stack gap="2">
            <Text textStyle="xs" fontWeight="semibold" color="fg.muted">
              Selected model
            </Text>
            <ModelSummary
              icon={<Languages size={17} />}
              title={effectiveTranslationModel || 'Not selected'}
              description={`${formatProvider(aiDraft.translation.provider)}${
                aiDraft.translation.baseUrl || aiDraft.chat.baseUrl
                  ? ` · ${aiDraft.translation.baseUrl || aiDraft.chat.baseUrl}`
                  : ''
              }`}
              badgeTone={effectiveTranslationModel ? 'enabled' : 'inactive'}
              badgeLabel={effectiveTranslationModel ? 'Selected' : 'Not selected'}
            />
          </Stack>
          <Text textStyle="xs" color="fg.muted">
            Choose a multimodal model that can accept image input for scanned and image-only
            document pages.
          </Text>
          <HStack gap="2" align="center">
            <Text textStyle="xs" fontWeight="semibold" color="fg.muted">
              Status
            </Text>
            <SettingsStatusBadge
              tone={
                translationConnectionStatus === 'Healthy'
                  ? 'enabled'
                  : translationConnectionStatus === 'Error'
                    ? 'warning'
                    : 'inactive'
              }
              density="compact"
            >
              {translationConnectionStatus}
            </SettingsStatusBadge>
          </HStack>
          <Button
            type="button"
            variant="outline"
            size="sm"
            alignSelf="flex-start"
            disabled={translationModelCount === 0 || isSaving}
            onClick={onOpenTranslationModelDialog}
          >
            Change model
          </Button>
        </Stack>
      </AiSettingsSection>
    </SimpleGrid>
  );
}

function ModelSummary({
  badgeLabel,
  badgeTone,
  description,
  icon,
  title,
}: {
  badgeLabel: string;
  badgeTone: 'enabled' | 'inactive';
  description: string;
  icon: React.ReactNode;
  title: string;
}) {
  return (
    <Flex
      align="center"
      justify="space-between"
      gap="3"
      rounded="md"
      borderWidth="1px"
      borderColor="border.surface"
      bg="bg.surface"
      px="3"
      py="2"
    >
      <HStack gap="2.5" minW="0">
        <Flex
          boxSize="7"
          align="center"
          justify="center"
          rounded="md"
          borderWidth="1px"
          borderColor="border.surface"
          bg="bg.subtle"
          color="fg.muted"
          flexShrink={0}
        >
          {icon}
        </Flex>
        <Stack gap="0" minW="0">
          <Text textStyle="sm" fontWeight="semibold" color="fg" truncate>
            {title}
          </Text>
          <Text textStyle="xs" color="fg.muted" truncate>
            {description}
          </Text>
        </Stack>
      </HStack>
      <SettingsStatusBadge tone={badgeTone} density="compact">
        {badgeLabel}
      </SettingsStatusBadge>
    </Flex>
  );
}

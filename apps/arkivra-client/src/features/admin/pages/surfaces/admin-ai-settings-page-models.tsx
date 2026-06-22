import type { ReactNode } from 'react';
import { Box, Flex, HStack, Stack, Table, Text } from '@chakra-ui/react';
import { Languages, MessageSquare, Package } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { AdminAiSettings } from '@/features/admin/admin.types';
import { SettingsStatusBadge } from '@/features/settings/components/settings-ui';
import { formatProvider, isSameOllamaModel } from './admin-ai-settings-page-model-catalog';
import type { EmbeddingModelOption } from './admin-ai-settings-page-model-catalog';
import { AiSettingsSection } from './admin-ai-settings-page-sections';

interface AdminAiModelSectionsProps {
  aiDraft: AdminAiSettings;
  chatModelOptions: string[];
  configuredEmbeddingDimensions: number;
  configuredEmbeddingModel: string;
  configuredEmbeddingProvider: AdminAiSettings['embedding']['provider'];
  effectiveDefaultChatModel: string;
  effectiveTranslationModel: string;
  embeddingModelOptions: EmbeddingModelOption[];
  isChatModelAvailable: boolean;
  isEmbeddingModelAvailable: boolean;
  isSaving: boolean;
  isTranslationModelAvailable: boolean;
  savedEmbedding: AdminAiSettings['embedding'];
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
  effectiveDefaultChatModel,
  effectiveTranslationModel,
  embeddingModelOptions,
  isChatModelAvailable,
  isEmbeddingModelAvailable,
  isSaving,
  isTranslationModelAvailable,
  savedEmbedding,
  translationModelCount,
  onChangeEmbeddingModel,
  onConfigureChatModels,
  onOpenEmbeddingModelDialog,
  onOpenTranslationModelDialog,
}: AdminAiModelSectionsProps) {
  function openEmbeddingDialog() {
    const currentOption =
      embeddingModelOptions.find(
        (option) =>
          option.provider === savedEmbedding.provider &&
          option.baseUrl === savedEmbedding.baseUrl &&
          isSameOllamaModel(option.model, savedEmbedding.model),
      ) ?? embeddingModelOptions[0];

    onChangeEmbeddingModel(currentOption?.key ?? '');
    onOpenEmbeddingModelDialog();
  }

  return (
    <AiSettingsSection
      title="Model Configuration"
      description="Select the models Arkivra will use."
      actions={
        <HStack gap="2" flexWrap="wrap" justify="flex-end">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={embeddingModelOptions.length === 0 || isSaving}
            onClick={openEmbeddingDialog}
          >
            Change embedding
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={chatModelOptions.length === 0 || isSaving}
            onClick={onConfigureChatModels}
          >
            Change chat
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={translationModelCount === 0 || isSaving}
            onClick={onOpenTranslationModelDialog}
          >
            Change translation
          </Button>
        </HStack>
      }
    >
      <Stack gap="2">
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
                '& tbody tr': {
                  height: '4rem',
                  borderColor: 'var(--chakra-colors-border-divider)',
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
                  <Table.ColumnHeader minW="18rem">Requirement</Table.ColumnHeader>
                  <Table.ColumnHeader minW="14rem">Selected model</Table.ColumnHeader>
                  <Table.ColumnHeader minW="11rem">Provider</Table.ColumnHeader>
                  <Table.ColumnHeader minW="8rem">Status</Table.ColumnHeader>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                <ModelConfigRow
                  icon={<Package size={18} />}
                  title="Embedding model"
                  description="Used for semantic search indexing"
                  model={configuredEmbeddingModel || 'Not selected'}
                  modelDescription={
                    configuredEmbeddingModel
                      ? `${configuredEmbeddingDimensions.toLocaleString()} dimensions`
                      : 'Connect a provider before selecting models'
                  }
                  provider={formatProvider(configuredEmbeddingProvider)}
                  isSelected={configuredEmbeddingModel.length > 0}
                  isAvailable={isEmbeddingModelAvailable}
                />
                <ModelConfigRow
                  icon={<MessageSquare size={18} />}
                  title="Chat model"
                  description="Used for AI chat responses"
                  model={effectiveDefaultChatModel || 'Not selected'}
                  modelDescription={effectiveDefaultChatModel ? 'LLM' : 'No chat model selected'}
                  provider={formatProvider(aiDraft.chat.provider)}
                  isSelected={effectiveDefaultChatModel.length > 0}
                  isAvailable={isChatModelAvailable}
                />
                <ModelConfigRow
                  icon={<Languages size={18} />}
                  title="Translation model"
                  description="Used for document translation"
                  model={effectiveTranslationModel || 'Not selected'}
                  modelDescription={
                    effectiveTranslationModel
                      ? 'Vision / multimodal'
                      : 'No translation model selected'
                  }
                  provider={formatProvider(aiDraft.translation.provider)}
                  isSelected={effectiveTranslationModel.length > 0}
                  isAvailable={isTranslationModelAvailable}
                />
              </Table.Body>
            </Table.Root>
          </Table.ScrollArea>
        </Box>
        <Text textStyle="xs" color="fg.muted">
          Translation model must be multimodal and support text and image input.
        </Text>
      </Stack>
    </AiSettingsSection>
  );
}

function ModelConfigRow({
  description,
  icon,
  isSelected,
  isAvailable,
  model,
  modelDescription,
  provider,
  title,
}: {
  description: string;
  icon: ReactNode;
  isSelected: boolean;
  isAvailable: boolean;
  model: string;
  modelDescription: string;
  provider: string;
  title: string;
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
            color="fg"
            bg="bg.subtle"
            flexShrink={0}
            aria-hidden="true"
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
      </Table.Cell>
      <Table.Cell>
        <Stack gap="0" minW="0">
          <Text textStyle="sm" fontWeight="semibold" color="fg" truncate>
            {model}
          </Text>
          <Text textStyle="xs" color="fg.muted" truncate>
            {modelDescription}
          </Text>
        </Stack>
      </Table.Cell>
      <Table.Cell>
        <Text textStyle="sm" color="fg">
          {provider}
        </Text>
      </Table.Cell>
      <Table.Cell>
        <SettingsStatusBadge
          tone={isSelected && isAvailable ? 'enabled' : isSelected ? 'warning' : 'inactive'}
          density="compact"
        >
          {isSelected && isAvailable ? 'Selected' : isSelected ? 'Unavailable' : 'Missing'}
        </SettingsStatusBadge>
      </Table.Cell>
    </Table.Row>
  );
}

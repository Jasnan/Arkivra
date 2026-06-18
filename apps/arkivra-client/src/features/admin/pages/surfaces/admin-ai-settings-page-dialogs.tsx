import { Box, Flex, Grid, HStack, Stack, Text } from '@chakra-ui/react';
import { AlertTriangle } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import type { AdminAiSettings } from '@/features/admin/admin.types';
import { formatProvider } from './admin-ai-settings-page-model-catalog';
import type { EmbeddingModelOption } from './admin-ai-settings-page-model-catalog';

export function ChatModelsDialog({
  open,
  aiDraft,
  chatModelOptions,
  draftAllowedChatModels,
  draftDefaultChatModel,
  isFetchingChatModels,
  isSaving,
  onAllowedModelChange,
  onDefaultModelChange,
  onOpenChange,
  onSave,
}: {
  open: boolean;
  aiDraft: AdminAiSettings;
  chatModelOptions: string[];
  draftAllowedChatModels: string[];
  draftDefaultChatModel: string;
  isFetchingChatModels: boolean;
  isSaving: boolean;
  onAllowedModelChange: (model: string, checked: boolean) => void;
  onDefaultModelChange: (model: string) => void;
  onOpenChange: (open: boolean) => void;
  onSave: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent maxW="40rem" w="calc(100vw - 2rem)">
        <DialogHeader px="5" pt="5" pb="3">
          <DialogTitle>Configure chat models</DialogTitle>
          <DialogDescription>
            Select which chat models users can choose and set the default model. Embedding models
            are omitted from this list.
          </DialogDescription>
        </DialogHeader>
        <DialogBody px="5" pb="4">
          <Box
            rounded="md"
            borderWidth="1px"
            borderColor="border.surface"
            bg="bg.surface"
            overflow="hidden"
          >
            <Box px="3" py="2" borderBottomWidth="1px" borderColor="border.surface">
              <Grid templateColumns="minmax(0, 1fr) minmax(7rem, auto)" gap="3" alignItems="center">
                <Text textStyle="sm" fontWeight="semibold" color="fg">
                  Available chat models
                </Text>
                <Text textStyle="xs" color="fg.muted" textAlign="end">
                  Default
                </Text>
              </Grid>
            </Box>
            {chatModelOptions.length > 0 ? (
              <RadioGroup
                name="default-chat-model"
                value={draftDefaultChatModel}
                onValueChange={onDefaultModelChange}
                gap="0"
                divideY="1px"
                divideColor="border.surface"
              >
                {chatModelOptions.map((model) => (
                  <Grid
                    key={model}
                    templateColumns="minmax(0, 1fr) minmax(7rem, auto)"
                    gap="3"
                    alignItems="center"
                    px="3"
                    py="2.5"
                    _hover={{ bg: 'bg.subtle' }}
                  >
                    <Checkbox
                      checked={draftAllowedChatModels.includes(model)}
                      disabled={model === draftDefaultChatModel}
                      onCheckedChange={(checked) => onAllowedModelChange(model, checked)}
                    >
                      <Stack gap="0" minW="0">
                        <Text
                          textStyle="sm"
                          fontWeight="semibold"
                          color={model === draftDefaultChatModel ? 'fg.muted' : 'fg'}
                          truncate
                        >
                          {model}
                        </Text>
                        <Text textStyle="xs" color="fg.muted" truncate>
                          {formatProvider(aiDraft.chat.provider)}
                          {aiDraft.chat.baseUrl ? ` · ${aiDraft.chat.baseUrl}` : ''}
                        </Text>
                      </Stack>
                    </Checkbox>
                    <HStack as="label" gap="2" justify="flex-end" cursor="pointer">
                      <RadioGroupItem value={model} />
                      <Text
                        textStyle="xs"
                        color={model === draftDefaultChatModel ? 'fg' : 'fg.muted'}
                      >
                        {model === draftDefaultChatModel ? 'Default' : 'Use'}
                      </Text>
                    </HStack>
                  </Grid>
                ))}
              </RadioGroup>
            ) : (
              <Text px="3" py="3" textStyle="sm" color="fg.muted">
                {isFetchingChatModels
                  ? 'Loading chat models from Ollama...'
                  : 'No chat models are available from the configured Ollama endpoint.'}
              </Text>
            )}
          </Box>
        </DialogBody>
        <DialogFooter px="5" pb="5" pt="0">
          <Button type="button" size="sm" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={draftDefaultChatModel.length === 0 || isSaving}
            onClick={onSave}
          >
            {isSaving ? 'Saving...' : 'Save chat models'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function EmbeddingModelDialog({
  open,
  aiDraft,
  embeddingModelOptions,
  selectedEmbeddingModel,
  selectedEmbeddingModelChanged,
  selectedEmbeddingModelKey,
  isFetchingOllamaModels,
  isSaving,
  onConfirm,
  onOpenChange,
  onSelectedModelKeyChange,
}: {
  open: boolean;
  aiDraft: AdminAiSettings;
  embeddingModelOptions: EmbeddingModelOption[];
  selectedEmbeddingModel: EmbeddingModelOption | null;
  selectedEmbeddingModelChanged: boolean;
  selectedEmbeddingModelKey: string;
  isFetchingOllamaModels: boolean;
  isSaving: boolean;
  onConfirm: () => void;
  onOpenChange: (open: boolean) => void;
  onSelectedModelKeyChange: (key: string) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent maxW="38rem" w="calc(100vw - 2rem)">
        <DialogHeader px="5" pt="5" pb="3">
          <DialogTitle>Change embedding model</DialogTitle>
          <DialogDescription>
            Select the model Arkivra should use for new semantic indexes. The live index keeps
            serving search until the new one is ready.
          </DialogDescription>
        </DialogHeader>
        <DialogBody px="5" pb="4">
          <Stack gap="4">
            <Box
              rounded="md"
              borderWidth="1px"
              borderColor="border.surface"
              bg="bg.surface"
              overflow="hidden"
            >
              <Box px="3" py="2" borderBottomWidth="1px" borderColor="border.surface">
                <Text textStyle="sm" fontWeight="semibold" color="fg">
                  Available embedding models
                </Text>
              </Box>
              {embeddingModelOptions.length > 0 ? (
                <RadioGroup
                  name="embedding-model"
                  value={selectedEmbeddingModelKey}
                  onValueChange={onSelectedModelKeyChange}
                  gap="0"
                  divideY="1px"
                  divideColor="border.surface"
                >
                  {embeddingModelOptions.map((option) => (
                    <Flex
                      key={option.key}
                      as="label"
                      align="center"
                      justify="space-between"
                      gap="3"
                      px="3"
                      py="2.5"
                      cursor="pointer"
                      _hover={{ bg: 'bg.subtle' }}
                    >
                      <HStack gap="2.5" minW="0" align="center">
                        <RadioGroupItem value={option.key} />
                        <Stack gap="0" minW="0">
                          <Text textStyle="sm" fontWeight="semibold" color="fg" truncate>
                            {option.model}
                          </Text>
                          <Text textStyle="xs" color="fg.muted" truncate>
                            {option.providerLabel}
                            {option.baseUrl ? ` · ${option.baseUrl}` : ''}
                          </Text>
                        </Stack>
                      </HStack>
                      <HStack gap="1.5" flexShrink={0}>
                        {option.isConfigured ? (
                          <Badge variant="secondary" colorPalette="teal">
                            Selected
                          </Badge>
                        ) : null}
                        {option.isActive && !option.isConfigured ? (
                          <Badge variant="outline">Live index</Badge>
                        ) : null}
                        {!option.isDiscovered ? (
                          <Badge variant="outline" colorPalette="gray">
                            Not listed
                          </Badge>
                        ) : null}
                      </HStack>
                    </Flex>
                  ))}
                </RadioGroup>
              ) : (
                <Text px="3" py="3" textStyle="sm" color="fg.muted">
                  {isFetchingOllamaModels
                    ? 'Loading models from Ollama...'
                    : 'No catalog embedding models were found from the configured Ollama endpoint.'}
                </Text>
              )}
            </Box>
            <Alert
              status="warning"
              colorPalette="orange"
              borderColor="orange.muted"
              bg="orange.subtle"
              alignItems="flex-start"
            >
              <AlertTriangle size={16} />
              <AlertDescription>
                <Stack gap="2">
                  <Text fontWeight="semibold">
                    Changing the embedding model requires rebuilding the semantic search index.
                  </Text>
                  <Stack as="ul" gap="1" ps="4">
                    <Text as="li">
                      The current index will remain available until the new index is ready.
                    </Text>
                    <Text as="li">
                      {aiDraft.aiFeaturesEnabled
                        ? 'A full reindexing job will run in the background.'
                        : 'When AI features are enabled, a full reindexing job will run in the background.'}
                    </Text>
                    <Text as="li">This may take several hours depending on your data size.</Text>
                  </Stack>
                </Stack>
              </AlertDescription>
            </Alert>
          </Stack>
        </DialogBody>
        <DialogFooter px="5" pb="5" pt="0">
          <Button type="button" size="sm" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={selectedEmbeddingModel === null || !selectedEmbeddingModelChanged || isSaving}
            onClick={onConfirm}
          >
            {isSaving ? 'Saving...' : 'Confirm and rebuild'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

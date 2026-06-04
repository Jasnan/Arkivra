import type { ChangeEvent, RefObject } from 'react';
import { Box, Flex, Text, chakra } from '@chakra-ui/react';
import { ComposerPrimitive } from '@assistant-ui/react';
import { Brain, Send } from 'lucide-react';
import { RadioDropdownMenu } from '@/components/ui/radio-dropdown-menu';
import type { ChatResponseMode } from '../chat.api';
import { AnswerModePicker } from './answer-mode-picker';
import type { DraftChatContext, DraftChatDocument, DraftChatVault } from './chat-context-selector';
import { ChatContextAddMenu, ContextChipList } from './chat-context-selector';

const ComposerRoot = chakra(ComposerPrimitive.Root);
const ComposerInput = chakra(ComposerPrimitive.Input);
const ComposerSend = chakra(ComposerPrimitive.Send);

export function AssistantChatComposer({
  disabled,
  placeholder,
  responseMode,
  modelOptions,
  selectedModel,
  isLoadingModels,
  modelOptionsError,
  onSelectedModelChange,
  onResponseModeChange,
  context,
  contextLocked,
  onAddVaults,
  onAddDocuments,
  onRemoveVault,
  onRemoveDocument,
  textareaRef,
  onDraftValueChange,
}: {
  disabled: boolean;
  placeholder: string;
  responseMode: ChatResponseMode;
  modelOptions?: string[];
  selectedModel: string;
  isLoadingModels?: boolean;
  modelOptionsError?: string | null;
  onSelectedModelChange?: (nextValue: string) => void;
  onResponseModeChange: (nextValue: ChatResponseMode) => void;
  context?: DraftChatContext;
  contextLocked?: boolean;
  onAddVaults?: () => void;
  onAddDocuments?: () => void;
  onRemoveVault?: (vault: DraftChatVault) => void;
  onRemoveDocument?: (document: DraftChatDocument) => void;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  onDraftValueChange: (nextValue: string) => void;
}) {
  const hasModelPicker = Boolean(onSelectedModelChange);
  const modelLabel = selectedModel || (isLoadingModels ? 'Loading models' : 'No model');
  const modelDropdownOptions = modelOptions?.map(model => ({ value: model, label: model })) ?? [];

  function handleComposerChange(event: ChangeEvent<HTMLTextAreaElement>) {
    onDraftValueChange(event.currentTarget.value);
  }

  return (
    <Box alignSelf="end" flexShrink="0" px="4" pb="4" pt="2" sm={{ px: '6', pb: '5' }}>
      <ComposerRoot
        mx="auto"
        w="100%"
        maxW="54rem"
        rounded="lg"
        borderWidth="1px"
        borderColor="border.surface"
        bg="bg.surface"
        p="3"
        boxShadow="md"
      >
        {context && onRemoveVault && onRemoveDocument ? (
          <ContextChipList
            context={context}
            locked={Boolean(contextLocked)}
            disabled={disabled}
            onRemoveVault={onRemoveVault}
            onRemoveDocument={onRemoveDocument}
          />
        ) : null}

        <ComposerInput
          ref={textareaRef}
          aria-label="Chat message"
          placeholder={placeholder}
          disabled={disabled}
          submitMode="enter"
          minRows={1}
          maxRows={8}
          fontFamily="chat"
          fontSize="var(--arkivra-font-size-chat)"
          lineHeight="1.6"
          minH="2.75rem"
          maxH="14rem"
          w="100%"
          resize="none"
          borderWidth="0"
          bg="transparent"
          px="3"
          py="3"
          boxShadow="none"
          _hover={{ borderColor: 'transparent' }}
          _focusVisible={{
            borderColor: 'transparent',
            outline: 'none',
            ring: 'none',
          }}
          onChange={handleComposerChange}
        />

        <Flex align="center" justify="space-between" gap="3" pt="3">
          <Flex align="center" gap="2" minW="0" flex="1" flexWrap="wrap">
            {onAddVaults && onAddDocuments ? (
              <ChatContextAddMenu
                disabled={disabled}
                onAddVaults={onAddVaults}
                onAddDocuments={onAddDocuments}
              />
            ) : null}
            <AnswerModePicker disabled={disabled} value={responseMode} onValueChange={onResponseModeChange} />

            {hasModelPicker ? (
              <RadioDropdownMenu
                ariaLabel="Select model"
                buttonProps={{
                  title: 'Select model',
                  disabled,
                  minW: '0',
                  w: 'auto',
                  maxW: { base: '11rem', sm: '18rem' },
                  h: '9',
                  gap: '1.5',
                  px: '2.5',
                  rounded: 'lg',
                  color: 'fg.muted',
                  variant: 'ghost',
                }}
                emptyLabel="No models available"
                icon={<Brain size={16} />}
                isDisabled={disabled}
                isLoading={isLoadingModels}
                loadingLabel="Loading models..."
                onValueChange={onSelectedModelChange ?? (() => {})}
                options={modelDropdownOptions}
                placeholder={modelLabel}
                value={selectedModel}
              />
            ) : null}
          </Flex>

          <ComposerSend
            type="submit"
            aria-label="Send message"
            display="inline-flex"
            alignItems="center"
            justifyContent="center"
            flexShrink="0"
            w="2.25rem"
            h="2.25rem"
            rounded="lg"
            bg="teal.solid"
            color="fg.inverted"
            _hover={{ bg: 'teal.emphasized' }}
            _disabled={{ opacity: 0.45, cursor: 'not-allowed' }}
          >
            <Send size={16} />
          </ComposerSend>
        </Flex>

        {modelOptionsError ? (
          <Text mt="3" px="1" fontSize="xs" color="fg.error">{modelOptionsError}</Text>
        ) : null}
      </ComposerRoot>
    </Box>
  );
}

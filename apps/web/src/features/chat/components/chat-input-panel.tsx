import type { RefObject } from 'react';
import { useEffect } from 'react';
import { Box, Flex, Text } from '@chakra-ui/react';
import { Brain, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { RadioDropdownMenu } from '@/components/ui/radio-dropdown-menu';
import { Textarea } from '@/components/ui/textarea';
import type { ChatResponseMode } from '../chat.api';
import { AnswerModePicker } from './answer-mode-picker';
import type { DraftChatContext, DraftChatDocument, DraftChatVault } from './chat-context-selector';
import { ChatContextAddMenu, ContextChipList } from './chat-context-selector';

export function ChatInputPanel({
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
  value,
  onValueChange,
  textareaRef,
  onSubmit,
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
  value: string;
  onValueChange: (nextValue: string) => void;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  onSubmit: (content: string) => void;
}) {
  const hasModelPicker = Boolean(onSelectedModelChange);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = '0px';
    textarea.style.height = `${Math.min(textarea.scrollHeight, 224)}px`;
  }, [textareaRef, value]);

  function submit() {
    const content = value.trim();
    if (content.length === 0 || disabled) return;
    onValueChange('');
    onSubmit(content);
  }

  const modelLabel = selectedModel || (isLoadingModels ? 'Loading models' : 'No model');
  const modelDropdownOptions = modelOptions?.map(model => ({ value: model, label: model })) ?? [];

  return (
    <Box alignSelf="end" flexShrink="0" px="4" pb="4" pt="2" sm={{ px: '6', pb: '5' }}>
      <Box
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

        <Textarea
          ref={textareaRef}
          aria-label="Chat message"
          value={value}
          onChange={(event) => onValueChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              submit();
            }
          }}
          placeholder={placeholder}
          disabled={disabled}
          fontFamily="chat"
          fontSize="var(--arkivra-font-size-chat)"
          lineHeight="1.6"
          style={{
            minHeight: '2.75rem',
            maxHeight: '14rem',
            width: '100%',
            resize: 'none',
            borderWidth: '0',
            background: 'transparent',
            padding: '0.75rem 0.75rem',
            boxShadow: 'none',
          }}
          borderWidth="0"
          borderColor="transparent"
          _hover={{ borderColor: 'transparent' }}
          _focusVisible={{
            borderColor: 'transparent',
            outline: 'none',
            ring: 'none',
          }}
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

          <Button
            type="button"
            size="icon"
            aria-label="Send message"
            disabled={disabled || value.trim().length === 0}
            flexShrink="0"
            style={{ width: '2.25rem', height: '2.25rem', borderRadius: '0.5rem' }}
            onClick={submit}
          >
            <Send size={16} />
          </Button>
        </Flex>

        {modelOptionsError ? (
          <Text mt="3" px="1" fontSize="xs" color="fg.error">{modelOptionsError}</Text>
        ) : null}
      </Box>
    </Box>
  );
}

import type { RefObject } from 'react';
import { useEffect } from 'react';
import { Box, Flex, Text } from '@chakra-ui/react';
import { Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import type { ChatResponseMode } from '../chat.api';

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
  value: string;
  onValueChange: (nextValue: string) => void;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  onSubmit: (content: string) => void;
}) {
  const showSources = responseMode === 'multimodal';
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

  return (
    <Box flexShrink="0" px="4" pb="1" pt="2" sm={{ px: '6', pb: '2' }}>
      <Box
        mx="auto"
        w="100%"
        maxW="container.lg"
        rounded="2xl"
        borderWidth="1px"
        borderColor="border.subtle"
        bg="bg.panel"
        p="3"
        boxShadow="0 10px 30px rgba(15,23,42,0.05)"
      >
        <Flex gap="3">
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
            style={{
              minHeight: '2.75rem',
              maxHeight: '14rem',
              flex: 1,
              resize: 'none',
              borderWidth: '0',
              background: 'transparent',
              padding: '0.75rem 0.75rem',
              boxShadow: 'none',
            }}
            _focusVisible={{ ring: 'none' }}
          />
          <Button
            type="button"
            size="icon"
            aria-label="Send message"
            disabled={disabled || value.trim().length === 0}
            style={{ width: '2.75rem', height: '2.75rem', borderRadius: '0.75rem' }}
            onClick={submit}
          >
            <Send size={16} />
          </Button>
        </Flex>

        <Flex
          direction={{ base: 'column', sm: 'row' }}
          gap="3"
          mt="3"
          borderTopWidth="1px"
          borderColor="border.subtle"
          pt="3"
          px="1"
          sm={{ alignItems: 'flex-end', justifyContent: 'space-between' }}
        >
          <Flex gap="3">
            <Checkbox
              id="chat-show-sources"
              checked={showSources}
              onCheckedChange={(checked) => onResponseModeChange(checked ? 'multimodal' : 'text')}
              disabled={disabled}
              style={{ marginTop: '0.25rem' }}
            />
            <Flex direction="column" gap="1">
              <Label htmlFor="chat-show-sources">Show sources</Label>
              <Text fontSize="sm" color="fg.muted">
                Citations and page references will be shown in responses
              </Text>
            </Flex>
          </Flex>

          {hasModelPicker ? (
            <Flex align="flex-end" gap="3">
              <Flex direction="column" gap="2">
                <Label
                  style={{
                    fontSize: '0.75rem',
                    fontWeight: 500,
                    textTransform: 'uppercase',
                    letterSpacing: '0.16em',
                    color: 'var(--chakra-colors-fg-muted)',
                  }}
                >
                  Model
                </Label>
                <Select
                  value={selectedModel}
                  onValueChange={onSelectedModelChange}
                  disabled={disabled || isLoadingModels || (modelOptions?.length ?? 0) === 0}
                >
                  <SelectTrigger
                    aria-label="Document chat model"
                    style={{
                      height: '2.5rem',
                      minWidth: '13rem',
                      borderRadius: '0.75rem',
                      borderColor: 'var(--chakra-colors-border-subtle)',
                      background: 'color-mix(in srgb, var(--chakra-colors-bg-subtle), transparent 80%)',
                      fontSize: '0.875rem',
                      boxShadow: 'none',
                    }}
                  >
                    <SelectValue
                      placeholder={isLoadingModels ? 'Loading models...' : 'Choose a model'}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {(modelOptions ?? []).map((model) => (
                      <SelectItem key={model} value={model}>
                        {model}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Flex>
            </Flex>
          ) : null}
        </Flex>

        {modelOptionsError ? (
          <Text mt="3" px="1" fontSize="xs" color="fg.error">{modelOptionsError}</Text>
        ) : null}
      </Box>
    </Box>
  );
}

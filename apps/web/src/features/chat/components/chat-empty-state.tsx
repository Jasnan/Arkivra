import { Flex, Text, chakra } from '@chakra-ui/react';
import { MessageSquare } from 'lucide-react';
import type { Search } from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import type { GlobalGuidedPrompt } from './chat-utils';

export function ChatEmptyState({
  title,
  description,
  promptSuggestions,
  guidedPrompts,
  onPromptSelect,
  onGuidedPromptSelect,
}: {
  title: string;
  description: string;
  promptSuggestions: readonly { label: string; icon: typeof Search }[];
  guidedPrompts?: readonly GlobalGuidedPrompt[];
  onPromptSelect: (prompt: string) => void;
  onGuidedPromptSelect?: (prompt: GlobalGuidedPrompt) => void;
}) {
  const hasGuidedPrompts = Boolean(guidedPrompts?.length && onGuidedPromptSelect);

  return (
    <Flex minH="100%" align="center" justify="center" px="6" py="10">
      <Flex direction="column" align="center" textAlign="center" maxW="container.md" mx="auto" w="100%">
        <Flex
          boxSize="14"
          align="center"
          justify="center"
          rounded="2xl"
          bg="accent.subtle"
          color="accent.default"
        >
          <MessageSquare size={24} />
        </Flex>

        <Flex direction="column" gap="3" mt="6">
          <Text as="h3" fontSize={{ base: '2xl', sm: '3xl' }} fontWeight="semibold" letterSpacing="tight" color="text.default">
            {title}
          </Text>
          <Text fontSize="sm" lineHeight="6" color="text.muted" maxW="container.sm" mx="auto">
            {description}
          </Text>
        </Flex>

        {hasGuidedPrompts ? (
          <Flex direction={{ base: 'column', sm: 'row' }} gap="3" mt="8" w="100%" maxW="container.md" flexWrap="wrap">
            {guidedPrompts?.map((prompt) => {
              const Icon = prompt.icon;
              return (
                <chakra.button
                  key={prompt.id}
                  type="button"
                  rounded="2xl"
                  borderWidth="1px"
                  borderColor="border.subtle"
                  bg="surface.raised"
                  p="5"
                  textAlign="left"
                  shadow="sm"
                  cursor="pointer"
                  flex="1"
                  minW="240px"
                  _hover={{ borderColor: 'accent.default/35', bg: 'accent.subtle' }}
                  onClick={() => onGuidedPromptSelect?.(prompt)}
                >
                  <Flex gap="4">
                    <Flex
                      boxSize="11"
                      shrink="0"
                alignItems="center"
                      justify="center"
                      rounded="xl"
                      bg="surface.selected"
                      color="accent.default"
                    >
                      <Icon size={20} />
                    </Flex>
                    <Flex direction="column" gap="2" minW="0">
                      <Text fontSize="sm" fontWeight="semibold" color="text.default">
                        {prompt.title}
                      </Text>
                      <Text fontSize="sm" lineHeight="6" color="text.muted">
                        {prompt.description}
                      </Text>
                      <Text fontSize="xs" color="text.muted">
                        {prompt.example}
                      </Text>
                    </Flex>
                  </Flex>
                </chakra.button>
              );
            })}
          </Flex>
        ) : (
          <Flex mt="8" w="100%" maxW="container.md" justify="center" gap="3" flexWrap="wrap">
            {promptSuggestions.map(({ label, icon: Icon }) => (
              <chakra.button
                key={label}
                type="button"
                display="inline-flex"
                minH="11"
                alignItems="center"
                gap="3"
                rounded="full"
                borderWidth="1px"
                borderColor="border.subtle"
                bg="surface.default"
                px="4"
                py="2.5"
                textAlign="left"
                fontSize="sm"
                fontWeight="medium"
                color="text.default"
                cursor="pointer"
                _hover={{ borderColor: 'text.default/20', bg: 'accent.subtle' }}
                onClick={() => onPromptSelect(label)}
              >
                <Flex boxSize="8" align="center" justify="center" rounded="full" bg="surface.selected" color="accent.default">
                  <Icon size={16} />
                </Flex>
                <Text>{label}</Text>
              </chakra.button>
            ))}
          </Flex>
        )}

        <Flex mt="8" w="100%" maxW="container.xs" align="center" gap="4">
          <Separator style={{ flex: 1 }} />
          <Text fontSize="xs" fontWeight="medium" textTransform="uppercase" letterSpacing="0.22em" color="text.muted">
            Or
          </Text>
          <Separator style={{ flex: 1 }} />
        </Flex>

        <Text mt="4" fontSize="sm" color="text.muted">Start typing your question below</Text>
      </Flex>
    </Flex>
  );
}

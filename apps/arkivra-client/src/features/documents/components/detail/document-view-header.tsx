import type { ReactNode } from 'react';
import { Box, CloseButton, Flex, Heading } from '@chakra-ui/react';
import { FileText } from 'lucide-react';

export function DocumentViewHeader({
  title,
  subtitle,
  mimeType,
  actions,
  onClose,
}: {
  title: string;
  subtitle: ReactNode;
  mimeType: string;
  actions: ReactNode;
  onClose: () => void;
}) {
  return (
    <Flex align="flex-start" gap={{ base: '3', md: '4' }}>
      <Flex
        boxSize={{ base: '10', md: '14' }}
        flexShrink={0}
        align="center"
        justify="center"
        rounded="lg"
        bg="red.500/15"
        color="red.300"
        fontWeight="bold"
        fontSize="xs"
      >
        {mimeType === 'application/pdf' ? 'PDF' : <FileText size={22} />}
      </Flex>
      <Box minW="0" flex="1">
        <Heading
          as="h1"
          textStyle={{ base: 'xl', md: '2xl' }}
          fontWeight="semibold"
          lineHeight="short"
          truncate
        >
          {title}
        </Heading>
        <Box mt="0" minW="0">
          {subtitle}
        </Box>
      </Box>
      <Flex align="center" gap="2" flexShrink={0}>
        {actions}
        <CloseButton
          aria-label="Close document detail"
          size="md"
          borderWidth="1px"
          borderColor="border.surface"
          rounded="lg"
          bg="bg.surface"
          color="fg.muted"
          onClick={onClose}
        />
      </Flex>
    </Flex>
  );
}

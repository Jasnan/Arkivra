import type { ReactNode } from 'react';
import { Box, Flex, Text } from '@chakra-ui/react';
import { FileText } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';

export function ChatContextHeader({
  contextLabel,
  contextBadge,
  contextDescription,
  leadingAction,
}: {
  contextLabel: string;
  contextBadge: string;
  contextDescription: string;
  leadingAction?: ReactNode;
}) {
  return (
    <Box px="4" pt="4" sm={{ px: '6' }}>
      <Flex
        align="center"
        gap="3"
        maxW="72rem"
        mx="auto"
        fontSize="sm"
        color="fg.muted"
        flexWrap="wrap"
      >
        {leadingAction}
        <Box as="span" srOnly>{`Context: ${contextLabel}`}</Box>
        <Text>{contextDescription}</Text>
        <Flex
          align="center"
          gap="2"
          rounded="full"
          borderWidth="1px"
          borderColor="border.subtle"
          bg="bg.surface"
          px="3"
          py="1.5"
          color="fg"
        >
          <FileText size={16} color="var(--chakra-colors-fg-muted)" />
          <Text maxW="22rem" truncate fontWeight="medium">
            {contextLabel}
          </Text>
          <Badge
            variant="secondary"
            style={{
              borderRadius: '9999px',
              padding: '0.1rem 0.5rem',
              fontSize: '0.65rem',
              textTransform: 'uppercase',
              letterSpacing: '0.14em',
            }}
          >
            {contextBadge}
          </Badge>
        </Flex>
      </Flex>
      <Box maxW="72rem" mx="auto">
        <Separator style={{ marginTop: '1rem' }} />
      </Box>
    </Box>
  );
}

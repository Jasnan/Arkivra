import { Box, Flex, Text } from '@chakra-ui/react';
import { getDocumentFileIconMeta } from './document-file-icon.utils';

export function DocumentFileIcon({
  name,
  mimeType,
  iconSize = 18,
  boxSize = '5',
  showBadge = false,
}: {
  name: string;
  mimeType: string;
  iconSize?: number;
  boxSize?: string;
  showBadge?: boolean;
}) {
  const { badgeBg, badgeColor, color, icon: Icon, label } = getDocumentFileIconMeta({ name, mimeType });

  return (
    <Flex boxSize={boxSize} shrink={0} align="center" justify="center" color={color} aria-hidden="true">
      <Box position="relative" boxSize={boxSize} color={color} display="flex" alignItems="center" justifyContent="center">
        <Icon size={iconSize} strokeWidth={1.8} />
        {showBadge ? (
          <Text
            as="span"
            position="absolute"
            left="50%"
            top="66%"
            transform="translate(-50%, -50%)"
            maxW="9"
            truncate
            rounded="2px"
            bg={badgeBg}
            px="1"
            py="0.5"
            fontSize="0.46rem"
            fontWeight="bold"
            letterSpacing="normal"
            lineHeight="1"
            color={badgeColor}
          >
            {label}
          </Text>
        ) : null}
      </Box>
    </Flex>
  );
}

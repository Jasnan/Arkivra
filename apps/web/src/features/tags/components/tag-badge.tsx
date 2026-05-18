import { Badge, Text } from '@chakra-ui/react';
import { Tag } from 'lucide-react';

const FALLBACK_TAG_COLOR = '#94a3b8';
const HEX_PREFIX_PATTERN = /^#/;
const HEX_COLOR_PATTERN = /^[\dA-F]{6}$/i;

function expandShortHex(value: string) {
  return value
    .split('')
    .map((character) => `${character}${character}`)
    .join('');
}

function getHexRgb(value: string) {
  const normalized = value.trim().replace(HEX_PREFIX_PATTERN, '');
  const hex = normalized.length === 3 ? expandShortHex(normalized) : normalized;

  if (!HEX_COLOR_PATTERN.test(hex)) {
    return null;
  }

  return {
    red: Number.parseInt(hex.slice(0, 2), 16),
    green: Number.parseInt(hex.slice(2, 4), 16),
    blue: Number.parseInt(hex.slice(4, 6), 16),
  };
}

function getReadableTextColor(backgroundColor: string) {
  const rgb = getHexRgb(backgroundColor);
  if (!rgb) {
    return '#111827';
  }

  const luminance = (0.299 * rgb.red + 0.587 * rgb.green + 0.114 * rgb.blue) / 255;
  return luminance > 0.58 ? '#111827' : '#FFFFFF';
}

export function TagBadge({ color, name }: { color?: string | null; name: string }) {
  const backgroundColor = color ?? FALLBACK_TAG_COLOR;
  const textColor = getReadableTextColor(backgroundColor);

  return (
    <Badge
      variant="solid"
      colorPalette="gray"
      size="lg"
      w="fit-content"
      maxW="full"
      rounded="md"
      borderWidth={backgroundColor.toUpperCase() === '#FFFFFF' ? '1px' : undefined}
      borderColor="border.surface"
      px="2.5"
      py="1"
      fontSize="sm"
      fontWeight="semibold"
      letterSpacing="normal"
      lineHeight="1"
      textTransform="none"
      style={{ backgroundColor, color: textColor }}
    >
      <Tag size={13} strokeWidth={2} />
      <Text as="span" truncate>
        {name}
      </Text>
    </Badge>
  );
}

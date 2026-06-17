import type { Dispatch, SetStateAction } from 'react';
import { HStack, IconButton } from '@chakra-ui/react';
import { Grid3X3, List } from 'lucide-react';
import { useAccentColor } from '@/components/providers/accent-color-context';
import type { FileBrowserView } from './vault-browser.types';

const iconSizes = {
  sm: {
    compact: 14,
    comfortable: 15,
    relaxed: 16,
  },
  md: {
    compact: 16,
    comfortable: 17,
    relaxed: 18,
  },
} as const;

export function FileBrowserViewToggle({
  value,
  onValueChange,
  size = 'md',
}: {
  value: FileBrowserView;
  onValueChange: Dispatch<SetStateAction<FileBrowserView>>;
  size?: 'sm' | 'md';
}) {
  const { density } = useAccentColor();
  const iconSize = iconSizes[size][density];

  return (
    <HStack
      gap="0"
      overflow="hidden"
      rounded="md"
      borderWidth="1px"
      borderColor="border.surface"
      bg="bg.surface"
    >
      <IconButton
        type="button"
        aria-label="Grid view"
        aria-pressed={value === 'grid'}
        size={size}
        variant="plain"
        rounded="none"
        color={value === 'grid' ? 'white' : 'fg.muted'}
        bg={value === 'grid' ? 'teal.solid' : 'transparent'}
        _hover={{ bg: value === 'grid' ? 'teal.solid' : 'bg.subtle', color: value === 'grid' ? 'white' : 'fg' }}
        _focusVisible={{ outline: '2px solid', outlineColor: 'teal.focusRing', outlineOffset: '-2px' }}
        onClick={() => onValueChange('grid')}
      >
        <Grid3X3 size={iconSize} />
      </IconButton>
      <IconButton
        type="button"
        aria-label="List view"
        aria-pressed={value === 'list'}
        size={size}
        variant="plain"
        rounded="none"
        color={value === 'list' ? 'white' : 'fg.muted'}
        bg={value === 'list' ? 'teal.solid' : 'transparent'}
        borderLeftWidth="1px"
        borderColor="border.surface"
        _hover={{ bg: value === 'list' ? 'teal.solid' : 'bg.subtle', color: value === 'list' ? 'white' : 'fg' }}
        _focusVisible={{ outline: '2px solid', outlineColor: 'teal.focusRing', outlineOffset: '-2px' }}
        onClick={() => onValueChange('list')}
      >
        <List size={iconSize} />
      </IconButton>
    </HStack>
  );
}

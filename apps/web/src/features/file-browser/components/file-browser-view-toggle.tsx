import type { Dispatch, SetStateAction } from 'react';
import { HStack, chakra } from '@chakra-ui/react';
import { Grid3X3, List } from 'lucide-react';
import { useAccentColor } from '@/components/providers/accent-color-context';
import type { FileBrowserView } from './vault-browser.types';

const iconSizes = {
  compact: 16,
  comfortable: 17,
  relaxed: 18,
} as const;

export function FileBrowserViewToggle({
  value,
  onValueChange,
}: {
  value: FileBrowserView;
  onValueChange: Dispatch<SetStateAction<FileBrowserView>>;
}) {
  const { density } = useAccentColor();
  const iconSize = iconSizes[density];

  return (
    <HStack
      gap="0"
      overflow="hidden"
      rounded="md"
      borderWidth="1px"
      borderColor="border.surface"
      bg="bg.surface"
    >
      <chakra.button
        type="button"
        aria-label="Grid view"
        aria-pressed={value === 'grid'}
        display="inline-flex"
        h="var(--arkivra-controlHeight, 2.5rem)"
        minH="var(--arkivra-controlHeight, 2.5rem)"
        w="calc(var(--arkivra-controlHeight, 2.5rem) * 1.2)"
        alignItems="center"
        justifyContent="center"
        color={value === 'grid' ? 'white' : 'fg.muted'}
        bg={value === 'grid' ? 'teal.solid' : 'transparent'}
        _hover={{ bg: value === 'grid' ? 'teal.solid' : 'bg.subtle', color: value === 'grid' ? 'white' : 'fg' }}
        _focusVisible={{ outline: '2px solid', outlineColor: 'teal.focusRing', outlineOffset: '-2px' }}
        onClick={() => onValueChange('grid')}
      >
        <Grid3X3 size={iconSize} />
      </chakra.button>
      <chakra.button
        type="button"
        aria-label="List view"
        aria-pressed={value === 'list'}
        display="inline-flex"
        h="var(--arkivra-controlHeight, 2.5rem)"
        minH="var(--arkivra-controlHeight, 2.5rem)"
        w="calc(var(--arkivra-controlHeight, 2.5rem) * 1.2)"
        alignItems="center"
        justifyContent="center"
        color={value === 'list' ? 'white' : 'fg.muted'}
        bg={value === 'list' ? 'teal.solid' : 'transparent'}
        borderLeftWidth="1px"
        borderColor="border.surface"
        _hover={{ bg: value === 'list' ? 'teal.solid' : 'bg.subtle', color: value === 'list' ? 'white' : 'fg' }}
        _focusVisible={{ outline: '2px solid', outlineColor: 'teal.focusRing', outlineOffset: '-2px' }}
        onClick={() => onValueChange('list')}
      >
        <List size={iconSize} />
      </chakra.button>
    </HStack>
  );
}

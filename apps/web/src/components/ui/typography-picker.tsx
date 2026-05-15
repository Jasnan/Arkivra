import { SimpleGrid, Text, chakra } from '@chakra-ui/react';
import type { AppearanceFont } from '@/components/providers/typography';
import { typographyOptions } from '@/components/providers/typography';

interface TypographyPickerProps {
  onValueChange: (value: AppearanceFont) => void;
  value: AppearanceFont;
}

export function TypographyPicker({ onValueChange, value }: TypographyPickerProps) {
  return (
    <SimpleGrid columns={{ base: 1, sm: 3 }} gap="2" w="full">
      {typographyOptions.map((option) => {
        const selected = value === option.value;

        return (
          <chakra.button
            key={option.value}
            type="button"
            data-arkivra-font={option.value}
            display="flex"
            flexDirection="column"
            alignItems="center"
            justifyContent="center"
            minW="0"
            minH="var(--arkivra-controlHeight, 2.5rem)"
            rounded="md"
            borderWidth="1px"
            borderColor={selected ? 'teal.solid' : 'border.subtle'}
            bg={selected ? 'teal.subtle' : 'bg.subtle'}
            color="fg"
            px="2"
            cursor="pointer"
            fontFamily="var(--arkivra-font-body)"
            textAlign="center"
            transition="border-color 120ms ease, background-color 120ms ease"
            _hover={{ borderColor: 'teal.solid', bg: 'teal.subtle' }}
            onClick={() => onValueChange(option.value)}
          >
            <Text maxW="full" truncate fontSize="sm" fontWeight="medium" lineHeight="1.2" color="fg">
              {option.label}
            </Text>
          </chakra.button>
        );
      })}
    </SimpleGrid>
  );
}

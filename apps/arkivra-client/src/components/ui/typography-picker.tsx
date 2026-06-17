import { SimpleGrid, Text } from '@chakra-ui/react';
import type { AppearanceFont } from '@/components/providers/typography';
import { typographyOptions } from '@/components/providers/typography';
import { Button } from '@/components/ui/button';

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
          <Button
            key={option.value}
            type="button"
            data-arkivra-font={option.value}
            size="sm"
            variant="outline"
            flexDirection="column"
            justifyContent="center"
            minW="0"
            rounded="md"
            borderWidth="1px"
            borderColor={selected ? 'teal.solid' : 'border.surface'}
            bg={selected ? 'teal.subtle' : 'bg.subtle'}
            color="fg"
            fontFamily="var(--arkivra-font-body)"
            textAlign="center"
            transition="border-color 120ms ease, background-color 120ms ease"
            _hover={{ borderColor: 'teal.solid', bg: 'teal.subtle' }}
            onClick={() => onValueChange(option.value)}
          >
            <Text maxW="full" whiteSpace="nowrap" fontSize="xs" fontWeight="medium" lineHeight="1.2" color="fg">
              {option.label}
            </Text>
          </Button>
        );
      })}
    </SimpleGrid>
  );
}

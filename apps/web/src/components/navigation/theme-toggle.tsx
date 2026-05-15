import { Box, HStack, Popover, Portal, SimpleGrid, Slider, Stack, Text, chakra } from '@chakra-ui/react';
import { Check, Monitor, Moon, SlidersHorizontal, SunMedium } from 'lucide-react';
import { useTheme } from 'next-themes';
import { Button } from '@/components/ui/button';
import { useAccentColor } from '@/components/providers/accent-color-context';
import type { AccentColor, AppearanceDensity, AppearanceFont, AppearanceRadius } from '@/components/providers/accent-color-context';

const accentOptions: Array<{ color: string; label: string; value: AccentColor }> = [
  { value: 'gray', label: 'Gray', color: '#4b5563' },
  { value: 'red', label: 'Red', color: '#dc2626' },
  { value: 'orange', label: 'Orange', color: '#ea580c' },
  { value: 'yellow', label: 'Yellow', color: '#facc15' },
  { value: 'green', label: 'Green', color: '#16a34a' },
  { value: 'teal', label: 'Teal', color: '#14b8a6' },
  { value: 'blue', label: 'Blue', color: '#2563eb' },
  { value: 'cyan', label: 'Cyan', color: '#0891b2' },
  { value: 'purple', label: 'Purple', color: '#7c3aed' },
  { value: 'pink', label: 'Pink', color: '#db2777' },
];

const themeOptions = [
  { value: 'system', label: 'System', icon: Monitor },
  { value: 'light', label: 'Light', icon: SunMedium },
  { value: 'dark', label: 'Dark', icon: Moon },
] as const;

const fontOptions: Array<{ label: string; value: AppearanceFont }> = [
  { value: 'outfit', label: 'Outfit' },
  { value: 'inter', label: 'Inter' },
  { value: 'bricolage', label: 'Bricolage' },
  { value: 'geist', label: 'Geist' },
];

const densityOptions: Array<{ label: string; value: AppearanceDensity }> = [
  { value: 'compact', label: 'Compact' },
  { value: 'comfortable', label: 'Comfortable' },
  { value: 'relaxed', label: 'Relaxed' },
];

const radiusOptions: AppearanceRadius[] = ['none', 'sm', 'md', 'lg', 'xl'];

const radiusIndexByValue: Record<AppearanceRadius, number> = {
  none: 0,
  sm: 1,
  md: 2,
  lg: 3,
  xl: 4,
};

const radiusValueByIndex: Record<number, AppearanceRadius> = {
  0: 'none',
  1: 'sm',
  2: 'md',
  3: 'lg',
  4: 'xl',
};

export function ThemeToggle() {
  const { setTheme, theme } = useTheme();
  const {
    accentColor,
    density,
    fontFamily,
    radius,
    setAccentColor,
    setDensity,
    setFontFamily,
    setRadius,
  } = useAccentColor();

  return (
    <Popover.Root lazyMount unmountOnExit positioning={{ placement: 'right-end', gutter: 10 }}>
      <Popover.Trigger asChild>
        <Button variant="ghost" size="icon" type="button" aria-label="Open appearance panel">
          <SlidersHorizontal size={16} />
        </Button>
      </Popover.Trigger>
      <Portal>
        <Popover.Positioner>
          <Popover.Content
            w="22rem"
            maxW="calc(100vw - 2rem)"
            rounded="lg"
            borderWidth="1px"
            borderColor="border.subtle"
            bg="bg.surface"
            p="0"
            shadow="xl"
          >
            <Popover.Arrow>
              <Popover.ArrowTip />
            </Popover.Arrow>
            <Popover.Body p="5">
              <Stack gap="5">
                <HStack justify="space-between">
                  <Popover.Title fontSize="md" fontWeight="semibold" color="fg">
                    Theme Panel
                  </Popover.Title>
                  <Box color="fg.muted">
                    <SlidersHorizontal size={18} />
                  </Box>
                </HStack>

                <Stack gap="2">
                  <Text fontSize="sm" fontWeight="medium" color="fg">
                    Theme
                  </Text>
                  <SimpleGrid columns={3} gap="2">
                    {themeOptions.map((option) => {
                      const Icon = option.icon;
                      const selected = (theme ?? 'system') === option.value;

                      return (
                        <chakra.button
                          key={option.value}
                          type="button"
                          display="flex"
                          alignItems="center"
                          justifyContent="center"
                          gap="2"
                          minH="var(--arkivra-controlHeight, 2.5rem)"
                          rounded="md"
                          borderWidth="1px"
                          borderColor={selected ? 'teal.solid' : 'border.subtle'}
                          bg={selected ? 'teal.subtle' : 'bg.subtle'}
                          color={selected ? 'teal.fg' : 'fg'}
                          fontSize="sm"
                          fontWeight="medium"
                          cursor="pointer"
                          _hover={{ borderColor: 'teal.solid', bg: 'teal.subtle' }}
                          onClick={() => setTheme(option.value)}
                        >
                          <Icon size={15} />
                          {option.label}
                        </chakra.button>
                      );
                    })}
                  </SimpleGrid>
                </Stack>

                <Stack gap="2">
                  <Text fontSize="sm" fontWeight="medium" color="fg">
                    Accent Color
                  </Text>
                  <SimpleGrid columns={3} gap="2">
                    {accentOptions.map((option) => {
                      const selected = accentColor === option.value;

                      return (
                        <chakra.button
                          key={option.value}
                          type="button"
                          display="flex"
                          alignItems="center"
                          justifyContent="space-between"
                          gap="2"
                          minH="var(--arkivra-controlHeight, 2.5rem)"
                          rounded="md"
                          borderWidth="1px"
                          borderColor={selected ? 'teal.solid' : 'border.subtle'}
                          bg={selected ? 'teal.subtle' : 'bg.subtle'}
                          color="fg"
                          px="3"
                          fontSize="sm"
                          fontWeight="medium"
                          cursor="pointer"
                          _hover={{ borderColor: 'teal.solid', bg: 'teal.subtle' }}
                          onClick={() => setAccentColor(option.value)}
                        >
                          <HStack gap="2" minW="0">
                            <Box boxSize="3.5" rounded="full" bg={option.color} flexShrink={0} />
                            <Text truncate>{option.label}</Text>
                          </HStack>
                          {selected ? <Check size={14} /> : null}
                        </chakra.button>
                      );
                    })}
                  </SimpleGrid>
                </Stack>

                <Stack gap="2">
                  <Text fontSize="sm" fontWeight="medium" color="fg">
                    Density
                  </Text>
                  <SimpleGrid columns={3} gap="2">
                    {densityOptions.map((option) => {
                      const selected = density === option.value;

                      return (
                        <chakra.button
                          key={option.value}
                          type="button"
                          display="flex"
                          alignItems="center"
                          justifyContent="center"
                          minH="var(--arkivra-controlHeight, 2.5rem)"
                          rounded="md"
                          borderWidth="1px"
                          borderColor={selected ? 'teal.solid' : 'border.subtle'}
                          bg={selected ? 'teal.subtle' : 'bg.subtle'}
                          color={selected ? 'teal.fg' : 'fg'}
                          px="2"
                          fontSize="sm"
                          fontWeight="medium"
                          cursor="pointer"
                          _hover={{ borderColor: 'teal.solid', bg: 'teal.subtle' }}
                          onClick={() => setDensity(option.value)}
                        >
                          <Text truncate>{option.label}</Text>
                        </chakra.button>
                      );
                    })}
                  </SimpleGrid>
                </Stack>

                <Stack gap="2">
                  <Text fontSize="sm" fontWeight="medium" color="fg">
                    Font Family
                  </Text>
                  <SimpleGrid columns={4} gap="2">
                    {fontOptions.map((option) => {
                      const selected = fontFamily === option.value;

                      return (
                        <chakra.button
                          key={option.value}
                          type="button"
                          display="flex"
                          flexDirection="column"
                          alignItems="center"
                          justifyContent="center"
                          minH="16"
                          rounded="md"
                          borderWidth="1px"
                          borderColor={selected ? 'teal.solid' : 'border.subtle'}
                          bg={selected ? 'teal.subtle' : 'bg.subtle'}
                          color="fg"
                          cursor="pointer"
                          _hover={{ borderColor: 'teal.solid', bg: 'teal.subtle' }}
                          onClick={() => setFontFamily(option.value)}
                        >
                          <Text fontSize="xl" fontWeight="semibold" lineHeight="1">
                            Ag
                          </Text>
                          <Text mt="1" maxW="full" truncate fontSize="xs" color="fg.muted">
                            {option.label}
                          </Text>
                        </chakra.button>
                      );
                    })}
                  </SimpleGrid>
                </Stack>

                <Stack gap="3">
                  <Text fontSize="sm" fontWeight="medium" color="fg">
                    Radius: {radius}
                  </Text>
                  <Slider.Root
                    aria-label={['Interface radius']}
                    min={0}
                    max={4}
                    step={1}
                    value={[radiusIndexByValue[radius]]}
                    colorPalette="teal"
                    onValueChange={(event) => {
                      setRadius(radiusValueByIndex[event.value[0] ?? 2] ?? 'md');
                    }}
                  >
                    <Slider.Control>
                      <Slider.Track>
                        <Slider.Range />
                      </Slider.Track>
                      <Slider.Thumb index={0}>
                        <Slider.HiddenInput />
                      </Slider.Thumb>
                      <Slider.MarkerGroup>
                        {radiusOptions.map((option, index) => (
                          <Slider.Marker key={option} value={index}>
                            <Slider.MarkerIndicator />
                          </Slider.Marker>
                        ))}
                      </Slider.MarkerGroup>
                    </Slider.Control>
                  </Slider.Root>
                </Stack>
              </Stack>
            </Popover.Body>
          </Popover.Content>
        </Popover.Positioner>
      </Portal>
    </Popover.Root>
  );
}

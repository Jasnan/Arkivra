import { Popover, Portal, SimpleGrid, Slider, Stack, Text, chakra } from '@chakra-ui/react';
import { Check, Monitor, Moon, SlidersHorizontal, SunMedium } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { TypographyPicker } from '@/components/ui/typography-picker';
import { useAccentColor } from '@/components/providers/accent-color-context';
import type { AccentColor, AppearanceDensity, AppearanceFontSize, AppearanceRadius } from '@/components/providers/accent-color-context';

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

const densityOptions: Array<{ label: string; value: AppearanceDensity }> = [
  { value: 'compact', label: 'Compact' },
  { value: 'comfortable', label: 'Comfortable' },
  { value: 'relaxed', label: 'Relaxed' },
];

const radiusOptions: AppearanceRadius[] = ['none', 'sm', 'md', 'lg', 'xl'];
const fontSizeOptions: AppearanceFontSize[] = ['sm', 'md', 'lg', 'xl', '2xl'];

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

const fontSizeIndexByValue: Record<AppearanceFontSize, number> = {
  sm: 0,
  md: 1,
  lg: 2,
  xl: 3,
  '2xl': 4,
};

const fontSizeValueByIndex: Record<number, AppearanceFontSize> = {
  0: 'sm',
  1: 'md',
  2: 'lg',
  3: 'xl',
  4: '2xl',
};

export function ThemeToggle() {
  const {
    accentColor,
    density,
    fontFamily,
    fontSize,
    radius,
    themeMode,
    setAccentColor,
    setDensity,
    setFontFamily,
    setFontSize,
    setRadius,
    setThemeMode,
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
            w="29rem"
            maxW="calc(100vw - 2rem)"
            rounded="lg"
            borderWidth="1px"
            borderColor="border.strong"
            bg="bg.surface"
            p="0"
            shadow="xl"
          >
            <Popover.Arrow>
              <Popover.ArrowTip borderColor="border.strong" bg="bg.surface" />
            </Popover.Arrow>
            <Popover.Body p="5">
              <Stack gap="5">
                <Stack gap="2">
                  <Text fontSize="sm" fontWeight="medium" color="fg">
                    Theme
                  </Text>
                  <SimpleGrid columns={3} gap="2">
                    {themeOptions.map((option) => {
                      const Icon = option.icon;
                      const selected = themeMode === option.value;

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
                          borderColor={selected ? 'teal.solid' : 'border.surface'}
                          bg={selected ? 'teal.subtle' : 'bg.subtle'}
                          color={selected ? 'teal.fg' : 'fg'}
                          fontSize="sm"
                          fontWeight="medium"
                          cursor="pointer"
                          _hover={{ borderColor: 'teal.solid', bg: 'teal.subtle' }}
                          onClick={() => setThemeMode(option.value)}
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
                  <SimpleGrid columns={10} gap="1.5">
                    {accentOptions.map((option) => {
                      const selected = accentColor === option.value;

                      return (
                        <Tooltip key={option.value} positioning={{ placement: 'top' }}>
                          <TooltipTrigger asChild>
                            <chakra.button
                              type="button"
                              aria-label={option.label}
                              aria-pressed={selected}
                              display="flex"
                              alignItems="center"
                              justifyContent="center"
                              position="relative"
                              boxSize="8"
                              rounded="md"
                              borderWidth="1px"
                              borderColor={selected ? 'fg' : 'border.surface'}
                              bg={option.color}
                              color="white"
                              cursor="pointer"
                              boxShadow={selected ? '0 0 0 2px var(--chakra-colors-bg-surface), 0 0 0 4px var(--chakra-colors-teal-solid)' : 'none'}
                              _hover={{ borderColor: 'fg', transform: 'translateY(-1px)' }}
                              _focusVisible={{ outline: '2px solid', outlineColor: 'teal.focusRing', outlineOffset: '2px' }}
                              transition="border-color 120ms ease, box-shadow 120ms ease, transform 120ms ease"
                              onClick={() => setAccentColor(option.value)}
                            >
                              {selected ? <Check size={14} strokeWidth={2.4} /> : null}
                            </chakra.button>
                          </TooltipTrigger>
                          <TooltipContent>{option.label}</TooltipContent>
                        </Tooltip>
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
                          borderColor={selected ? 'teal.solid' : 'border.surface'}
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
                  <TypographyPicker value={fontFamily} onValueChange={setFontFamily} />
                </Stack>

                <Stack gap="3">
                  <Text fontSize="sm" fontWeight="medium" color="fg">
                    Font Size: {fontSize}
                  </Text>
                  <Slider.Root
                    aria-label={['Interface font size']}
                    min={0}
                    max={4}
                    step={1}
                    value={[fontSizeIndexByValue[fontSize]]}
                    colorPalette="teal"
                    onValueChange={(event) => {
                      setFontSize(fontSizeValueByIndex[event.value[0] ?? 1] ?? 'md');
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
                        {fontSizeOptions.map((option, index) => (
                          <Slider.Marker key={option} value={index}>
                            <Slider.MarkerIndicator />
                          </Slider.Marker>
                        ))}
                      </Slider.MarkerGroup>
                    </Slider.Control>
                  </Slider.Root>
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

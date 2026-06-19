import type { ReactNode } from 'react';
import { Box, Flex, Grid, SimpleGrid, Slider, Stack, Text, chakra } from '@chakra-ui/react';
import { Check, Moon, SunMedium } from 'lucide-react';
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

function AppearancePreferenceRow({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <Grid
      alignItems="center"
      gap={{ base: '2', md: '4' }}
      templateColumns={{ base: '1fr', md: '12rem minmax(0, 1fr)' }}
    >
      <Text fontSize="sm" fontWeight="medium" color="fg">
        {label}
      </Text>
      <Box minW="0" w="full">
        {children}
      </Box>
    </Grid>
  );
}

export function AppearancePreferencesControls() {
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
    <Stack gap={{ base: '4', lg: '3.5' }} w="full">
      <AppearancePreferenceRow label="Theme">
        <SimpleGrid columns={{ base: 1, sm: 2 }} gap="2">
          {themeOptions.map((option) => {
            const Icon = option.icon;
            const selected = themeMode === option.value;

            return (
              <Button
                key={option.value}
                type="button"
                size="sm"
                variant="outline"
                justifyContent="center"
                rounded="md"
                borderWidth="1px"
                borderColor={selected ? 'teal.solid' : 'border.surface'}
                bg={selected ? 'teal.subtle' : 'bg.subtle'}
                color={selected ? 'teal.fg' : 'fg'}
                _hover={{ borderColor: 'teal.solid', bg: 'teal.subtle' }}
                onClick={() => setThemeMode(option.value)}
              >
                <Icon size={15} />
                <Text as="span" truncate>{option.label}</Text>
              </Button>
            );
          })}
        </SimpleGrid>
      </AppearancePreferenceRow>

      <AppearancePreferenceRow label="Accent Color">
        <SimpleGrid columns={{ base: 5, md: 10 }} gap={{ base: '2', md: '3' }} alignItems="center">
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
      </AppearancePreferenceRow>

      <AppearancePreferenceRow label="Density">
        <SimpleGrid columns={{ base: 1, sm: 3 }} gap="2">
          {densityOptions.map((option) => {
            const selected = density === option.value;

            return (
              <Button
                key={option.value}
                type="button"
                size="sm"
                variant="outline"
                justifyContent="center"
                rounded="md"
                borderWidth="1px"
                borderColor={selected ? 'teal.solid' : 'border.surface'}
                bg={selected ? 'teal.subtle' : 'bg.subtle'}
                color={selected ? 'teal.fg' : 'fg'}
                _hover={{ borderColor: 'teal.solid', bg: 'teal.subtle' }}
                onClick={() => setDensity(option.value)}
              >
                <Text truncate>{option.label}</Text>
              </Button>
            );
          })}
        </SimpleGrid>
      </AppearancePreferenceRow>

      <AppearancePreferenceRow label="Font Family">
        <TypographyPicker value={fontFamily} onValueChange={setFontFamily} />
      </AppearancePreferenceRow>

      <AppearancePreferenceRow label={`Font Size: ${fontSize}`}>
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
      </AppearancePreferenceRow>

      <AppearancePreferenceRow label={`Radius: ${radius}`}>
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
      </AppearancePreferenceRow>
    </Stack>
  );
}

export function ThemeToggle({ expanded = false }: { expanded?: boolean }) {
  const { themeMode, setThemeMode } = useAccentColor();
  const displayedThemeMode = themeMode === 'dark' ? 'dark' : 'light';
  const currentOption = themeOptions.find(option => option.value === displayedThemeMode) ?? themeOptions[0];
  const nextThemeMode = displayedThemeMode === 'dark' ? 'light' : 'dark';
  const nextOption = themeOptions.find(option => option.value === nextThemeMode) ?? themeOptions[0];
  const Icon = currentOption.icon;

  return (
    <Button
      variant="ghost"
      size="default"
      type="button"
      aria-label={`Switch theme. Current theme: ${currentOption.label}. Next: ${nextOption.label}.`}
      title={`Switch to ${nextOption.label} theme`}
      justifyContent={expanded ? 'flex-start' : 'center'}
      gap="2.5"
      w="full"
      px={expanded ? '2.5' : '0'}
      onClick={() => setThemeMode(nextThemeMode)}
    >
      <Flex boxSize="5" shrink={0} align="center" justify="center">
        <Icon size={17} strokeWidth={2.1} />
      </Flex>
      <Text as="span" truncate display={expanded ? undefined : 'none'} textStyle="sidebar" fontWeight="medium">
        {currentOption.label}
      </Text>
    </Button>
  );
}

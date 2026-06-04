import { useState } from 'react';
import { Box, DatePicker, Flex, IconButton, Portal, RadioCard, SimpleGrid, parseDate } from '@chakra-ui/react';
import type { DateValue } from '@chakra-ui/react';
import { CalendarDays } from 'lucide-react';
import { useAccentColor } from '@/components/providers/accent-color-context';
import { FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { formatLocalDateInput, getLocalDateInputPlaceholder } from '@/lib/localization';

export type DatePreset = 'any' | 'last_7_days' | 'last_30_days' | 'custom';

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const presetOptions: Array<{ value: DatePreset; label: string }> = [
  { value: 'any', label: 'Any time' },
  { value: 'last_7_days', label: 'Last 7 days' },
  { value: 'last_30_days', label: 'Last 30 days' },
  { value: 'custom', label: 'Custom range' },
];

function toInputDateValue(value: Date) {
  const year = value.getFullYear();
  const month = `${value.getMonth() + 1}`.padStart(2, '0');
  const day = `${value.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function toDateValue(value: string) {
  if (!ISO_DATE_PATTERN.test(value)) {
    return undefined;
  }

  try {
    return parseDate(value);
  } catch {
    return undefined;
  }
}

function toIsoDate(value: DateValue | undefined) {
  return value?.toString() ?? '';
}

function DateRangePickerFields({
  customDateFrom,
  customDateTo,
  onCustomDateFromChange,
  onCustomDateToChange,
}: {
  customDateFrom: string;
  customDateTo: string;
  onCustomDateFromChange: (value: string) => void;
  onCustomDateToChange: (value: string) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const today = toDateValue(toInputDateValue(new Date()));
  const selectedDates = [toDateValue(customDateFrom), toDateValue(customDateTo)].filter((date): date is DateValue => Boolean(date));
  const placeholder = getLocalDateInputPlaceholder();

  return (
    <DatePicker.Root
      mt="4"
      maxW="32rem"
      selectionMode="range"
      open={isOpen}
      value={selectedDates}
      max={today}
      positioning={{ placement: 'top-start' }}
      placeholder={placeholder}
      onOpenChange={(details) => setIsOpen(details.open)}
      onValueChange={(details) => {
        const [nextFromDate, nextToDate] = details.value;

        onCustomDateFromChange(toIsoDate(nextFromDate));
        onCustomDateToChange(toIsoDate(nextToDate));
      }}
    >
      <DatePicker.Label srOnly>Custom uploaded date range</DatePicker.Label>
      <DatePicker.Control display="block" w="full">
        <DatePicker.Input index={0} display="none" />
        <DatePicker.Input index={1} display="none" />

        <Flex
          maxW="32rem"
          w="full"
          minH="11"
          align="stretch"
          rounded="lg"
          borderWidth="1px"
          borderColor="border.surface"
          bg="bg.surface"
          overflow="hidden"
          transition="border-color 120ms ease, box-shadow 120ms ease"
          _hover={{ borderColor: 'teal.muted' }}
          _focusWithin={{
            borderColor: 'teal.solid',
            boxShadow: '0 0 0 2px var(--chakra-colors-teal-focus-ring)',
          }}
        >
          <Flex flex="1" minW="0" align="center" gap="2.5" px="3">
            <FieldLabel htmlFor="custom-date-range-from" flexShrink={0} mb="0" fontSize="sm" fontWeight="semibold">
              From:
            </FieldLabel>
            <Input
              id="custom-date-range-from"
              aria-label="From"
              value={formatLocalDateInput(customDateFrom)}
              placeholder={placeholder}
              readOnly
              cursor="pointer"
              h="10"
              minW="0"
              px="0"
              rounded="none"
              borderWidth="0"
              bg="transparent"
              fontVariantNumeric="tabular-nums"
              _focusVisible={{ outline: 'none' }}
              onClick={() => setIsOpen(true)}
              onFocus={() => setIsOpen(true)}
            />
          </Flex>

          <Box w="1px" my="2" bg="border.surface" />

          <Flex flex="1" minW="0" align="center" gap="2.5" px="3">
            <FieldLabel htmlFor="custom-date-range-to" flexShrink={0} mb="0" fontSize="sm" fontWeight="semibold">
              To:
            </FieldLabel>
            <Input
              id="custom-date-range-to"
              aria-label="To"
              value={formatLocalDateInput(customDateTo)}
              placeholder={placeholder}
              readOnly
              cursor="pointer"
              h="10"
              minW="0"
              px="0"
              rounded="none"
              borderWidth="0"
              bg="transparent"
              fontVariantNumeric="tabular-nums"
              _focusVisible={{ outline: 'none' }}
              onClick={() => setIsOpen(true)}
              onFocus={() => setIsOpen(true)}
            />
          </Flex>

          <DatePicker.Trigger asChild>
            <IconButton
              aria-label="Open custom date range picker"
              variant="ghost"
              size="sm"
              alignSelf="center"
              flexShrink={0}
              mr="1.5"
              color="fg.muted"
              _hover={{ bg: 'bg.subtle', color: 'teal.fg' }}
              _focusVisible={{ outline: '2px solid', outlineColor: 'teal.focusRing', outlineOffset: '1px' }}
            >
              <CalendarDays size={17} />
            </IconButton>
          </DatePicker.Trigger>
        </Flex>
      </DatePicker.Control>

      <Portal disabled>
        <DatePicker.Positioner>
          <DatePicker.Content>
            <DatePicker.View view="day">
              <DatePicker.Header />
              <DatePicker.DayTable />
            </DatePicker.View>
            <DatePicker.View view="month">
              <DatePicker.Header />
              <DatePicker.MonthTable />
            </DatePicker.View>
            <DatePicker.View view="year">
              <DatePicker.Header />
              <DatePicker.YearTable />
            </DatePicker.View>
          </DatePicker.Content>
        </DatePicker.Positioner>
      </Portal>
    </DatePicker.Root>
  );
}

export function DatePresetSelector({
  value,
  onValueChange,
  customDateFrom,
  customDateTo,
  onCustomDateFromChange,
  onCustomDateToChange,
  className,
}: {
  value: DatePreset;
  onValueChange: (value: DatePreset) => void;
  customDateFrom: string;
  customDateTo: string;
  onCustomDateFromChange: (value: string) => void;
  onCustomDateToChange: (value: string) => void;
  idPrefix: string;
  className?: string;
}) {
  const { accentColor } = useAccentColor();

  return (
    <Box className={className}>
      <RadioCard.Root
        value={value}
        onValueChange={(details) => {
          if (details.value) {
            onValueChange(details.value as DatePreset);
          }
        }}
        colorPalette={accentColor}
        variant="surface"
        orientation="vertical"
        align="start"
        gap="2"
        w="full"
      >
        <RadioCard.Label fontSize="sm" fontWeight="semibold" color="fg">
          Uploaded date
        </RadioCard.Label>

        <SimpleGrid columns={{ base: 1, sm: 2 }} gap="2" maxW="32rem" w="full">
          {presetOptions.map((option) => (
            <RadioCard.Item
              key={option.value}
              value={option.value}
              w="full"
            >
              <RadioCard.ItemHiddenInput />
              <RadioCard.ItemControl
                display="grid"
                gridTemplateColumns="auto minmax(0, 1fr)"
                alignItems="center"
                justifyContent="flex-start"
                columnGap="3"
                minH="12"
                rounded="lg"
                px="3.5"
                py="2.5"
                borderColor="border.surface"
                bg="bg.surface"
                cursor="pointer"
                _checked={{ bg: 'colorPalette.subtle', borderColor: 'colorPalette.muted' }}
              >
                <RadioCard.ItemIndicator />
                <RadioCard.ItemText fontSize="sm" fontWeight="semibold">
                  {option.label}
                </RadioCard.ItemText>
              </RadioCard.ItemControl>
            </RadioCard.Item>
          ))}
        </SimpleGrid>
      </RadioCard.Root>

      {value === 'custom' ? (
        <DateRangePickerFields
          customDateFrom={customDateFrom}
          customDateTo={customDateTo}
          onCustomDateFromChange={onCustomDateFromChange}
          onCustomDateToChange={onCustomDateToChange}
        />
      ) : null}
    </Box>
  );
}

import { useState } from 'react';
import { DatePicker, IconButton, Portal, parseDate } from '@chakra-ui/react';
import type { DateValue } from '@chakra-ui/react';
import { CalendarDays } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { formatLocalDateInput, getLocalDateInputPlaceholder } from '@/lib/localization';

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function toDateValue(value: string | undefined) {
  if (!value || !ISO_DATE_PATTERN.test(value)) {
    return undefined;
  }

  try {
    return parseDate(value);
  } catch {
    return undefined;
  }
}

function toDatePickerValue(value: string | undefined) {
  const dateValue = toDateValue(value);
  return dateValue ? [dateValue] : [];
}

function toIsoDate(value: DateValue | undefined) {
  return value?.toString() ?? '';
}

export function AuditDateFilterPicker({
  id,
  label,
  max,
  min,
  onValueChange,
  value,
}: {
  id: string;
  label: string;
  max?: string;
  min?: string;
  onValueChange: (value: string) => void;
  value?: string;
}) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <DatePicker.Root
      open={isOpen}
      value={toDatePickerValue(value)}
      min={toDateValue(min)}
      max={toDateValue(max)}
      positioning={{ placement: 'bottom-start', gutter: 6, sameWidth: true }}
      placeholder={getLocalDateInputPlaceholder()}
      onOpenChange={(details) => setIsOpen(details.open)}
      onValueChange={(details) => onValueChange(toIsoDate(details.value[0]))}
    >
      <DatePicker.Label srOnly>{label}</DatePicker.Label>
      <DatePicker.Control>
        <DatePicker.Input index={0} display="none" />
        <Input
          id={id}
          aria-label={label}
          value={formatLocalDateInput(value)}
          placeholder={getLocalDateInputPlaceholder()}
          readOnly
          cursor="pointer"
          bg="bg.surface"
          size="lg"
          rounded="lg"
          borderColor="border.strong"
          fontSize="sm"
          fontVariantNumeric="tabular-nums"
          _hover={{ borderColor: 'fg/30' }}
          _focusVisible={{
            borderColor: 'teal.solid',
            outline: '2px solid',
            outlineColor: 'teal.focusRing',
            outlineOffset: '1px',
          }}
          onClick={() => setIsOpen(true)}
          onFocus={() => setIsOpen(true)}
        />
        <DatePicker.IndicatorGroup>
          <DatePicker.Trigger asChild>
            <IconButton
              aria-label={`Open ${label.toLowerCase()} date picker`}
              variant="ghost"
              size="sm"
              color="fg.muted"
              _hover={{ bg: 'bg.subtle', color: 'teal.fg' }}
              _focusVisible={{
                outline: '2px solid',
                outlineColor: 'teal.focusRing',
                outlineOffset: '1px',
              }}
            >
              <CalendarDays size={16} />
            </IconButton>
          </DatePicker.Trigger>
        </DatePicker.IndicatorGroup>
      </DatePicker.Control>

      <Portal>
        <DatePicker.Positioner zIndex="dropdown">
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

import { Box, Flex, Text } from '@chakra-ui/react';
import { CalendarRange } from 'lucide-react';
import { Field, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';

export type DatePreset = 'any' | 'last_7_days' | 'last_30_days' | 'custom';

const presetOptions: Array<{ value: DatePreset; label: string }> = [
  { value: 'any', label: 'Any time' },
  { value: 'last_7_days', label: 'Last 7 days' },
  { value: 'last_30_days', label: 'Last 30 days' },
  { value: 'custom', label: 'Custom range' },
];

export function DatePresetSelector({
  value,
  onValueChange,
  customDateFrom,
  customDateTo,
  onCustomDateFromChange,
  onCustomDateToChange,
  idPrefix,
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
  return (
    <>
      <Box mt="3" className={className}>
        <RadioGroup value={value} onValueChange={(next) => onValueChange(next as DatePreset)}>
          {presetOptions.map((option) => (
            <Label
              key={option.value}
              htmlFor={`${idPrefix}-${option.value}`}
              display="flex"
              cursor="pointer"
              alignItems="center"
              gap="3"
              rounded="lg"
              px="3.5"
              py="2.5"
              fontWeight="semibold"
              bg={value === option.value ? 'bg.subtle' : 'transparent'}
              color={value === option.value ? 'fg' : 'fg.muted'}
              transition="colors"
              _hover={value === option.value ? undefined : { bg: 'bg.subtle', opacity: 0.6 }}
            >
              <RadioGroupItem id={`${idPrefix}-${option.value}`} value={option.value} />
              <Text as="span" fontSize="sm">
                {option.label}
              </Text>
            </Label>
          ))}
        </RadioGroup>
      </Box>

      {value === 'custom' ? (
        <Flex
          mt="4"
          gap="3"
          borderLeftWidth="1px"
          borderColor="border.subtle"
          pl={{ base: '3', sm: '4' }}
          direction={{ base: 'column', sm: 'row' }}
        >
          <Field>
            <FieldLabel htmlFor={`${idPrefix}-from`}>From</FieldLabel>
            <Box position="relative">
              <Box
                position="absolute"
                left="4"
                top="50%"
                transform="translateY(-50%)"
                color="fg.muted"
                pointerEvents="none"
              >
                <CalendarRange size={16} />
              </Box>
              <Input
                id={`${idPrefix}-from`}
                aria-label="From"
                type="date"
                value={customDateFrom}
                max={customDateTo || undefined}
                onChange={(event) => onCustomDateFromChange(event.target.value)}
                h="10"
                rounded="lg"
                borderColor="border.subtle"
                bg="bg.panel"
                pl="11"
              />
            </Box>
          </Field>

          <Field>
            <FieldLabel htmlFor={`${idPrefix}-to`}>To</FieldLabel>
            <Box position="relative">
              <Box
                position="absolute"
                left="4"
                top="50%"
                transform="translateY(-50%)"
                color="fg.muted"
                pointerEvents="none"
              >
                <CalendarRange size={16} />
              </Box>
              <Input
                id={`${idPrefix}-to`}
                aria-label="To"
                type="date"
                value={customDateTo}
                min={customDateFrom || undefined}
                onChange={(event) => onCustomDateToChange(event.target.value)}
                h="10"
                rounded="lg"
                borderColor="border.subtle"
                bg="bg.panel"
                pl="11"
              />
            </Box>
          </Field>
        </Flex>
      ) : null}
    </>
  );
}

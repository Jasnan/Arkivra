import { CalendarRange } from 'lucide-react';
import { Field, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { cn } from '@/lib/utils';

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
  inputClassName,
}: {
  value: DatePreset;
  onValueChange: (value: DatePreset) => void;
  customDateFrom: string;
  customDateTo: string;
  onCustomDateFromChange: (value: string) => void;
  onCustomDateToChange: (value: string) => void;
  idPrefix: string;
  className?: string;
  inputClassName?: string;
}) {
  return (
    <>
      <RadioGroup value={value} onValueChange={(next) => onValueChange(next as DatePreset)} className={cn('mt-3', className)}>
        {presetOptions.map((option) => (
          <Label
            key={option.value}
            htmlFor={`${idPrefix}-${option.value}`}
            className={cn(
              'flex cursor-pointer items-center gap-3 rounded-lg px-3.5 py-2.5 font-semibold transition',
              value === option.value ? 'bg-secondary text-foreground' : 'hover:bg-secondary/45',
            )}
          >
            <RadioGroupItem id={`${idPrefix}-${option.value}`} value={option.value} />
            <span className="text-sm">{option.label}</span>
          </Label>
        ))}
      </RadioGroup>

      {value === 'custom' ? (
        <div className="mt-4 grid gap-3 border-l border-border/70 pl-3 sm:grid-cols-2 sm:pl-4">
          <Field>
            <FieldLabel htmlFor={`${idPrefix}-from`}>From</FieldLabel>
            <div className="relative">
              <CalendarRange className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id={`${idPrefix}-from`}
                aria-label="From"
                type="date"
                value={customDateFrom}
                max={customDateTo || undefined}
                onChange={(event) => onCustomDateFromChange(event.target.value)}
                className={cn('h-10 rounded-lg border-border/70 bg-card pl-11', inputClassName)}
              />
            </div>
          </Field>

          <Field>
            <FieldLabel htmlFor={`${idPrefix}-to`}>To</FieldLabel>
            <div className="relative">
              <CalendarRange className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id={`${idPrefix}-to`}
                aria-label="To"
                type="date"
                value={customDateTo}
                min={customDateFrom || undefined}
                onChange={(event) => onCustomDateToChange(event.target.value)}
                className={cn('h-10 rounded-lg border-border/70 bg-card pl-11', inputClassName)}
              />
            </div>
          </Field>
        </div>
      ) : null}
    </>
  );
}

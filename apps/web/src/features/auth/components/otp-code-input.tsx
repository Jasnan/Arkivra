import { useRef } from 'react';
import { HStack } from '@chakra-ui/react';
import { Field, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';

const NON_DIGIT_REGEX = /\D/g;
const OTP_CELL_IDS = ['otp-1', 'otp-2', 'otp-3', 'otp-4', 'otp-5', 'otp-6'] as const;

export function OtpCodeInput({
  autoFocus = true,
  label = 'Verification code',
  value,
  onChange,
}: {
  autoFocus?: boolean;
  label?: string;
  value: string[];
  onChange: (value: string[]) => void;
}) {
  const otpInputRef = useRef<Array<HTMLInputElement | null>>([]);

  function updateDigit(index: number, inputValue: string) {
    const nextValue = [...value];
    const digits = inputValue.replace(NON_DIGIT_REGEX, '').split('');

    if (digits.length > 1) {
      digits.slice(0, 6 - index).forEach((digit, offset) => {
        nextValue[index + offset] = digit;
      });
      onChange(nextValue);
      otpInputRef.current[Math.min(index + digits.length, 5)]?.focus();
      return;
    }

    nextValue[index] = digits[0] ?? '';
    onChange(nextValue);

    if (digits[0] && index < 5) {
      otpInputRef.current[index + 1]?.focus();
    }
  }

  return (
    <Field display="grid" gap="1.5">
      <FieldLabel id="totp-code-label" fontSize="sm" fontWeight="750">{label}</FieldLabel>
      <HStack
        aria-labelledby="totp-code-label"
        role="group"
        gap="2"
        justify="space-between"
        onPaste={(event) => {
          event.preventDefault();
          updateDigit(0, event.clipboardData.getData('text'));
        }}
      >
        {OTP_CELL_IDS.map((cellId, index) => (
          <Input
            key={cellId}
            ref={(node) => {
              otpInputRef.current[index] = node;
            }}
            aria-label={`Digit ${index + 1}`}
            autoComplete={index === 0 ? 'one-time-code' : 'off'}
            autoFocus={autoFocus && index === 0}
            inputMode="numeric"
            maxLength={1}
            pattern="[0-9]*"
            value={value[index] ?? ''}
            textAlign="center"
            fontSize="lg"
            fontWeight="semibold"
            boxSize="11"
            rounded="authControl"
            borderColor="auth.fieldBorder"
            bg="auth.field"
            px="0"
            _hover={{ bg: 'auth.fieldHover', borderColor: 'border.strong' }}
            _focusVisible={{
              borderColor: 'teal.solid',
              boxShadow: '0 0 0 4px var(--chakra-colors-teal-focus-ring)',
              outline: 'none',
            }}
            onChange={(event) => updateDigit(index, event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Backspace' && !value[index] && index > 0) {
                otpInputRef.current[index - 1]?.focus();
              }
            }}
          />
        ))}
      </HStack>
    </Field>
  );
}

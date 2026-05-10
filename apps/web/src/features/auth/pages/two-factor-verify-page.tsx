import type { FormEvent } from 'react';
import { useState } from 'react';
import { Flex } from '@chakra-ui/react';
import { Link, useNavigate } from '@tanstack/react-router';
import { ROUTES } from '@/app/routes';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { OtpCodeInput } from '@/features/auth/components/otp-code-input';
import { AuthActions, AuthCard } from '@/features/auth/auth-layout';
import { authClient } from '@/lib/auth-client';

export function TwoFactorVerifyPage() {
  const navigate = useNavigate();

  const [codeDigits, setCodeDigits] = useState(['', '', '', '', '', '']);
  const [backupCode, setBackupCode] = useState('');
  const [mode, setMode] = useState<'totp' | 'backup'>('totp');
  const [trustDevice, setTrustDevice] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);

    const verificationCode = codeDigits.join('');

    if (mode === 'totp' && verificationCode.length !== 6) {
      setErrorMessage('Enter the 6-digit code from your authenticator app.');
      return;
    }

    setIsSubmitting(true);

    const result =
      mode === 'totp'
        ? await authClient.twoFactor.verifyTotp({ code: verificationCode, trustDevice })
        : await authClient.twoFactor.verifyBackupCode({ code: backupCode, trustDevice });

    setIsSubmitting(false);

    if (result.error) {
      setErrorMessage(result.error.message ?? 'Verification failed.');
      return;
    }

    navigate({ to: ROUTES.root });
  }

  return (
    <AuthCard title="Two-factor verification" subtitle="Enter your authenticator or backup code.">
      <Flex gap="2">
        <Button type="button" variant={mode === 'totp' ? 'default' : 'outline'} onClick={() => setMode('totp')}>
          Authenticator
        </Button>
        <Button type="button" variant={mode === 'backup' ? 'default' : 'outline'} onClick={() => setMode('backup')}>
          Backup code
        </Button>
      </Flex>

      <form style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }} onSubmit={handleSubmit}>
        {mode === 'totp' ? (
          <OtpCodeInput label="6-digit code" value={codeDigits} onChange={setCodeDigits} />
        ) : (
          <Field>
            <FieldLabel htmlFor="backup-code">Backup code</FieldLabel>
            <Input
              id="backup-code"
              type="text"
              required
              autoComplete="off"
              value={backupCode}
              onChange={(event) => setBackupCode(event.target.value)}
            />
          </Field>
        )}

        <Checkbox checked={trustDevice} onCheckedChange={setTrustDevice}>
          Trust this device for 30 days
        </Checkbox>

        {errorMessage ? <FieldError>{errorMessage}</FieldError> : null}

        <Button type="submit" w="100%" disabled={isSubmitting}>
          {isSubmitting ? 'Verifying…' : 'Verify'}
        </Button>
      </form>

      <AuthActions>
        <Link to={ROUTES.login} style={{ fontWeight: 500, color: 'var(--chakra-colors-fg)' }}>
          Use another account
        </Link>
      </AuthActions>
    </AuthCard>
  );
}

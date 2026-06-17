import type { FormEvent } from 'react';
import { useState } from 'react';
import { Flex } from '@chakra-ui/react';
import { useNavigate } from '@tanstack/react-router';
import { KeyRound } from 'lucide-react';
import { ROUTES } from '@/app/routes';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { OtpCodeInput } from '@/features/auth/components/otp-code-input';
import {
  AuthActions,
  AuthCard,
  AuthField,
  AuthForm,
  AuthLink,
  AuthPrimaryButton,
  AuthStatus,
} from '@/features/auth/auth-layout';
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
      <Flex gap="2" rounded="authControl" borderWidth="1px" borderColor="auth.cardBorder" bg="auth.field" p="1">
        <Button
          type="button"
          variant={mode === 'totp' ? 'default' : 'ghost'}
          flex="1"
          size="lg"
          rounded="calc(var(--chakra-radii-auth-control) - 0.25rem)"
          onClick={() => setMode('totp')}
        >
          Authenticator
        </Button>
        <Button
          type="button"
          variant={mode === 'backup' ? 'default' : 'ghost'}
          flex="1"
          size="lg"
          rounded="calc(var(--chakra-radii-auth-control) - 0.25rem)"
          onClick={() => setMode('backup')}
        >
          Backup code
        </Button>
      </Flex>

      <AuthForm onSubmit={handleSubmit}>
        {mode === 'totp' ? (
          <OtpCodeInput label="6-digit code" value={codeDigits} onChange={setCodeDigits} />
        ) : (
          <AuthField
            id="backup-code"
            label="Backup code"
            type="text"
            required
            autoComplete="off"
            placeholder="Enter backup code"
            value={backupCode}
            icon={KeyRound}
            onChange={(event) => setBackupCode(event.target.value)}
          />
        )}

        <Checkbox checked={trustDevice} onCheckedChange={setTrustDevice}>
          Trust this device for 30 days
        </Checkbox>

        {errorMessage ? <AuthStatus tone="error">{errorMessage}</AuthStatus> : null}

        <AuthPrimaryButton loading={isSubmitting} loadingText="Verifying...">
          Verify
        </AuthPrimaryButton>
      </AuthForm>

      <AuthActions>
        <AuthLink to={ROUTES.login}>Use another account</AuthLink>
      </AuthActions>
    </AuthCard>
  );
}

import type { FormEvent } from 'react';
import { useMemo, useState } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { AuthCard, AuthLayout } from '@/features/auth/auth-layout';
import { authClient } from '@/lib/auth-client';
const TOTP_SECRET_REGEX = /secret=([^&]+)/;

export function TwoFactorSetupPage() {
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [isEnabling, setIsEnabling] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [totpUri, setTotpUri] = useState<string | null>(null);
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [isCompleted, setIsCompleted] = useState(false);

  const secret = useMemo(() => {
    if (!totpUri) {
      return null;
    }

    const match = TOTP_SECRET_REGEX.exec(totpUri);
    return match?.[1] ? decodeURIComponent(match[1]) : null;
  }, [totpUri]);

  async function handleEnable(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);
    setIsEnabling(true);

    const { data, error } = await authClient.twoFactor.enable({ password });

    setIsEnabling(false);

    if (error) {
      setErrorMessage(error.message ?? 'Could not enable 2FA.');
      return;
    }

    setTotpUri(data?.totpURI ?? null);
    setBackupCodes(data?.backupCodes ?? []);
  }

  async function handleVerify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);
    setIsVerifying(true);

    const { error } = await authClient.twoFactor.verifyTotp({ code });

    setIsVerifying(false);

    if (error) {
      setErrorMessage(error.message ?? 'Verification failed.');
      return;
    }

    setIsCompleted(true);
  }

  return (
    <AuthLayout>
      <AuthCard title="Set up two-factor auth" subtitle="Protect your account with TOTP verification.">
        {totpUri ? (
          <>
            <Alert>
              <AlertDescription className="space-y-2">
                <p className="font-medium text-foreground">Authenticator setup key</p>
                <p className="break-all text-muted-foreground">{secret ?? 'Unavailable'}</p>
              </AlertDescription>
            </Alert>

            <Alert>
              <AlertDescription className="space-y-3">
                <p className="font-medium text-foreground">Backup codes</p>
                <ul className="grid grid-cols-2 gap-2">
                  {backupCodes.map((item) => (
                    <li key={item}>
                      <Badge variant="secondary" className="w-full justify-center py-1 font-mono">
                        {item}
                      </Badge>
                    </li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>

            {isCompleted ? (
              <Alert>
                <AlertDescription>
                  Two-factor authentication is enabled for your account.
                </AlertDescription>
              </Alert>
            ) : (
              <form className="space-y-4" onSubmit={handleVerify}>
                <Field>
                  <FieldLabel htmlFor="totp-code">Enter authenticator code</FieldLabel>
                  <Input
                    id="totp-code"
                    type="text"
                    required
                    minLength={6}
                    maxLength={6}
                    autoComplete="one-time-code"
                    value={code}
                    onChange={(event) => setCode(event.target.value)}
                  />
                </Field>

                {errorMessage ? <FieldError>{errorMessage}</FieldError> : null}

                <Button type="submit" className="w-full" disabled={isVerifying}>
                  {isVerifying ? 'Verifying…' : 'Verify and enable'}
                </Button>
              </form>
            )}
          </>
        ) : (
          <form className="space-y-4" onSubmit={handleEnable}>
            <Field>
              <FieldLabel htmlFor="password">Current password</FieldLabel>
              <Input
                id="password"
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </Field>

            {errorMessage ? <FieldError>{errorMessage}</FieldError> : null}

            <Button type="submit" className="w-full" disabled={isEnabling}>
              {isEnabling ? 'Preparing 2FA…' : 'Generate setup key'}
            </Button>
          </form>
        )}
      </AuthCard>
    </AuthLayout>
  );
}

import type { FormEvent } from 'react';
import { useMemo, useState } from 'react';
import { Box, Grid } from '@chakra-ui/react';
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
    if (!totpUri) return null;
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
              <AlertDescription>
                <Box fontWeight="medium" color="fg">Authenticator setup key</Box>
                <Box wordBreak="break-all" color="fg.muted">{secret ?? 'Unavailable'}</Box>
              </AlertDescription>
            </Alert>

            <Alert>
              <AlertDescription>
                <Box fontWeight="medium" color="fg">Backup codes</Box>
                <Grid templateColumns="1fr 1fr" gap="2" mt="3">
                  {backupCodes.map((item) => (
                    <Box key={item}>
                      <Badge variant="secondary" w="100%" display="flex" justifyContent="center" py="1" fontFamily="mono">
                        {item}
                      </Badge>
                    </Box>
                  ))}
                </Grid>
              </AlertDescription>
            </Alert>

            {isCompleted ? (
              <Alert>
                <AlertDescription>Two-factor authentication is enabled for your account.</AlertDescription>
              </Alert>
            ) : (
              <form style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }} onSubmit={handleVerify}>
                <Field>
                  <FieldLabel htmlFor="totp-code">Enter authenticator code</FieldLabel>
                  <Input id="totp-code" type="text" required minLength={6} maxLength={6} autoComplete="one-time-code" value={code} onChange={(event) => setCode(event.target.value)} />
                </Field>
                {errorMessage ? <FieldError>{errorMessage}</FieldError> : null}
                <Button type="submit" w="100%" disabled={isVerifying}>
                  {isVerifying ? 'Verifying…' : 'Verify and enable'}
                </Button>
              </form>
            )}
          </>
        ) : (
          <form style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }} onSubmit={handleEnable}>
            <Field>
              <FieldLabel htmlFor="password">Current password</FieldLabel>
              <Input id="password" type="password" required autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} />
            </Field>
            {errorMessage ? <FieldError>{errorMessage}</FieldError> : null}
            <Button type="submit" w="100%" disabled={isEnabling}>
              {isEnabling ? 'Preparing 2FA…' : 'Generate setup key'}
            </Button>
          </form>
        )}
      </AuthCard>
    </AuthLayout>
  );
}

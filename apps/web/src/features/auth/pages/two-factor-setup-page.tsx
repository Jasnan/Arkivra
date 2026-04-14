import type { FormEvent } from 'react';
import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { AuthCard, AuthLayout } from '@/features/auth/auth-layout';
import { authClient } from '@/lib/auth-client';

const inputClassName = 'h-10 w-full rounded-xl border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';
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
            <div className="space-y-2 rounded-xl border border-border bg-background p-3 text-sm">
              <p className="font-medium">Authenticator setup key</p>
              <p className="break-all text-muted-foreground">{secret ?? 'Unavailable'}</p>
            </div>

            <div className="space-y-2 rounded-xl border border-border bg-background p-3 text-sm">
              <p className="font-medium">Backup codes</p>
              <ul className="grid grid-cols-2 gap-2 font-mono text-xs text-muted-foreground">
                {backupCodes.map(item => <li key={item}>{item}</li>)}
              </ul>
            </div>

            {isCompleted ? (
              <p className="rounded-xl border border-border bg-background p-3 text-sm text-muted-foreground">
                Two-factor authentication is enabled for your account.
              </p>
            ) : (
              <form className="space-y-4" onSubmit={handleVerify}>
                <div className="space-y-1.5">
                  <label htmlFor="totp-code" className="text-sm font-medium">Enter authenticator code</label>
                  <input id="totp-code" type="text" required minLength={6} maxLength={6} autoComplete="one-time-code" value={code} onChange={event => setCode(event.target.value)} className={inputClassName} />
                </div>

                {errorMessage ? <p className="text-sm text-destructive">{errorMessage}</p> : null}

                <Button type="submit" className="w-full" disabled={isVerifying}>
                  {isVerifying ? 'Verifying…' : 'Verify and enable'}
                </Button>
              </form>
            )}
          </>
        ) : (
          <form className="space-y-4" onSubmit={handleEnable}>
            <div className="space-y-1.5">
              <label htmlFor="password" className="text-sm font-medium">Current password</label>
              <input id="password" type="password" required autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} className={inputClassName} />
            </div>

            {errorMessage ? <p className="text-sm text-destructive">{errorMessage}</p> : null}

            <Button type="submit" className="w-full" disabled={isEnabling}>
              {isEnabling ? 'Preparing 2FA…' : 'Generate setup key'}
            </Button>
          </form>
        )}
      </AuthCard>
    </AuthLayout>
  );
}

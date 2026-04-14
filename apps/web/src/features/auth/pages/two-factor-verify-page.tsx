import type { FormEvent } from 'react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { AuthCard, AuthLayout } from '@/features/auth/auth-layout';
import { authClient } from '@/lib/auth-client';

const inputClassName = 'h-10 w-full rounded-xl border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

export function TwoFactorVerifyPage() {
  const navigate = useNavigate();

  const [code, setCode] = useState('');
  const [backupCode, setBackupCode] = useState('');
  const [mode, setMode] = useState<'totp' | 'backup'>('totp');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);
    setIsSubmitting(true);

    const result = mode === 'totp'
      ? await authClient.twoFactor.verifyTotp({ code, trustDevice: true })
      : await authClient.twoFactor.verifyBackupCode({ code: backupCode, trustDevice: true });

    setIsSubmitting(false);

    if (result.error) {
      setErrorMessage(result.error.message ?? 'Verification failed.');
      return;
    }

    navigate('/');
  }

  return (
    <AuthLayout>
      <AuthCard title="Two-factor verification" subtitle="Enter your authenticator or backup code.">
        <div className="flex gap-2">
          <Button type="button" variant={mode === 'totp' ? 'default' : 'outline'} onClick={() => setMode('totp')}>
            Authenticator
          </Button>
          <Button type="button" variant={mode === 'backup' ? 'default' : 'outline'} onClick={() => setMode('backup')}>
            Backup code
          </Button>
        </div>

        <form className="space-y-4" onSubmit={handleSubmit}>
          {mode === 'totp' ? (
            <div className="space-y-1.5">
              <label htmlFor="totp-code" className="text-sm font-medium">6-digit code</label>
              <input id="totp-code" type="text" required minLength={6} maxLength={6} autoComplete="one-time-code" value={code} onChange={event => setCode(event.target.value)} className={inputClassName} />
            </div>
          ) : (
            <div className="space-y-1.5">
              <label htmlFor="backup-code" className="text-sm font-medium">Backup code</label>
              <input id="backup-code" type="text" required autoComplete="off" value={backupCode} onChange={event => setBackupCode(event.target.value)} className={inputClassName} />
            </div>
          )}

          {errorMessage ? <p className="text-sm text-destructive">{errorMessage}</p> : null}

          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? 'Verifying…' : 'Verify'}
          </Button>
        </form>

        <p className="text-sm text-muted-foreground">
          Need to sign in again?{' '}
          <Link to="/login" className="font-medium text-foreground hover:underline">Back to login</Link>
        </p>
      </AuthCard>
    </AuthLayout>
  );
}

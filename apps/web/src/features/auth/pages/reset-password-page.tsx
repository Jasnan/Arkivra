import type { FormEvent } from 'react';
import { useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { AuthCard, AuthLayout } from '@/features/auth/auth-layout';
import { authClient } from '@/lib/auth-client';

const inputClassName = 'h-10 w-full rounded-xl border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

export function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') ?? undefined;

  const navigate = useNavigate();

  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isReset, setIsReset] = useState(false);

  if (typeof token !== 'string') {
    return <Navigate to="/login" replace />;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);
    setIsSubmitting(true);

    const { error } = await authClient.resetPassword({ token, newPassword: password });

    setIsSubmitting(false);

    if (error) {
      setErrorMessage(error.message ?? 'Unable to reset password.');
      return;
    }

    setIsReset(true);
    setTimeout(() => {
      navigate('/login');
    }, 600);
  }

  return (
    <AuthLayout>
      <AuthCard title="Set new password" subtitle="Create a new password for your account.">
        {isReset ? (
          <p className="rounded-xl border border-border bg-background p-3 text-sm text-muted-foreground">
            Password updated. Redirecting to sign in...
          </p>
        ) : (
          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="space-y-1.5">
              <label htmlFor="new-password" className="text-sm font-medium">New password</label>
              <input id="new-password" type="password" required minLength={8} autoComplete="new-password" value={password} onChange={event => setPassword(event.target.value)} className={inputClassName} />
            </div>

            {errorMessage ? <p className="text-sm text-destructive">{errorMessage}</p> : null}

            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? 'Updating password…' : 'Update password'}
            </Button>
          </form>
        )}

        <p className="text-sm text-muted-foreground">
          <Link to="/login" className="font-medium text-foreground hover:underline">Back to sign in</Link>
        </p>
      </AuthCard>
    </AuthLayout>
  );
}

import type { FormEvent } from 'react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { AuthCard, AuthLayout } from '@/features/auth/auth-layout';
import { authClient } from '@/lib/auth-client';

const inputClassName = 'h-10 w-full rounded-xl border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

export function RequestPasswordResetPage() {
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);
    setIsSubmitting(true);

    const redirectTo = `${window.location.origin}/reset-password`;
    const { error } = await authClient.requestPasswordReset({ email, redirectTo });

    setIsSubmitting(false);

    if (error) {
      setErrorMessage(error.message ?? 'Unable to request reset link.');
      return;
    }

    setSubmitted(true);
  }

  return (
    <AuthLayout>
      <AuthCard title="Reset password" subtitle="Request a password reset link by email.">
        {submitted ? (
          <p className="rounded-xl border border-border bg-background p-3 text-sm text-muted-foreground">
            If an account exists for {email}, a reset link has been sent.
          </p>
        ) : (
          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="space-y-1.5">
              <label htmlFor="email" className="text-sm font-medium">Email</label>
              <input id="email" type="email" required autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} className={inputClassName} />
            </div>

            {errorMessage ? <p className="text-sm text-destructive">{errorMessage}</p> : null}

            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? 'Sending reset link…' : 'Send reset link'}
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

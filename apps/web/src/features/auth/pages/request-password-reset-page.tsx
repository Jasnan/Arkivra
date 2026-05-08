import type { FormEvent } from 'react';
import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { ROUTES } from '@/app/routes';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { AuthActions, AuthCard, AuthLayout } from '@/features/auth/auth-layout';
import { authClient } from '@/lib/auth-client';

export function RequestPasswordResetPage() {
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);
    setIsSubmitting(true);

    const redirectTo = `${window.location.origin}${ROUTES.resetPassword}`;
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
          <Alert>
            <AlertDescription>If an account exists for {email}, a reset link has been sent.</AlertDescription>
          </Alert>
        ) : (
          <form style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }} onSubmit={handleSubmit}>
            <Field>
              <FieldLabel htmlFor="email">Email</FieldLabel>
              <Input id="email" type="email" required autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} />
            </Field>

            {errorMessage ? <FieldError>{errorMessage}</FieldError> : null}

            <Button type="submit" w="100%" disabled={isSubmitting}>
              {isSubmitting ? 'Sending reset link…' : 'Send reset link'}
            </Button>
          </form>
        )}

        <AuthActions>
          <Link to={ROUTES.login} style={{ fontWeight: 500, color: 'var(--chakra-colors-fg)' }}>
            Sign in
          </Link>
        </AuthActions>
      </AuthCard>
    </AuthLayout>
  );
}

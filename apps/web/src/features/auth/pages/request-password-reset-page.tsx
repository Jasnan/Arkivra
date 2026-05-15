import type { FormEvent } from 'react';
import { useState } from 'react';
import { CircleCheck, Mail } from 'lucide-react';
import { ROUTES } from '@/app/routes';
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
    <AuthCard title="Reset password" subtitle="Request a password reset link by email.">
      {submitted ? (
        <AuthStatus tone="success" icon={CircleCheck} title="Check your inbox">
          If an account exists for {email}, a reset link has been sent.
        </AuthStatus>
      ) : (
        <AuthForm onSubmit={handleSubmit}>
          <AuthField
            id="email"
            label="Email"
            type="email"
            required
            autoComplete="email"
            placeholder="you@example.com"
            value={email}
            icon={Mail}
            onChange={(event) => setEmail(event.target.value)}
          />

          {errorMessage ? <AuthStatus tone="error">{errorMessage}</AuthStatus> : null}

          <AuthPrimaryButton loading={isSubmitting} loadingText="Sending reset link...">
            Send reset link
          </AuthPrimaryButton>
        </AuthForm>
      )}

      <AuthActions>
        <AuthLink to={ROUTES.login}>Sign in</AuthLink>
      </AuthActions>
    </AuthCard>
  );
}

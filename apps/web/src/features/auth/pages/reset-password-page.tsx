import type { FormEvent } from 'react';
import { useState } from 'react';
import { Navigate, useNavigate, useSearch } from '@tanstack/react-router';
import { CircleCheck } from 'lucide-react';
import { ROUTES } from '@/app/routes';
import {
  AuthActions,
  AuthCard,
  AuthForm,
  AuthLink,
  AuthPasswordField,
  AuthPrimaryButton,
  AuthStatus,
} from '@/features/auth/auth-layout';
import { authClient } from '@/lib/auth-client';

export function ResetPasswordPage() {
  const search = useSearch({ strict: false });
  const token = (search as Record<string, string | undefined>).token;
  const navigate = useNavigate();

  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isReset, setIsReset] = useState(false);

  if (typeof token !== 'string') {
    return <Navigate to={ROUTES.login} replace />;
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
    setTimeout(navigate, 1500, { to: ROUTES.login });
  }

  return (
    <AuthCard title="Set new password" subtitle="Create a new password for your account.">
      {isReset ? (
        <AuthStatus tone="success" icon={CircleCheck} title="Password updated">
          Redirecting to sign in...
        </AuthStatus>
      ) : (
        <AuthForm onSubmit={handleSubmit}>
          <AuthPasswordField
            id="new-password"
            label="New password"
            required
            minLength={8}
            autoComplete="new-password"
            placeholder="Create a new password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />

          {errorMessage ? <AuthStatus tone="error">{errorMessage}</AuthStatus> : null}

          <AuthPrimaryButton loading={isSubmitting} loadingText="Updating password...">
            Update password
          </AuthPrimaryButton>
        </AuthForm>
      )}

      <AuthActions>
        <AuthLink to={ROUTES.login}>Sign in</AuthLink>
      </AuthActions>
    </AuthCard>
  );
}

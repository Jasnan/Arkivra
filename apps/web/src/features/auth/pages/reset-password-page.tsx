import type { FormEvent } from 'react';
import { useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { ROUTES } from '@/app/routes';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { AuthActions, AuthCard, AuthLayout } from '@/features/auth/auth-layout';
import { authClient } from '@/lib/auth-client';

export function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') ?? undefined;
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
    setTimeout(navigate, 600, ROUTES.login);
  }

  return (
    <AuthLayout>
      <AuthCard title="Set new password" subtitle="Create a new password for your account.">
        {isReset ? (
          <Alert>
            <AlertDescription>Password updated. Redirecting to sign in...</AlertDescription>
          </Alert>
        ) : (
          <form style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }} onSubmit={handleSubmit}>
            <Field>
              <FieldLabel htmlFor="new-password">New password</FieldLabel>
              <Input id="new-password" type="password" required minLength={8} autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} />
            </Field>

            {errorMessage ? <FieldError>{errorMessage}</FieldError> : null}

            <Button type="submit" w="100%" disabled={isSubmitting}>
              {isSubmitting ? 'Updating password…' : 'Update password'}
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

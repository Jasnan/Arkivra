import type { FormEvent } from 'react';
import { useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
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
          <Alert>
            <AlertDescription>Password updated. Redirecting to sign in...</AlertDescription>
          </Alert>
        ) : (
          <form className="space-y-4" onSubmit={handleSubmit}>
            <Field>
              <FieldLabel htmlFor="new-password">New password</FieldLabel>
              <Input
                id="new-password"
                type="password"
                required
                minLength={8}
                autoComplete="new-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </Field>

            {errorMessage ? <FieldError>{errorMessage}</FieldError> : null}

            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? 'Updating password…' : 'Update password'}
            </Button>
          </form>
        )}

        <AuthActions>
          <Link to="/login" className="font-medium text-foreground hover:underline">
            Sign in
          </Link>
        </AuthActions>
      </AuthCard>
    </AuthLayout>
  );
}

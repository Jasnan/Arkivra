import type { FormEvent } from 'react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { AuthCard, AuthLayout } from '@/features/auth/auth-layout';
import { authClient } from '@/lib/auth-client';

export function LoginPage() {
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);
    setIsSubmitting(true);

    const { data, error } = await authClient.signIn.email({
      email,
      password,
      rememberMe: true,
      callbackURL: '/',
    });

    setIsSubmitting(false);

    if (error) {
      setErrorMessage(error.message ?? 'Sign in failed.');
      return;
    }

    if (data && typeof data === 'object' && 'twoFactorRedirect' in data && data.twoFactorRedirect) {
      navigate('/two-factor/verify');
      return;
    }

    navigate('/');
  }

  async function handleOAuth(provider: 'google' | 'github') {
    setErrorMessage(null);
    const { error } = await authClient.signIn.social({ provider, callbackURL: '/' });

    if (error) {
      setErrorMessage(error.message ?? 'OAuth sign in failed.');
    }
  }

  return (
    <AuthLayout>
      <AuthCard title="Welcome back" subtitle="Sign in to access your vaults.">
        <form className="space-y-4" onSubmit={handleSubmit}>
          <Field>
            <FieldLabel htmlFor="email">Email</FieldLabel>
            <Input
              id="email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </Field>

          <Field>
            <FieldLabel htmlFor="password">Password</FieldLabel>
            <Input
              id="password"
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </Field>

          {errorMessage ? <FieldError>{errorMessage}</FieldError> : null}

          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? 'Signing in…' : 'Sign in'}
          </Button>
        </form>

        <div className="grid grid-cols-2 gap-2">
          <Button type="button" variant="outline" onClick={() => handleOAuth('google')}>
            Google
          </Button>
          <Button type="button" variant="outline" onClick={() => handleOAuth('github')}>
            GitHub
          </Button>
        </div>

        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <Link to="/request-password-reset" className="hover:text-foreground">Forgot password?</Link>
          <Link to="/register" className="hover:text-foreground">Create account</Link>
        </div>
      </AuthCard>
    </AuthLayout>
  );
}

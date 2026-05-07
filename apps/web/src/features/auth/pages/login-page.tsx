import type { FormEvent } from 'react';
import { useState } from 'react';
import { Flex, Grid } from '@chakra-ui/react';
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
    if (error) setErrorMessage(error.message ?? 'OAuth sign in failed.');
  }

  return (
    <AuthLayout>
      <AuthCard title="Welcome back" subtitle="Sign in to access your vaults.">
        <form style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }} onSubmit={handleSubmit}>
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

          <Button type="submit" w="100%" disabled={isSubmitting}>
            {isSubmitting ? 'Signing in…' : 'Sign in'}
          </Button>
        </form>

        <Grid templateColumns="1fr 1fr" gap="2">
          <Button type="button" variant="outline" onClick={() => handleOAuth('google')}>
            Google
          </Button>
          <Button type="button" variant="outline" onClick={() => handleOAuth('github')}>
            GitHub
          </Button>
        </Grid>

        <Flex align="center" justify="space-between" fontSize="sm" color="fg.muted">
          <Link to="/request-password-reset" style={{ color: 'var(--chakra-colors-fg-muted)' }}>
            Forgot password?
          </Link>
          <Link to="/register" style={{ color: 'var(--chakra-colors-fg-muted)' }}>
            Create account
          </Link>
        </Flex>
      </AuthCard>
    </AuthLayout>
  );
}

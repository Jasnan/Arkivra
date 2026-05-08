import type { FormEvent } from 'react';
import { useState } from 'react';
import { Box } from '@chakra-ui/react';
import { Link, useNavigate } from '@tanstack/react-router';
import { ROUTES } from '@/app/routes';
import { Button } from '@/components/ui/button';
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { AuthCard } from '@/features/auth/auth-layout';
import { authClient } from '@/lib/auth-client';

export function RegisterPage() {
  const navigate = useNavigate();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);
    setIsSubmitting(true);

    const { error } = await authClient.signUp.email({
      name,
      email,
      password,
      callbackURL: ROUTES.root,
    });

    setIsSubmitting(false);

    if (error) {
      setErrorMessage(error.message ?? 'Registration failed.');
      return;
    }

    navigate({ to: ROUTES.root });
  }

  return (
    <AuthCard title="Create account" subtitle="Start organizing your documents in Arkivra.">
        <form style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }} onSubmit={handleSubmit}>
          <Field>
            <FieldLabel htmlFor="name">Name</FieldLabel>
            <Input id="name" type="text" required autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} />
          </Field>

          <Field>
            <FieldLabel htmlFor="email">Email</FieldLabel>
            <Input id="email" type="email" required autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} />
          </Field>

          <Field>
            <FieldLabel htmlFor="password">Password</FieldLabel>
            <Input id="password" type="password" required minLength={8} autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} />
          </Field>

          {errorMessage ? <FieldError>{errorMessage}</FieldError> : null}

          <Button type="submit" w="100%" disabled={isSubmitting}>
            {isSubmitting ? 'Creating account…' : 'Create account'}
          </Button>
        </form>

        <Box fontSize="sm" color="fg.muted">
          Already have an account?{' '}
          <Link to={ROUTES.login} style={{ fontWeight: 500, color: 'var(--chakra-colors-fg)' }}>
            Sign in
          </Link>
        </Box>
      </AuthCard>
  );
}

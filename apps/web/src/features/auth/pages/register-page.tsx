import type { FormEvent } from 'react';
import { useState } from 'react';
import { Text } from '@chakra-ui/react';
import { useNavigate } from '@tanstack/react-router';
import { Mail, User } from 'lucide-react';
import { ROUTES } from '@/app/routes';
import {
  AuthCard,
  AuthField,
  AuthFooter,
  AuthForm,
  AuthLink,
  AuthPasswordField,
  AuthPrimaryButton,
  AuthStatus,
  OAuthButtons,
} from '@/features/auth/auth-layout';
import { authClient } from '@/lib/auth-client';

export function RegisterPage() {
  const navigate = useNavigate();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [oauthProvider, setOAuthProvider] = useState<'google' | 'github' | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);
    setIsSubmitting(true);

    const callbackURL = new URL(ROUTES.root, window.location.origin).toString();

    const { error } = await authClient.signUp.email({
      name,
      email,
      password,
      callbackURL,
    });

    setIsSubmitting(false);

    if (error) {
      setErrorMessage(error.message ?? 'Registration failed.');
      return;
    }

    navigate({ to: ROUTES.emailVerification, search: { email } });
  }

  async function handleOAuth(provider: 'google' | 'github') {
    setErrorMessage(null);
    setOAuthProvider(provider);
    const callbackURL = new URL(ROUTES.root, window.location.origin).toString();
    const { error } = await authClient.signIn.social({ provider, callbackURL });
    setOAuthProvider(null);
    if (error) setErrorMessage(error.message ?? 'OAuth sign up failed.');
  }

  return (
    <AuthCard title="Create account">
      <AuthForm onSubmit={handleSubmit}>
        <AuthField
          id="name"
          label="Name"
          type="text"
          required
          autoComplete="name"
          placeholder="Alex Morgan"
          value={name}
          icon={User}
          onChange={(event) => setName(event.target.value)}
        />

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

        <AuthPasswordField
          id="password"
          label="Password"
          required
          minLength={8}
          autoComplete="new-password"
          placeholder="Create a strong password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />

        {errorMessage ? <AuthStatus tone="error">{errorMessage}</AuthStatus> : null}

        <AuthPrimaryButton loading={isSubmitting} loadingText="Creating account...">
          Create
        </AuthPrimaryButton>
      </AuthForm>

      <OAuthButtons
        disabled={isSubmitting}
        loadingProvider={oauthProvider}
        onGoogle={() => handleOAuth('google')}
        onGithub={() => handleOAuth('github')}
      />

      <AuthFooter>
        <Text>Already have an account?</Text>
        <AuthLink to={ROUTES.login} withArrow>Sign in</AuthLink>
      </AuthFooter>
    </AuthCard>
  );
}

import type { FormEvent } from 'react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { AuthCard, AuthLayout } from '@/features/auth/auth-layout';
import { authClient } from '@/lib/auth-client';

const inputClassName = 'h-10 w-full rounded-xl border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

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
      callbackURL: '/',
    });

    setIsSubmitting(false);

    if (error) {
      setErrorMessage(error.message ?? 'Registration failed.');
      return;
    }

    navigate('/');
  }

  return (
    <AuthLayout>
      <AuthCard title="Create account" subtitle="Start organizing your documents in Arkivra.">
        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="space-y-1.5">
            <label htmlFor="name" className="text-sm font-medium">Name</label>
            <input id="name" type="text" required autoComplete="name" value={name} onChange={event => setName(event.target.value)} className={inputClassName} />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="email" className="text-sm font-medium">Email</label>
            <input id="email" type="email" required autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} className={inputClassName} />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="password" className="text-sm font-medium">Password</label>
            <input id="password" type="password" required minLength={8} autoComplete="new-password" value={password} onChange={event => setPassword(event.target.value)} className={inputClassName} />
          </div>

          {errorMessage ? <p className="text-sm text-destructive">{errorMessage}</p> : null}

          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? 'Creating account…' : 'Create account'}
          </Button>
        </form>

        <p className="text-sm text-muted-foreground">
          Already have an account?{' '}
          <Link to="/login" className="font-medium text-foreground hover:underline">Sign in</Link>
        </p>
      </AuthCard>
    </AuthLayout>
  );
}

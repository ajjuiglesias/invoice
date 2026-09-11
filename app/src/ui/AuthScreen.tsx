import { useState, type FormEvent } from 'react';
import { COMPANY } from '../domain/company';
import { Notice } from './components';

interface Props {
  onMagicLink: (email: string) => Promise<void>;
  onSignIn: (email: string, password: string) => Promise<void>;
  onSignUp: (email: string, password: string) => Promise<void>;
}

type Mode = 'signin' | 'signup' | 'magic';

export function AuthScreen({ onMagicLink, onSignIn, onSignUp }: Props) {
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: 'info' | 'error'; text: string } | null>(null);
  const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const validPassword = password.length >= 8;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy || !validEmail || (mode !== 'magic' && !validPassword)) return;
    setBusy(true);
    setMessage(null);
    try {
      if (mode === 'magic') {
        await onMagicLink(email.trim());
        setMessage({ tone: 'info', text: `Sign-in link sent to ${email.trim()}. Open it on this device.` });
      } else if (mode === 'signup') {
        await onSignUp(email.trim(), password);
        setMessage({ tone: 'info', text: 'Account created. Check your inbox if email confirmation is enabled.' });
      } else {
        await onSignIn(email.trim(), password);
      }
    } catch (error) {
      setMessage({ tone: 'error', text: error instanceof Error ? error.message : 'Could not continue.' });
    } finally {
      setBusy(false);
    }
  };

  const changeMode = (next: Mode) => {
    setMode(next);
    setMessage(null);
    setPassword('');
  };

  return (
    <main className="auth-shell">
      <section className="auth-brand" aria-label="About the invoice portal">
        <img src="logo-dark.png" alt={COMPANY.name} className="auth-brand__logo" />
        <div className="auth-brand__copy">
          <span className="eyebrow eyebrow--light">Freelancer portal</span>
          <h1>From completed work to a finished invoice.</h1>
          <p>Select approved tasks, attach the evidence, and send a consistent JCEM invoice in minutes.</p>
        </div>
        <div className="auth-brand__steps" aria-label="How it works">
          <span><b>01</b> Add your work</span>
          <span><b>02</b> Review the invoice</span>
          <span><b>03</b> Submit for approval</span>
        </div>
      </section>

      <section className="auth-panel">
        <div className="auth-card">
          <span className="eyebrow">Secure team access</span>
          <h2>{mode === 'signup' ? 'Create your account' : mode === 'magic' ? 'Email sign-in link' : 'Welcome back'}</h2>
          <p className="auth-card__intro">
            {mode === 'signup' ? 'Use your work email. New accounts start as freelancers.' :
              mode === 'magic' ? 'We will send a one-time link. No password needed.' :
                'Sign in to continue your invoice or review team submissions.'}
          </p>

          <div className="auth-tabs" role="tablist" aria-label="Account action">
            <button type="button" role="tab" aria-selected={mode === 'signin'} onClick={() => changeMode('signin')}>Sign in</button>
            <button type="button" role="tab" aria-selected={mode === 'signup'} onClick={() => changeMode('signup')}>New user</button>
          </div>

          {message && <Notice tone={message.tone}>{message.text}</Notice>}
          <form onSubmit={submit} className="auth-form">
            <label>
              <span>Email address</span>
              <input type="email" value={email} autoComplete="email" placeholder="you@company.com"
                aria-invalid={(email.length > 0 && !validEmail) || undefined}
                onChange={(event) => setEmail(event.target.value)} />
            </label>

            {mode !== 'magic' && (
              <label>
                <span>Password</span>
                <div className="password-field">
                  <input type={showPassword ? 'text' : 'password'} value={password}
                    autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                    placeholder={mode === 'signup' ? 'At least 8 characters' : 'Your password'}
                    aria-invalid={(password.length > 0 && !validPassword) || undefined}
                    onChange={(event) => setPassword(event.target.value)} />
                  <button type="button" onClick={() => setShowPassword((shown) => !shown)}>{showPassword ? 'Hide' : 'Show'}</button>
                </div>
              </label>
            )}

            <button className="btn btn--primary auth-submit" type="submit"
              disabled={busy || !validEmail || (mode !== 'magic' && !validPassword)}>
              {busy ? <><span className="spinner" aria-hidden="true" /> Please wait…</> :
                mode === 'signup' ? 'Create account' : mode === 'magic' ? 'Send secure link' : 'Sign in'}
            </button>
          </form>

          <button type="button" className="auth-alternative" onClick={() => changeMode(mode === 'magic' ? 'signin' : 'magic')}>
            {mode === 'magic' ? 'Use password instead' : 'Sign in with an email link'}
          </button>
          <p className="auth-privacy">Bank details stay on this device and are never stored in the team database.</p>
        </div>
      </section>
    </main>
  );
}

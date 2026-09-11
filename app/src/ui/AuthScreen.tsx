import { useState, type FormEvent } from 'react';
import { COMPANY } from '../domain/company';
import { Notice } from './components';

interface Props {
  onMagicLink: (email: string) => Promise<void>;
  onSignIn: (email: string, password: string) => Promise<void>;
  onSignUp: (email: string, password: string) => Promise<void>;
  onResetPassword: (email: string) => Promise<void>;
}

type Mode = 'signin' | 'signup' | 'magic' | 'reset';

export function AuthScreen({ onMagicLink, onSignIn, onSignUp, onResetPassword }: Props) {
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
    if (busy || !validEmail || (!['magic', 'reset'].includes(mode) && !validPassword)) return;
    setBusy(true);
    setMessage(null);
    try {
      if (mode === 'reset') {
        await onResetPassword(email.trim());
        setMessage({ tone: 'info', text: `Password setup link sent to ${email.trim()}. Open it to create your password.` });
      } else if (mode === 'magic') {
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
          <h2>{mode === 'signup' ? 'Create your account' : mode === 'magic' ? 'Email sign-in link' : mode === 'reset' ? 'Create a password' : 'Welcome back'}</h2>
          <p className="auth-card__intro">
            {mode === 'signup' ? 'Use the exact email your administrator authorised for you.' :
              mode === 'magic' ? 'We will send a one-time link. No password needed.' :
              mode === 'reset' ? 'We will email a secure link where you can set or replace your password.' :
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

            {mode !== 'magic' && mode !== 'reset' && (
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
              disabled={busy || !validEmail || (!['magic', 'reset'].includes(mode) && !validPassword)}>
              {busy ? <><span className="spinner" aria-hidden="true" /> Please wait…</> :
                mode === 'signup' ? 'Create account' : mode === 'magic' ? 'Send secure link' : mode === 'reset' ? 'Send password setup link' : 'Sign in'}
            </button>
          </form>

          {mode === 'signin' && <button type="button" className="auth-forgot" onClick={() => changeMode('reset')}>Forgot or need to create a password?</button>}
          <button type="button" className="auth-alternative" onClick={() => changeMode(mode === 'magic' || mode === 'reset' ? 'signin' : 'magic')}>
            {mode === 'magic' || mode === 'reset' ? 'Back to password sign in' : 'Sign in with an email link'}
          </button>
          <p className="auth-privacy">Bank details stay on this device and are never stored in the team database.</p>
        </div>
      </section>
    </main>
  );
}

interface PasswordSetupProps {
  onSave: (password: string) => Promise<void>;
}

export function PasswordSetupScreen({ onSave }: PasswordSetupProps) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const valid = password.length >= 8 && password === confirm;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!valid || busy) return;
    setBusy(true);
    setMessage(null);
    try {
      await onSave(password);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not save your password.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="auth-shell">
      <section className="auth-brand" aria-label="About the invoice portal">
        <img src="logo-dark.png" alt={COMPANY.name} className="auth-brand__logo" />
        <div className="auth-brand__copy"><span className="eyebrow eyebrow--light">Secure account</span><h1>Create your password.</h1><p>Use it next time for fast access without opening your email.</p></div>
      </section>
      <section className="auth-panel">
        <div className="auth-card">
          <span className="eyebrow">Password setup</span>
          <h2>Choose a new password</h2>
          <p className="auth-card__intro">Use at least eight characters. A longer, unique password is safer.</p>
          {message && <Notice tone="error">{message}</Notice>}
          <form className="auth-form" onSubmit={submit}>
            <label><span>New password</span><div className="password-field"><input type={show ? 'text' : 'password'} value={password} autoComplete="new-password" placeholder="At least 8 characters" onChange={(e) => setPassword(e.target.value)} /><button type="button" onClick={() => setShow((v) => !v)}>{show ? 'Hide' : 'Show'}</button></div></label>
            <label><span>Confirm password</span><input type={show ? 'text' : 'password'} value={confirm} autoComplete="new-password" placeholder="Enter it again" aria-invalid={(confirm.length > 0 && confirm !== password) || undefined} onChange={(e) => setConfirm(e.target.value)} /></label>
            {confirm.length > 0 && confirm !== password && <span className="field-error">Passwords do not match.</span>}
            <button className="btn btn--primary auth-submit" type="submit" disabled={!valid || busy}>{busy ? 'Saving…' : 'Save password'}</button>
          </form>
        </div>
      </section>
    </main>
  );
}

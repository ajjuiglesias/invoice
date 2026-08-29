import { useState } from 'react';
import { COMPANY } from '../domain/company';
import { Card, Field, Notice } from './components';

interface Props {
  onSignIn: (email: string) => Promise<void>;
}

/**
 * Sign-in by email link. No passwords to choose, forget, or store — which
 * also means the app never handles a credential.
 */
export function AuthScreen({ onSignIn }: Props) {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid || busy) return;

    setBusy(true);
    setError(null);
    try {
      await onSignIn(email.trim());
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send the sign-in link.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth">
      <img className="auth__logo" src="logo.png" alt={COMPANY.name} />

      {sent ? (
        <Card title="Check your email">
          <Notice tone="info" title="Link sent. ">
            We have emailed a sign-in link to <strong>{email.trim()}</strong>. Open it on this
            device and you will be signed straight in.
          </Notice>
          <button type="button" className="btn btn--ghost" onClick={() => setSent(false)}>
            Use a different address
          </button>
        </Card>
      ) : (
        <Card title="Sign in" subtitle="Freelancer invoicing">
          {error && <Notice tone="error">{error}</Notice>}

          <form onSubmit={submit}>
            <Field label="Work email address" hint="We will email you a link — no password needed">
              <input
                type="email"
                value={email}
                autoComplete="email"
                autoFocus
                spellCheck={false}
                placeholder="you@example.com"
                onChange={(e) => setEmail(e.target.value)}
              />
            </Field>

            <div className="actions" style={{ marginTop: 16 }}>
              <button type="submit" className="btn btn--primary" disabled={!valid || busy}>
                {busy && <span className="spinner" aria-hidden="true" />}
                {busy ? 'Sending…' : 'Email me a sign-in link'}
              </button>
            </div>
          </form>
        </Card>
      )}

      <p className="small muted" style={{ textAlign: 'center' }}>
        Your bank details are never uploaded — they stay in this browser.
      </p>
    </div>
  );
}

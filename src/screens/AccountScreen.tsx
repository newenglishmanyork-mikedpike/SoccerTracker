import { useRef, useState } from 'react';
import { importBackup } from '../data';
import { exportBackup } from '../db';
import { download, today } from '../lib/format';
import { authErrorMessage, resetPassword, signIn, signInWithGoogle, signOut, signUp } from '../sync';
import { useSyncStatus, type SyncStatus } from '../sync/status';

export default function AccountScreen() {
  const status = useSyncStatus();
  return (
    <div className="screen">
      <header className="screen-header">
        <h1>Account</h1>
      </header>
      <SyncCard status={status} />
      <BackupCard signedIn={!!status.email} />
    </div>
  );
}

const STATE_TEXT: Record<SyncStatus['state'], string> = {
  unavailable: '',
  loading: 'Connecting…',
  signedOut: '',
  syncing: 'Syncing…',
  synced: 'All changes synced',
  offline: 'Offline. Changes are saved on this device and will sync when you’re back online.',
  error: 'Sync problem',
};

function SyncCard({ status }: { status: SyncStatus }) {
  if (status.state === 'unavailable') {
    return (
      <div className="card">
        <h2>Sync</h2>
        <p className="hint">
          Sync isn’t set up for this site yet, so your squad and matches are stored on this device only.
        </p>
      </div>
    );
  }
  if (status.state === 'loading') {
    return (
      <div className="card">
        <p className="hint">Connecting…</p>
      </div>
    );
  }
  if (!status.email) return <SignInForm />;

  return (
    <div className="card sync-card">
      <h2>Sync</h2>
      <p className="sync-line">
        <span className={`dot ${status.state}`} />
        {STATE_TEXT[status.state]}
      </p>
      {status.error && <p className="error">{status.error}</p>}
      <p className="hint">
        Signed in as <strong>{status.email}</strong>. Sign in the same way on your other devices to see the same squad
        and matches.
      </p>
      <div className="actions">
        <SignOutButton />
      </div>
    </div>
  );
}

function SignOutButton() {
  const [busy, setBusy] = useState(false);
  const run = async () => {
    if (!confirm('Sign out? Your teams will be removed from this device. They stay safe in your account.')) return;
    setBusy(true);
    try {
      if ((await signOut(false)) === 'pending') {
        const force = confirm(
          'Some changes haven’t reached the cloud yet (are you offline?). If you sign out now they’ll be lost. Sign out anyway?',
        );
        if (force) await signOut(true);
      }
    } finally {
      setBusy(false);
    }
  };
  return (
    <button className="btn ghost" onClick={run} disabled={busy}>
      {busy ? 'Signing out…' : 'Sign out'}
    </button>
  );
}

function SignInForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      await fn();
    } catch (err) {
      setError(authErrorMessage(err) || null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      className="card form"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => signIn(email.trim(), password));
      }}
    >
      <h2>Sync between devices</h2>
      <p className="hint">
        Sign in to keep your squad and matches the same on your phone, tablet and computer. Use the same sign-in on
        every device. Anything already on this device will be added to your account.
      </p>
      <button type="button" className="btn google" disabled={busy} onClick={() => run(signInWithGoogle)}>
        <GoogleLogo /> Continue with Google
      </button>
      <div className="divider">
        <span>or use email</span>
      </div>
      <label>
        Email
        <input
          className="input"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
      </label>
      <label>
        Password
        <input
          className="input"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          minLength={6}
          required
        />
      </label>
      {error && <p className="error">{error}</p>}
      {info && <p className="hint">{info}</p>}
      <div className="actions">
        <button
          type="button"
          className="btn"
          disabled={busy}
          onClick={(e) => {
            const form = (e.currentTarget as HTMLButtonElement).form!;
            if (form.reportValidity()) run(() => signUp(email.trim(), password));
          }}
        >
          Create account
        </button>
        <button type="submit" className="btn primary" disabled={busy}>
          Sign in
        </button>
      </div>
      <button
        type="button"
        className="btn link"
        disabled={busy}
        onClick={() => {
          if (!email.trim()) {
            setError('Enter your email first, then tap “Forgot password?”.');
            return;
          }
          run(async () => {
            await resetPassword(email.trim());
            setInfo(`Password reset email sent to ${email.trim()}.`);
          });
        }}
      >
        Forgot password?
      </button>
    </form>
  );
}

function GoogleLogo() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}

function BackupCard({ signedIn }: { signedIn: boolean }) {
  const fileRef = useRef<HTMLInputElement>(null);

  const onImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const where = signedIn ? 'on all your synced devices' : 'on this device';
    if (!confirm(`Restoring a backup replaces all players and matches ${where}. Continue?`)) return;
    try {
      await importBackup(JSON.parse(await file.text()));
      alert('Backup restored.');
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Could not read that file.');
    }
  };

  return (
    <>
      <h2 className="section-title">Backup</h2>
      <p className="hint">Download a copy of everything as a file, or restore one.</p>
      <div className="actions wrap">
        <button
          className="btn"
          onClick={async () =>
            download(`soccer-backup-${today()}.json`, JSON.stringify(await exportBackup(), null, 2), 'application/json')
          }
        >
          Download backup
        </button>
        <button className="btn" onClick={() => fileRef.current?.click()}>
          Restore backup
        </button>
        <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={onImport} />
      </div>
    </>
  );
}

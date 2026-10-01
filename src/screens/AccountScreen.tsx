import { useRef, useState } from 'react';
import { importBackup } from '../data';
import { exportBackup } from '../db';
import { download, today } from '../lib/format';
import { authErrorMessage, resetPassword, signIn, signOut, signUp } from '../sync';
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
        Signed in as <strong>{status.email}</strong>. Sign in with the same email on your other devices to see the same
        squad and matches.
      </p>
      <div className="actions">
        <button className="btn ghost" onClick={() => signOut()}>
          Sign out
        </button>
      </div>
    </div>
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
      setError(authErrorMessage(err));
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
        Sign in to keep your squad and matches the same on your phone, tablet and computer. The first time, tap
        <strong> Create account</strong>. Anything already on this device will be added to your account.
      </p>
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

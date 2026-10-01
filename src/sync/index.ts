import { firebaseConfig, useEmulators } from './config';
import { setSyncStatus } from './status';

type Engine = typeof import('./engine');
export type { SyncTable } from './engine';

let engine: Promise<Engine> | null = null;

export const syncAvailable = firebaseConfig !== null;

export function initSync(): void {
  if (!firebaseConfig) {
    setSyncStatus({ state: 'unavailable' });
    return;
  }
  const config = firebaseConfig;
  setSyncStatus({ state: 'loading' });
  engine = import('./engine').then((e) => {
    e.init(config, useEmulators);
    return e;
  });
  engine.catch((err) => setSyncStatus({ state: 'error', error: String(err) }));
}

export function pushRecord(table: 'players' | 'matches', rec: { id: string }): void {
  engine?.then((e) => e.push(table, rec)).catch(() => {});
}

export function pushDeletion(table: 'players' | 'matches', id: string, updatedAt: number): void {
  engine?.then((e) => e.pushDeletion(table, id, updatedAt)).catch(() => {});
}

async function withEngine<T>(fn: (e: Engine) => Promise<T>): Promise<T> {
  if (!engine) throw new Error('Sync is not set up for this site.');
  return fn(await engine);
}

export const signIn = (email: string, password: string) => withEngine((e) => e.signIn(email, password));
export const signUp = (email: string, password: string) => withEngine((e) => e.signUp(email, password));
export const signOut = () => withEngine((e) => e.signOut());
export const resetPassword = (email: string) => withEngine((e) => e.resetPassword(email));

/** Turn Firebase auth error codes into something a coach can act on. */
export function authErrorMessage(err: unknown): string {
  const code = (err as { code?: string })?.code ?? '';
  switch (code) {
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'Email or password is incorrect.';
    case 'auth/email-already-in-use':
      return 'An account with this email already exists. Sign in instead.';
    case 'auth/weak-password':
      return 'Password must be at least 6 characters.';
    case 'auth/invalid-email':
      return 'That email address doesn’t look right.';
    case 'auth/missing-password':
      return 'Enter a password.';
    case 'auth/network-request-failed':
      return 'No connection. Try again when you’re online.';
    case 'auth/too-many-requests':
      return 'Too many attempts. Wait a few minutes and try again.';
    default:
      return err instanceof Error ? err.message : 'Something went wrong.';
  }
}

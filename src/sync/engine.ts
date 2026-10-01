// Firebase-backed sync. Loaded lazily (see ./index.ts) so builds without a
// Firebase config never download the SDK.
//
// Dexie stays the source of truth for the UI. This module mirrors each
// record to users/{uid}/{players|matches}/{id} in Firestore and applies
// remote changes back into Dexie, resolving conflicts with `decide()`.
import { initializeApp } from 'firebase/app';
import {
  connectAuthEmulator,
  createUserWithEmailAndPassword,
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut as fbSignOut,
  type Auth,
  type User,
} from 'firebase/auth';
import {
  clearIndexedDbPersistence,
  collection,
  connectFirestoreEmulator,
  doc,
  initializeFirestore,
  onSnapshot,
  persistentLocalCache,
  persistentMultipleTabManager,
  setDoc,
  terminate,
  waitForPendingWrites,
  type Firestore,
  type QuerySnapshot,
} from 'firebase/firestore';
import { clearLocalData, db } from '../db';
import type { FirebaseWebConfig } from './config';
import { decide, type RemoteRecord } from './merge';
import { getSyncStatus, setSyncStatus } from './status';

export type SyncTable = 'teams' | 'players' | 'matches';
const TABLES: SyncTable[] = ['teams', 'players', 'matches'];

type Rec = RemoteRecord & { id: string };

let auth: Auth;
let fs: Firestore;
let user: User | null = null;
let stopListeners: (() => void)[] = [];
const meta: Record<SyncTable, { fromCache: boolean; pending: boolean }> = {
  teams: { fromCache: true, pending: false },
  players: { fromCache: true, pending: false },
  matches: { fromCache: true, pending: false },
};

export function init(config: FirebaseWebConfig, emulators: boolean): void {
  const app = initializeApp(config);
  auth = getAuth(app);
  fs = initializeFirestore(app, {
    // Queued writes survive reloads, so changes made offline still reach the cloud.
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
    ignoreUndefinedProperties: true,
  });
  if (emulators) {
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
    connectFirestoreEmulator(fs, '127.0.0.1', 8080);
  }
  window.addEventListener('online', refreshStatus);
  window.addEventListener('offline', refreshStatus);
  onAuthStateChanged(auth, (u) => {
    stop();
    user = u;
    if (u) start(u).catch(fail);
    else setSyncStatus({ state: 'signedOut' });
  });
}

function refreshStatus(): void {
  if (!user) return;
  const cur = getSyncStatus();
  if (cur.state === 'error') return;
  const offline = !navigator.onLine || TABLES.some((t) => meta[t].fromCache);
  const pending = TABLES.some((t) => meta[t].pending);
  setSyncStatus({ state: offline ? 'offline' : pending ? 'syncing' : 'synced', email: user.email ?? undefined });
}

function col(uid: string, table: SyncTable) {
  return collection(fs, 'users', uid, table);
}

async function start(u: User): Promise<void> {
  setSyncStatus({ state: 'syncing', email: u.email ?? undefined });

  // Data left on this device by a different account must never be uploaded
  // into this one. (Normal sign-out already wipes it; this is a safety net.)
  // Data that was never synced (no owner yet) is merged in on first sign-in.
  const owner = (await db.meta.get('ownerUid'))?.value;
  if (owner && owner !== u.uid) await clearLocalData();
  await db.meta.put({ key: 'ownerUid', value: u.uid });
  if (user !== u) return; // signed out again while we were busy

  for (const table of TABLES) {
    meta[table] = { fromCache: true, pending: false };
    let reconciled = false;
    // Process snapshots one at a time so Dexie writes don't interleave.
    let queue = Promise.resolve();
    const unsub = onSnapshot(
      col(u.uid, table),
      { includeMetadataChanges: true },
      (snap) => {
        queue = queue
          .then(async () => {
            await applyRemote(table, snap);
            // Once we have the server's view, upload anything newer on this
            // device (changes made while signed out, or before sync existed).
            if (!snap.metadata.fromCache && !reconciled) {
              reconciled = true;
              await pushNewerLocal(table, snap);
            }
            meta[table] = { fromCache: snap.metadata.fromCache, pending: snap.metadata.hasPendingWrites };
            refreshStatus();
          })
          .catch(fail);
      },
      fail,
    );
    stopListeners.push(unsub);
  }
}

function stop(): void {
  stopListeners.forEach((s) => s());
  stopListeners = [];
}

function fail(err: unknown): void {
  console.error('Sync error', err);
  const code = (err as { code?: string })?.code;
  setSyncStatus({
    state: 'error',
    email: user?.email ?? undefined,
    error:
      code === 'permission-denied'
        ? 'The cloud database refused access. Check the Firestore security rules.'
        : err instanceof Error
          ? err.message
          : String(err),
  });
}

async function applyRemote(table: SyncTable, snap: QuerySnapshot): Promise<void> {
  const changed = snap
    .docChanges()
    .filter((c) => c.type !== 'removed' && !c.doc.metadata.hasPendingWrites)
    .map((c) => c.doc.data() as Rec);
  if (changed.length === 0) return;

  const t = db.table(table);
  await db.transaction('rw', t, async () => {
    const locals = await t.bulkGet(changed.map((r) => r.id));
    const puts: Rec[] = [];
    const deletes: string[] = [];
    changed.forEach((remote, i) => {
      const action = decide(locals[i], remote);
      if (action === 'pull') {
        const { deleted: _deleted, ...rec } = remote;
        puts.push(rec);
      } else if (action === 'deleteLocal') {
        deletes.push(remote.id);
      }
    });
    if (puts.length) await t.bulkPut(puts);
    if (deletes.length) await t.bulkDelete(deletes);
  });
}

async function pushNewerLocal(table: SyncTable, snap: QuerySnapshot): Promise<void> {
  const remote = new Map(snap.docs.map((d) => [d.id, d.data() as Rec]));
  const locals = (await db.table(table).toArray()) as Rec[];
  for (const local of locals) {
    if (decide(local, remote.get(local.id)) === 'push') push(table, local);
  }
}

/** Mirror a record to the cloud. Not awaited: offline writes are queued by Firestore. */
export function push(table: SyncTable, rec: { id: string }): void {
  if (!user) return;
  setDoc(doc(col(user.uid, table), rec.id), { ...rec, deleted: false }).catch(fail);
}

export function pushDeletion(table: SyncTable, id: string, updatedAt: number): void {
  if (!user) return;
  setDoc(doc(col(user.uid, table), id), { id, updatedAt, deleted: true }).catch(fail);
}

export async function signIn(email: string, password: string): Promise<void> {
  await signInWithEmailAndPassword(auth, email, password);
}

export async function signInWithGoogle(): Promise<void> {
  // A popup rather than a redirect: redirects break on sites (like GitHub
  // Pages) whose domain differs from the Firebase auth domain.
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  await signInWithPopup(auth, provider);
}

export async function signUp(email: string, password: string): Promise<void> {
  await createUserWithEmailAndPassword(auth, email, password);
}

/**
 * Sign out and remove this account's data from the device, so the next
 * person to use it starts clean. Returns 'pending' (and does nothing) if
 * some changes haven't reached the cloud yet, unless `force` is set.
 */
export async function signOut(force: boolean): Promise<'pending' | 'done'> {
  if (!force) {
    const flushed = await Promise.race([
      waitForPendingWrites(fs).then(() => true),
      new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 5000)),
    ]);
    if (!flushed) return 'pending';
  }
  stop();
  await fbSignOut(auth);
  await terminate(fs);
  await clearIndexedDbPersistence(fs).catch(() => {});
  await clearLocalData();
  // Start fresh so Firestore and the UI hold nothing from the old account.
  location.reload();
  return 'done';
}

export async function resetPassword(email: string): Promise<void> {
  await sendPasswordResetEmail(auth, email);
}

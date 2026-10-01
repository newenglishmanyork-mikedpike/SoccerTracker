import { useSyncExternalStore } from 'react';

export type SyncState =
  | 'unavailable' // no Firebase config in this build
  | 'loading'
  | 'signedOut'
  | 'syncing'
  | 'synced'
  | 'offline'
  | 'error';

export interface SyncStatus {
  state: SyncState;
  email?: string;
  error?: string;
}

let status: SyncStatus = { state: 'unavailable' };
const listeners = new Set<() => void>();

export function getSyncStatus(): SyncStatus {
  return status;
}

export function setSyncStatus(next: SyncStatus): void {
  if (next.state === status.state && next.email === status.email && next.error === status.error) return;
  status = next;
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useSyncStatus(): SyncStatus {
  return useSyncExternalStore(subscribe, getSyncStatus);
}

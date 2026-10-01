export interface Versioned {
  updatedAt?: number;
}

export interface RemoteRecord extends Versioned {
  /** Tombstone: the record was deleted on some device. */
  deleted?: boolean;
}

export type SyncAction = 'push' | 'pull' | 'deleteLocal' | 'none';

/**
 * Decide how to reconcile one record that may exist locally and/or in the
 * cloud. Last write wins, using each record's `updatedAt`.
 */
export function decide(local: Versioned | undefined, remote: RemoteRecord | undefined): SyncAction {
  if (!remote) return local ? 'push' : 'none';
  if (!local) return remote.deleted ? 'none' : 'pull';
  const l = local.updatedAt ?? 0;
  const r = remote.updatedAt ?? 0;
  if (r > l) return remote.deleted ? 'deleteLocal' : 'pull';
  if (l > r) return 'push';
  return 'none';
}

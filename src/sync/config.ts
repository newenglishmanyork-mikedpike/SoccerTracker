export interface FirebaseWebConfig {
  apiKey: string;
  projectId: string;
  authDomain?: string;
  appId?: string;
  [key: string]: string | undefined;
}

/**
 * Parse the Firebase web config. Accepts JSON or the JavaScript object that
 * the Firebase console shows (`const firebaseConfig = { apiKey: "..." }`),
 * so it can be pasted into a GitHub variable as-is.
 */
export function parseFirebaseConfig(raw: string | undefined): FirebaseWebConfig | null {
  if (!raw?.trim()) return null;
  const out: Record<string, string> = {};
  for (const m of raw.matchAll(/["']?(\w+)["']?\s*:\s*["']([^"']*)["']/g)) out[m[1]] = m[2];
  if (!out.apiKey || !out.projectId) return null;
  return out as FirebaseWebConfig;
}

export const firebaseConfig = parseFirebaseConfig(import.meta.env.VITE_FIREBASE_CONFIG);

/** Local testing only: talk to the Firebase emulators on localhost. */
export const useEmulators = import.meta.env.VITE_FIREBASE_EMULATOR === '1';

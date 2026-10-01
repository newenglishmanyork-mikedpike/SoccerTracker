import { describe, expect, it } from 'vitest';
import { parseFirebaseConfig } from './config';
import { decide } from './merge';

describe('decide', () => {
  it('pushes local-only records and pulls remote-only ones', () => {
    expect(decide({ updatedAt: 1 }, undefined)).toBe('push');
    expect(decide({}, undefined)).toBe('push'); // records from before sync existed
    expect(decide(undefined, { updatedAt: 1 })).toBe('pull');
    expect(decide(undefined, { updatedAt: 1, deleted: true })).toBe('none');
  });

  it('newest wins', () => {
    expect(decide({ updatedAt: 5 }, { updatedAt: 3 })).toBe('push');
    expect(decide({ updatedAt: 3 }, { updatedAt: 5 })).toBe('pull');
    expect(decide({ updatedAt: 5 }, { updatedAt: 5 })).toBe('none');
  });

  it('applies newer remote deletions, but a newer local edit wins over an older deletion', () => {
    expect(decide({ updatedAt: 3 }, { updatedAt: 5, deleted: true })).toBe('deleteLocal');
    expect(decide({ updatedAt: 7 }, { updatedAt: 5, deleted: true })).toBe('push');
  });
});

describe('parseFirebaseConfig', () => {
  it('accepts the snippet copied from the Firebase console', () => {
    const snippet = `const firebaseConfig = {
      apiKey: "AIzaSyExample",
      authDomain: "team.firebaseapp.com",
      projectId: "team",
      storageBucket: "team.firebasestorage.app",
      messagingSenderId: "123",
      appId: "1:123:web:abc"
    };`;
    expect(parseFirebaseConfig(snippet)).toMatchObject({
      apiKey: 'AIzaSyExample',
      authDomain: 'team.firebaseapp.com',
      projectId: 'team',
      appId: '1:123:web:abc',
    });
  });

  it('accepts JSON and rejects empty or incomplete config', () => {
    expect(parseFirebaseConfig('{"apiKey":"k","projectId":"p"}')).toMatchObject({ apiKey: 'k', projectId: 'p' });
    expect(parseFirebaseConfig(undefined)).toBeNull();
    expect(parseFirebaseConfig('  ')).toBeNull();
    expect(parseFirebaseConfig('{ apiKey: "k" }')).toBeNull();
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { migrateStorageKeys, STORAGE_KEYS } from '@/lib/keys';

// Isolate migration from browser/Node storage implementations, including quota failures.
let storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
beforeEach(() => {
  const entries = new Map<string, string>();
  storage = {
    getItem: (key) => entries.get(key) ?? null,
    setItem: (key, value) => { entries.set(key, value); },
    removeItem: (key) => { entries.delete(key); },
  };
  vi.stubGlobal('window', { localStorage: storage });
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('storage migration', () => {
  it('preserves browser data when upgrading and can safely run again', () => {
    const entries = [
      ['roamfar:theme', STORAGE_KEYS.theme, 'dark'],
      ['roamfar:workspace:v2', STORAGE_KEYS.workspace, '{"draft":"Kyoto"}'],
      ['roamfar:library:v1', STORAGE_KEYS.library, '[{"id":"saved-trip"}]'],
      ['roamfar:scene-visit', STORAGE_KEYS.sceneVisit, '7'],
    ];
    for (const [legacy, , value] of entries) storage.setItem(legacy, value);

    migrateStorageKeys();
    migrateStorageKeys();

    for (const [legacy, current, value] of entries) {
      expect(storage.getItem(current)).toBe(value);
      expect(storage.getItem(legacy)).toBeNull();
    }
  });

  it('keeps the current value when both versions exist', () => {
    storage.setItem('roamfar:theme', 'dark');
    storage.setItem(STORAGE_KEYS.theme, 'light');

    migrateStorageKeys();

    expect(storage.getItem(STORAGE_KEYS.theme)).toBe('light');
    expect(storage.getItem('roamfar:theme')).toBeNull();
  });

  it('retains the legacy data when storage is full, then retries on a later visit', () => {
    storage.setItem('roamfar:library:v1', '[{"id":"saved-trip"}]');
    const write = vi.spyOn(storage, 'setItem').mockImplementation(() => {
      throw new DOMException('Full', 'QuotaExceededError');
    });

    expect(() => migrateStorageKeys()).not.toThrow();
    expect(storage.getItem('roamfar:library:v1')).toBe('[{"id":"saved-trip"}]');
    expect(storage.getItem(STORAGE_KEYS.library)).toBeNull();

    write.mockRestore();
    migrateStorageKeys();
    expect(storage.getItem(STORAGE_KEYS.library)).toBe('[{"id":"saved-trip"}]');
  });

  it('does not prevent startup when storage is unavailable', () => {
    vi.spyOn(storage, 'getItem').mockImplementation(() => {
      throw new DOMException('Blocked', 'SecurityError');
    });
    expect(() => migrateStorageKeys()).not.toThrow();
  });
});

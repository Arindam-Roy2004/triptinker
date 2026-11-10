/** Every localStorage key the app owns, in one place. index.html repeats `theme` for its pre-paint script. */
export const STORAGE_KEYS = {
  theme: 'triptinker:theme',
  workspace: 'triptinker:workspace:v2',
  library: 'triptinker:library:v1',
  sceneVisit: 'triptinker:scene-visit',
} as const;

/** Preserve existing browser data when upgrading from the former Roamfar name. */
export function migrateStorageKeys() {
  for (const key of Object.values(STORAGE_KEYS)) {
    const legacyKey = key.replace('triptinker:', 'roamfar:');
    try {
      const legacyValue = window.localStorage.getItem(legacyKey);
      if (legacyValue === null) continue;
      if (window.localStorage.getItem(key) === null) window.localStorage.setItem(key, legacyValue);
      window.localStorage.removeItem(legacyKey);
    } catch {
      // Keep the old value if writing fails; a later visit can retry the migration.
    }
  }
}

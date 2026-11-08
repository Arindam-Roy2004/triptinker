/** Every localStorage key the app owns, in one place. index.html repeats `theme` for its pre-paint script. */
export const STORAGE_KEYS = {
  theme: 'roamfar:theme',
  workspace: 'roamfar:workspace:v2',
  library: 'roamfar:library:v1',
  sceneVisit: 'roamfar:scene-visit',
} as const;

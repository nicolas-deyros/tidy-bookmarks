export const THEMES = ['quiet', 'vivid', 'deck'];
export const APPEARANCES = ['light', 'dark', 'system'];
export const DEFAULT_PREF = { theme: 'quiet', appearance: 'system' };

export function resolveAppearance(setting, prefersDark) {
  if (setting === 'light' || setting === 'dark') return setting;
  return prefersDark ? 'dark' : 'light';
}

export function normalizeThemePref(pref = {}) {
  return {
    theme: THEMES.includes(pref.theme) ? pref.theme : DEFAULT_PREF.theme,
    appearance: APPEARANCES.includes(pref.appearance) ? pref.appearance : DEFAULT_PREF.appearance
  };
}

export function migrateLegacyTheme(legacy) {
  if (legacy === 'light') return { theme: 'quiet', appearance: 'light' };
  if (legacy === 'dark') return { theme: 'quiet', appearance: 'dark' };
  return { theme: 'quiet', appearance: 'system' }; // 'auto' or anything else
}

// DOM glue kept tiny + dependency-free so both pages can share it.
export function applyTheme(rootEl, pref) {
  const { theme, appearance } = normalizeThemePref(pref);
  rootEl.dataset.theme = theme;
  rootEl.dataset.appearance = appearance;
}

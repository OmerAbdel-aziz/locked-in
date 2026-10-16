/**
 * Appearance themes — Phase 9 polish (grill rulings).
 *
 * The ten `data-theme` values `app/globals.css` resolves (five palettes ×
 * light/dark: Mint, Neutral, Blue, Airbnb, Rabbit — the five temp.css
 * palettes); `<html>` first-paints `mint-dark` (see `app/layout.tsx`).
 * Switching is device-local state: it applies instantly and persists to
 * localStorage, never waiting on the server round-trip the durations need —
 * making it wait for Save would be dishonest UI.
 *
 * The theme is an external system (localStorage + `documentElement`), so
 * this module is a tiny store: `applyTheme` writes both and notifies
 * subscribers, and `useTheme` reads it through `useSyncExternalStore` —
 * the canonical React answer, and the same stance `useTzOffsetMinutes` /
 * `useCountdown` took for the clock (no storage or clock read during
 * render; the server snapshot is the default theme).
 */

import { useCallback, useSyncExternalStore } from "react";

export const THEME_PALETTES = ["mint", "neutral", "blue", "airbnb", "rabbit"] as const;
export type ThemePalette = (typeof THEME_PALETTES)[number];

export const THEME_MODES = ["light", "dark"] as const;
export type ThemeMode = (typeof THEME_MODES)[number];

/** Every `data-theme` value `globals.css` resolves. */
export const THEMES = [
  "mint",
  "mint-dark",
  "neutral",
  "neutral-dark",
  "blue",
  "blue-dark",
  "airbnb",
  "airbnb-dark",
  "rabbit",
  "rabbit-dark",
] as const;
export type Theme = (typeof THEMES)[number];

/** First paint (layout.tsx) and the fallback for unknown stored values. */
export const DEFAULT_THEME: Theme = "mint-dark";

export const PALETTE_LABEL: Record<ThemePalette, string> = {
  mint: "Mint",
  neutral: "Neutral",
  blue: "Blue",
  airbnb: "Airbnb",
  rabbit: "Rabbit",
};

export const MODE_LABEL: Record<ThemeMode, string> = {
  light: "Light",
  dark: "Dark",
};

const STORAGE_KEY = "locked-in-theme";

/** Light mint resolves under the bare palette name; dark appends `-dark`. */
export function themeOf(palette: ThemePalette, mode: ThemeMode): Theme {
  return (mode === "dark" ? `${palette}-dark` : palette) as Theme;
}

export function splitTheme(theme: Theme): {
  palette: ThemePalette;
  mode: ThemeMode;
} {
  if (theme.endsWith("-dark")) {
    return {
      palette: theme.slice(0, -"-dark".length) as ThemePalette,
      mode: "dark",
    };
  }
  return { palette: theme as ThemePalette, mode: "light" };
}

/** Unknown, empty, or absent values fall back to the default — never throw. */
export function parseTheme(raw: string | null | undefined): Theme {
  return (THEMES as readonly string[]).includes(raw ?? "")
    ? (raw as Theme)
    : DEFAULT_THEME;
}

/* ---- the store ---- */

const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function readSnapshot(): Theme {
  try {
    return parseTheme(localStorage.getItem(STORAGE_KEY));
  } catch {
    return DEFAULT_THEME;
  }
}

/** Server snapshot: no storage read during render (see module note). */
function readServerSnapshot(): Theme {
  return DEFAULT_THEME;
}

/** Writes through to the document, persists the choice, notifies readers. */
export function applyTheme(theme: Theme): void {
  if (typeof document !== "undefined") {
    document.documentElement.dataset.theme = theme;
  }
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // Private mode / blocked storage: the theme still applies this visit.
  }
  emit();
}

/** The persisted choice, or the default when there is none or it is stale. */
export function readStoredTheme(): Theme {
  return readSnapshot();
}

export function useTheme(): {
  theme: Theme;
  palette: ThemePalette;
  mode: ThemeMode;
  setPalette: (palette: ThemePalette) => void;
  setMode: (mode: ThemeMode) => void;
} {
  const theme = useSyncExternalStore(subscribe, readSnapshot, readServerSnapshot);

  const setPalette = useCallback((palette: ThemePalette) => {
    applyTheme(themeOf(palette, splitTheme(readSnapshot()).mode));
  }, []);
  const setMode = useCallback((mode: ThemeMode) => {
    applyTheme(themeOf(splitTheme(readSnapshot()).palette, mode));
  }, []);

  const { palette, mode } = splitTheme(theme);
  return { theme, palette, mode, setPalette, setMode };
}

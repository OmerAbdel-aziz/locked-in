"use client";

/**
 * Applies the stored theme on mount — Phase 9.
 *
 * `useSyncExternalStore`'s snapshot reads localStorage, but nothing writes
 * the *document* until the user taps a swatch, so a returning visitor would
 * first paint mint-dark and never converge. This component runs the DOM
 * write once at the root. It is a separate component rather than an effect
 * inside `useTheme` because the theme must apply on every route even when
 * no dialog ever opens — and because `useTheme` may be mounted many times
 * (each AppearanceSection) while this write must happen once.
 *
 * The write alone (no setState) is exactly what an effect is for: syncing
 * React state with an external system — the lint rule that rejected the
 * earlier version fired on the setState, not the DOM write.
 */

import { useEffect } from "react";

import { applyTheme, readStoredTheme } from "@/lib/theme";

export function ThemeSync() {
  useEffect(() => {
    applyTheme(readStoredTheme());
  }, []);
  return null;
}

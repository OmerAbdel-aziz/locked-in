import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import tokens from "@/docs/design/tokens.json";

/**
 * Task 2 gate: the Stitch design package is the single source of truth for
 * the theme. These assertions fail if `app/globals.css` ever drifts from
 * `docs/design/tokens.json` (e.g. a hand-edited hex, a dropped token, or a
 * regression of DESIGN.md's binding rules).
 *
 * See docs/design/README.md for how tokens.json was produced and verified.
 */

const css = readFileSync(resolve(__dirname, "../app/globals.css"), "utf8");
/**
 * Declarations only, comments stripped.
 *
 * The pure-white rule governs *styles*, not prose — a comment quoting
 * DESIGN.md's "#FFFFFF is too aggressive" is the rule being stated, not
 * broken, so it must not trip the gate.
 */
const cssDecls = css.replace(/\/\*[\s\S]*?\*\//g, "");
const extend = tokens.tailwindThemeExtend;
const colors = extend.colors as Record<string, string>;

/** Pull the `--color-<name>` declaration out of the @theme block. */
function themeValue(name: string): string | undefined {
  const match = css.match(new RegExp(`--color-${name}:\\s*([^;]+);`));
  return match?.[1].trim();
}

describe("design tokens", () => {
  it("ships the 47 verified colors from the design package", () => {
    expect(Object.keys(colors)).toHaveLength(47);
  });

  it("defines every design color in the Tailwind @theme with the exact hex", () => {
    const missing: string[] = [];

    for (const [name, expected] of Object.entries(colors)) {
      const actual = themeValue(name);
      // Design hexes are lowercase; normalize so casing alone can't fail.
      if (actual?.toLowerCase() !== expected.toLowerCase()) {
        missing.push(
          actual === undefined
            ? `${name}: missing (expected ${expected})`
            : `${name}: ${actual} (expected ${expected})`,
        );
      }
    }

    expect(missing).toEqual([]);
  });

  it("declares no color the design package doesn't define", () => {
    const declared = [...css.matchAll(/--color-([a-z0-9-]+):/g)].map(
      (m) => m[1],
    );
    const unknown = declared.filter((name) => !(name in colors));

    expect(unknown).toEqual([]);
  });

  it("never introduces pure white as a token", () => {
    const whites = Object.entries(colors).filter(([, hex]) =>
      /^#(fff|ffffff)$/i.test(hex),
    );
    expect(whites).toEqual([]);

    // ...and in any actual declaration either.
    expect(cssDecls.toLowerCase()).not.toMatch(/#ffffff/);
    expect(cssDecls.toLowerCase()).not.toMatch(/#fff\b/);
    expect(cssDecls.toLowerCase()).not.toMatch(/:\s*white\s*;/);
  });

  it("exposes the design's radius scale", () => {
    const radius = extend.borderRadius as Record<string, string>;
    const expected: Record<string, string> = {
      DEFAULT: "0.25rem",
      lg: radius.lg,
      xl: radius.xl,
      full: radius.full,
    };

    expect(css).toMatch(new RegExp(`--radius:\\s*${expected.DEFAULT};`));
    expect(css).toMatch(new RegExp(`--radius-lg:\\s*${expected.lg};`));
    expect(css).toMatch(new RegExp(`--radius-xl:\\s*${expected.xl};`));
    expect(css).toMatch(new RegExp(`--radius-full:\\s*${expected.full};`));
  });
});

describe("DESIGN.md binding rules (as amended by Phase 3.5)", () => {
  it("keeps the legacy void + on-surface tokens frozen", () => {
    expect(themeValue("background")).toBe("#131313");
    expect(themeValue("on-surface")).toBe("#e5e2e1");
  });

  it("renders the body theme-aware with the legacy void as fallback", () => {
    // Phase 3.5b (PRD D6b) supersedes the dark-only #131313 body: light mode
    // is first-class, so the body consumes the active HeroUI theme with the
    // legacy tokens as the pre-theme fallback.
    expect(css).toMatch(
      /body\s*\{[^}]*background-color:\s*var\(--background,\s*var\(--color-background\)\)/,
    );
    expect(css).toMatch(
      /body\s*\{[^}]*color:\s*var\(--foreground,\s*var\(--color-on-surface\)\)/,
    );
  });

  it("pins text color at the root so no white canvastext leaks through", () => {
    const root = css.match(/:root\s*\{[^}]*\}/)?.[0] ?? "";
    expect(root).toContain("color: var(--foreground, var(--color-on-surface))");
  });

  it("resolves five palettes × light/dark via data-theme", () => {
    for (const theme of [
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
    ]) {
      expect(css).toContain(`[data-theme="${theme}"]`);
    }
    // Each dark variant declares a dark scheme; each light one a light scheme.
    for (const theme of [
      "mint-dark",
      "neutral-dark",
      "blue-dark",
      "airbnb-dark",
      "rabbit-dark",
    ]) {
      const block = css.match(
        new RegExp(`\\[data-theme="${theme}"\\]\\s*\\{[^}]*\\}`),
      )?.[0];
      expect(block).toContain("color-scheme: dark");
    }
  });

  it("re-points every legacy --color-* token at a theme variable (Phase 9)", () => {
    // The regression that shipped light-mode-broken: utilities compile to
    // var(--color-*), which the @theme block freezes at mint-dark hexes.
    // Every token must be re-declared against a HeroUI var under :root /
    // [data-theme], or the theme switcher cannot recolor the product.
    const mappingBlock =
      css.match(/:root,\s*\[data-theme\]\s*\{[\s\S]*?\n\}/)?.[0] ?? "";
    expect(mappingBlock).not.toBe("");

    const missing: string[] = [];
    for (const name of Object.keys(colors)) {
      if (
        !new RegExp(`--color-${name}:\\s*var\\(--`).test(mappingBlock)
      ) {
        missing.push(name);
      }
    }
    expect(missing).toEqual([]);

    // And the mapping must live in unlayered CSS so it beats Tailwind's
    // @layer theme emission of the frozen hexes.
    expect(css).toMatch(/:root,\s*\[data-theme\]\s*\{/);
  });

  it("gives every theme its own two-stop CTA gradient at the fixed 145° geometry", () => {
    // Geometry never varies (DESIGN.md); the hue follows the theme (PRD D6b).
    expect(css).toMatch(/@utility cta-gradient[\s\S]*145deg/);
    expect(css).toContain("--cta-from:");
    expect(css).toContain("--cta-to:");
  });

  it("points every font token at JetBrains Mono — no Inter anywhere", () => {
    for (const token of [
      "--font-sans",
      "--font-mono",
      "--font-headline",
      "--font-body",
      "--font-label",
    ]) {
      expect(css).toMatch(
        new RegExp(`${token}:\\s*var\\(--font-jetbrains\\)`),
      );
    }
    expect(cssDecls).not.toMatch(/--font-inter/);
    expect(cssDecls).not.toMatch(/Inter/);
  });

  it("applies the mandated easing curve as a utility", () => {
    expect(css).toContain("--ease-sanctuary: cubic-bezier(0.4, 0, 0.2, 1)");
  });

  it("provides the signature gradient and glass utilities", () => {
    expect(css).toMatch(/@utility cta-gradient[\s\S]*145deg/);
    expect(css).toMatch(/@utility glass-panel[\s\S]*backdrop-filter:\s*blur\(20px\)/);
  });

  it("keeps 0px as the default radius (no 1px-line habit, DESIGN.md)", () => {
    expect(css).toMatch(/--radius:\s*0\.25rem;/);
  });

  it("removes HeroUI's tab-list track border, keeping the active indicator", () => {
    // Audit 2026-10-16: HeroUI draws a full-width `border-b` on every
    // horizontal tab list plus a separate indicator under the active tab.
    // The indicator is the design's own affordance; the track is a
    // sectioning divider under the no-line rule, so it is overridden —
    // without touching the indicator.
    expect(css).toMatch(
      /\.tabs\[data-orientation="horizontal"\]\s*>\s*\.tabs__list-container\s*\{\s*border-bottom-width:\s*0;/,
    );
  });

  it("provides a staggered entrance with a reduced-motion fallback", () => {
    expect(css).toMatch(/\.enter\s*\{[^}]*sanctuary-enter/);
    expect(css).toMatch(/\.enter-3\s*\{[^}]*animation-delay/);
    expect(css).toMatch(/prefers-reduced-motion:\s*reduce/);
  });
});

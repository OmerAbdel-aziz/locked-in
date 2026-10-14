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

describe("DESIGN.md binding rules", () => {
  it("pins the body to the void (#131313) and on-surface text", () => {
    expect(themeValue("background")).toBe("#131313");
    expect(themeValue("on-surface")).toBe("#e5e2e1");

    // The body rule must actually consume those tokens.
    expect(css).toMatch(
      /body\s*\{[^}]*background-color:\s*var\(--color-background\)/,
    );
    expect(css).toMatch(/body\s*\{[^}]*color:\s*var\(--color-on-surface\)/);
  });

  it("prevents the white `canvastext` root color under color-scheme: dark", () => {
    const root = css.match(/:root\s*\{[^}]*\}/)?.[0] ?? "";
    expect(root).toContain("color-scheme: dark");
    expect(root).toContain("color: var(--color-on-surface)");
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
});

/// <reference types="vite/client" />

/**
 * Types for `import.meta.glob`, which Vitest expands at transform time.
 *
 * `convex-test` needs the Convex function modules passed in explicitly: its
 * built-in default glob lives inside the prebuilt package, where Vite's
 * transform never runs, so `import.meta.glob` is not a function there.
 */

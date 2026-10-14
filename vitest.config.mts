import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// Config follows the official Next.js 16 vitest guide:
// node_modules/next/dist/docs/01-app/02-guides/testing/vitest.md
export default defineConfig({
  plugins: [react()],
  // Vite resolves the tsconfig "@/*" -> "./*" paths natively.
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    environment: "jsdom",
    // Everything under tests/ is a unit or integration test.
    // E2E lives in e2e/ and runs under Playwright, not vitest.
    include: ["tests/**/*.{test,spec}.{ts,tsx}"],
    exclude: ["e2e/**", "node_modules/**", ".next/**"],
  },
});

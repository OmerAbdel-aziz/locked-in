import type { AuthConfig } from "convex/server";

/**
 * The deployment-side half of Convex Auth — the file Task 4 left out.
 *
 * `convex/auth.ts` declares *which providers exist* in application code.
 * This file is the separate thing the **platform** reads to decide which
 * issuers it will accept a presented token from. Without it the deployment
 * has no providers registered at all, and the handshake fails at the last
 * step rather than the first:
 *
 *     auth:signIn  → success, tokens issued and stored in the browser
 *     Authenticate → AuthError: "No auth provider found matching the given
 *                     token (no providers configured). Check
 *                     convex/auth.config.ts."
 *     tasks:list   → resolveOwner: unauthenticated callers have no owner
 *
 * That ordering is why this hid for three tasks: sign-in *looks* like it
 * works — the token lands in localStorage and `useConvexAuth` reports
 * `true` — and only the very first call that needs the session proves it
 * never reached the server. Every authenticated call in the app has been
 * failing since Task 4; Tasks 8 and 9 never saw it because their gates ran
 * against `convex-test`, which stands in for the platform entirely.
 *
 * The values must match what `convex/auth.ts` issues: the `Anonymous`
 * provider signs with the deployment's own site URL as issuer and `convex`
 * as the audience, which is precisely `CONVEX_SITE_URL` + `"convex"`. This
 * is also the file the package's own `npx @convex-dev/auth init` writes, and
 * Task 23's magic-link provider is appended here when it lands.
 */

export default {
  providers: [
    {
      // Injected by the platform on every invocation — the same system env
      // var `convex/auth.ts` signs with. `!` because the type cannot see
      // that guarantee; there is no deployment where it is absent.
      domain: process.env.CONVEX_SITE_URL!,
      applicationID: "convex",
    },
  ],
} satisfies AuthConfig;

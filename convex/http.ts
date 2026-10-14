import { httpRouter } from "convex/server";

import { auth } from "./auth";

/**
 * Convex Auth's HTTP routes — Task 4.
 *
 * `auth.addHttpRoutes` always registers the two endpoints a JWT-signed
 * client needs to verify tokens without a round trip:
 *   /.well-known/openid-configuration
 *   /.well-known/jwks.json
 *
 * OAuth sign-in/callback routes are only registered when an OAuth provider
 * is configured — Task 23's magic link is email-based, so this file stays
 * as-is. Convex requires exactly one default-exported httpRouter.
 */
const http = httpRouter();

auth.addHttpRoutes(http);

export default http;

/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as auth from "../auth.js";
import type * as http from "../http.js";
import type * as lib_merge from "../lib/merge.js";
import type * as lib_order from "../lib/order.js";
import type * as lib_owner from "../lib/owner.js";
import type * as merge from "../merge.js";
import type * as milestones from "../milestones.js";
import type * as projects from "../projects.js";
import type * as rungs from "../rungs.js";
import type * as sessions from "../sessions.js";
import type * as settings from "../settings.js";
import type * as stats from "../stats.js";
import type * as tasks from "../tasks.js";
import type * as timer_state from "../timer_state.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  auth: typeof auth;
  http: typeof http;
  "lib/merge": typeof lib_merge;
  "lib/order": typeof lib_order;
  "lib/owner": typeof lib_owner;
  merge: typeof merge;
  milestones: typeof milestones;
  projects: typeof projects;
  rungs: typeof rungs;
  sessions: typeof sessions;
  settings: typeof settings;
  stats: typeof stats;
  tasks: typeof tasks;
  timer_state: typeof timer_state;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};

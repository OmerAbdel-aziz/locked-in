/**
 * Re-export shim — the canonical implementation lives in
 * convex/lib/merge.ts so convex/merge.ts can import it at deploy time
 * (Convex uploads only the convex/ directory). Tests and client code
 * keep importing @/lib/merge as Task 24 specifies.
 */
export * from "@/convex/lib/merge";

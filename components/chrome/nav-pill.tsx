"use client";

/**
 * The primary nav pill — Phase 9 polish (grill rulings).
 *
 * Focus / Stats / Settings, mounted left right after the wordmark. Focus and
 * Stats are routes with a selected state (`aria-current`); Settings opens
 * the existing dialog and is never selected — a dialog cannot hold a route's
 * state. The dialog rides inside this component so `/stats` gets a working
 * Settings item too (it previously mounted only on `/`).
 *
 * Shared by both pages: the two headers had already drifted by hand-rolling
 * their own pills, and this is the control most likely to gain a fourth item.
 * Right-side clusters stay per-page.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";

import { SettingsDialog } from "@/components/settings/settings-dialog";

const ITEM = "rounded-full px-3 py-1 transition-colors duration-150 ease-sanctuary";
const ACTIVE = `${ITEM} bg-surface-container-highest text-on-surface`;
const IDLE = `${ITEM} text-on-surface-variant hover:text-on-surface`;

function RouteItem({ href, label }: { href: string; label: string }) {
  const pathname = usePathname();
  if (pathname === href) {
    return (
      <span aria-current="page" className={ACTIVE}>
        {label}
      </span>
    );
  }
  return (
    <Link href={href} className={IDLE}>
      {label}
    </Link>
  );
}

export function NavPill() {
  return (
    <nav
      aria-label="Primary"
      className="flex items-center gap-1 rounded-full bg-surface-container-low/60 p-1 text-xs font-semibold"
    >
      <RouteItem href="/" label="Focus" />
      <RouteItem href="/careers" label="Careers" />
      <RouteItem href="/stats" label="Stats" />
      <SettingsDialog variant="tab" />
    </nav>
  );
}

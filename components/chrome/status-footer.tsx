"use client";

/**
 * Live status footer — audit 2026-10-16 (Task 26 precursor).
 *
 * The footer chrome the design draws as placeholders (`v2.4.1` uptime,
 * `PWA INSTALLED`) is replaced per PRD §4.1 with the two things that are
 * real: local time and connection status. Task 26 owns the full chrome
 * review; this grounds the live values early so the placeholders are gone.
 *
 * Both hooks are mount-gated (`useState` + `useEffect`), never read during
 * render — Next 16's `blocking-prerender-current-time` rejects clock reads
 * in render, the same rule that shaped `useCountdown` (Task 7) and
 * `useTzOffsetMinutes` (Task 12). The server render shows the settled
 * shape with neutral placeholders; the live values commit on mount.
 */

import { useEffect, useState } from "react";

function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function StatusFooter() {
  const [now, setNow] = useState<number | null>(null);
  const [online, setOnline] = useState(true);

  useEffect(() => {
    // No synchronous clock read here: the first tick (≤1s) commits the
    // time, keeping the render itself clock-free for the prerender gate.
    const tick = window.setInterval(() => setNow(Date.now()), 1000);
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.clearInterval(tick);
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  return (
    <footer className="flex items-center justify-between px-8 py-4 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
      <span className="flex items-center gap-2">
        <span
          className={`h-1.5 w-1.5 rounded-full ${online ? "bg-primary" : "bg-tertiary"}`}
          aria-hidden="true"
        />
        Locked In Status: {online ? "Online" : "Offline"}
      </span>
      <span className="font-mono">
        Local Time: {now === null ? "--:--" : formatTime(now)}
      </span>
    </footer>
  );
}

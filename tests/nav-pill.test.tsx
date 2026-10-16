import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useMutation, useQuery } from "convex/react";

import { NavPill } from "@/components/chrome/nav-pill";
import { ThemeSync } from "@/components/theme-sync";
import {
  DEFAULT_THEME,
  parseTheme,
  splitTheme,
  themeOf,
  useTheme,
} from "@/lib/theme";

/**
 * Phase 9 gate — the nav pill and the theme switcher (grill rulings).
 *
 * The pill: Focus/Stats are routes with a selected state, Settings opens the
 * dialog and never shows one; both pages mount the same component.
 * The switcher: palette × light/dark as two axes, instant-apply through
 * `data-theme`, persisted to localStorage, safe fallback for stale values.
 */

const { currentPath } = vi.hoisted(() => ({ currentPath: { value: "/" } }));

vi.mock("next/navigation", () => ({
  usePathname: () => currentPath.value,
}));

vi.mock("convex/react", () => ({
  useQuery: vi.fn(),
  useMutation: vi.fn(),
}));

vi.mock("@convex-dev/auth/react", () => ({
  useConvexAuth: () => ({ isAuthenticated: true, isLoading: false }),
}));

const mockQuery = vi.mocked(useQuery);
const mockMutation = vi.mocked(useMutation);

const SERVER_SETTINGS = {
  focusMin: 25,
  shortMin: 5,
  longMin: 15,
  sessionCount: 4,
  autoStartBreak: true,
  autoStartFocus: false,
  notificationsEnabled: true,
};

beforeEach(() => {
  currentPath.value = "/";
  mockQuery.mockReset();
  mockMutation.mockReset();
  mockQuery.mockReturnValue(SERVER_SETTINGS);
  mockMutation.mockReturnValue(vi.fn(() => Promise.resolve()) as never);
  window.localStorage.clear();
  document.documentElement.dataset.theme = "mint-dark";
});

afterEach(() => {
  cleanup();
});

describe("the nav pill", () => {
  it("marks Focus current and links to Stats when on the focus route", () => {
    currentPath.value = "/";
    render(<NavPill />);

    const focus = screen.getByText("Focus");
    expect(focus.getAttribute("aria-current")).toBe("page");
    expect(focus.tagName).not.toBe("A");

    const stats = screen.getByRole("link", { name: "Stats" });
    expect(stats.getAttribute("href")).toBe("/stats");
  });

  it("marks Stats current and links to Focus when on the stats route", () => {
    currentPath.value = "/stats";
    render(<NavPill />);

    const stats = screen.getByText("Stats");
    expect(stats.getAttribute("aria-current")).toBe("page");
    expect(stats.tagName).not.toBe("A");

    const focus = screen.getByRole("link", { name: "Focus" });
    expect(focus.getAttribute("href")).toBe("/");
  });

  it("opens the settings dialog from the third item", () => {
    render(<NavPill />);

    fireEvent.click(screen.getByRole("button", { name: "Open settings" }));
    expect(screen.getByRole("dialog", { name: "Settings" })).toBeTruthy();
  });

  it("never gives the Settings item a selected state", () => {
    // A dialog is not a route; aria-current on it would be a lie.
    render(<NavPill />);
    expect(
      screen.getByRole("button", { name: "Open settings" }).getAttribute(
        "aria-current",
      ),
    ).toBeNull();
  });
});

describe("the theme switcher inside settings", () => {
  beforeEach(() => {
    render(<NavPill />);
    fireEvent.click(screen.getByRole("button", { name: "Open settings" }));
  });

  // Radios are text buttons inside a labelled radiogroup; find by group + text.
  const withinGroup = (group: HTMLElement, name: string) =>
    Array.from(group.querySelectorAll<HTMLElement>('[role="radio"]')).find(
      (el) => el.textContent === name,
    )!;
  const palette = (name: string) =>
    withinGroup(screen.getByRole("radiogroup", { name: "Color theme" }), name);
  const mode = (name: string) =>
    withinGroup(screen.getByRole("radiogroup", { name: "Light or dark" }), name);

  it("offers five palettes and two modes", () => {
    const themeGroup = screen.getByRole("radiogroup", { name: "Color theme" });
    expect(themeGroup.querySelectorAll('[role="radio"]')).toHaveLength(5);
    const modeGroup = screen.getByRole("radiogroup", { name: "Light or dark" });
    expect(modeGroup.querySelectorAll('[role="radio"]')).toHaveLength(2);
  });

  it("defaults to mint dark", () => {
    expect(palette("Mint").getAttribute("aria-checked")).toBe("true");
    expect(mode("Dark").getAttribute("aria-checked")).toBe("true");
    expect(document.documentElement.dataset.theme).toBe("mint-dark");
  });

  it("switches palette while keeping the current mode", () => {
    fireEvent.click(palette("Airbnb"));
    expect(document.documentElement.dataset.theme).toBe("airbnb-dark");
    expect(palette("Airbnb").getAttribute("aria-checked")).toBe("true");
    expect(mode("Dark").getAttribute("aria-checked")).toBe("true");

    fireEvent.click(palette("Rabbit"));
    expect(document.documentElement.dataset.theme).toBe("rabbit-dark");

    // The two palettes added with the temp.css port (Phase 9).
    fireEvent.click(palette("Blue"));
    expect(document.documentElement.dataset.theme).toBe("blue-dark");
    fireEvent.click(palette("Neutral"));
    expect(document.documentElement.dataset.theme).toBe("neutral-dark");
  });

  it("switches mode while keeping the current palette", () => {
    fireEvent.click(palette("Rabbit"));
    fireEvent.click(mode("Light"));
    expect(document.documentElement.dataset.theme).toBe("rabbit");
    expect(palette("Rabbit").getAttribute("aria-checked")).toBe("true");
  });

  it("persists the choice and restores it on the next visit", () => {
    fireEvent.click(palette("Airbnb"));
    fireEvent.click(mode("Light"));
    expect(window.localStorage.getItem("locked-in-theme")).toBe("airbnb");

    cleanup();
    document.documentElement.dataset.theme = "mint-dark";
    // The mount-time DOM write belongs to ThemeSync (root component).
    render(
      <>
        <ThemeSync />
        <NavPill />
      </>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Open settings" }));

    expect(document.documentElement.dataset.theme).toBe("airbnb");
    expect(palette("Airbnb").getAttribute("aria-checked")).toBe("true");
  });

  it("falls back to the default when the stored value is stale", () => {
    window.localStorage.setItem("locked-in-theme", "neon-cyber");
    cleanup();
    render(
      <>
        <ThemeSync />
        <NavPill />
      </>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Open settings" }));

    expect(document.documentElement.dataset.theme).toBe("mint-dark");
    expect(palette("Mint").getAttribute("aria-checked")).toBe("true");
  });
});

describe("lib/theme pure helpers", () => {
  function Probe() {
    const { theme } = useTheme();
    return <span>{theme}</span>;
  }

  it("composes and splits every theme", () => {
    expect(themeOf("mint", "light")).toBe("mint");
    expect(themeOf("mint", "dark")).toBe("mint-dark");
    expect(themeOf("airbnb", "dark")).toBe("airbnb-dark");
    expect(splitTheme("rabbit-dark")).toEqual({ palette: "rabbit", mode: "dark" });
    expect(splitTheme("airbnb")).toEqual({ palette: "airbnb", mode: "light" });
  });

  it("falls back for unknown or empty values", () => {
    expect(parseTheme(null)).toBe(DEFAULT_THEME);
    expect(parseTheme("")).toBe(DEFAULT_THEME);
    expect(parseTheme("mint")).toBe("mint");
    expect(parseTheme("MINT-DARK")).toBe(DEFAULT_THEME);
  });

  it("the hook's initial state never reads storage during render", () => {
    // A server render runs no effects, so whatever markup comes back is
    // exactly the render-time state (Next 16's prerender rule: storage and
    // clock reads must not happen during render — same stance as
    // useTzOffsetMinutes). The stored value lands from the mount effect,
    // which the persistence test above proves separately.
    window.localStorage.setItem("locked-in-theme", "rabbit");
    const html = renderToStaticMarkup(<Probe />);
    expect(html).toContain("mint-dark");
    expect(html).not.toContain("rabbit");
  });
});

# Design System Strategy: The Architecture of Focus

## 1. Overview & Creative North Star: "The Digital Sanctuary"
This design system is engineered to facilitate deep work. Moving beyond the utility of a standard productivity tool, our North Star is **"The Digital Sanctuary."** The experience must feel like a high-end, quiet library—low-sensory, high-intent, and profoundly calm.

To break the "standard template" feel common in productivity apps, we utilize **Intentional Asymmetry** and **Tonal Depth**. By shifting the timer off-center or using radical whitespace, we force the user's eye to settle on a single focal point. We reject the "dashboard" look of dozens of small boxes; instead, we favor an editorial layout where hierarchy is established through scale and void, not lines.

---

## 2. Colors: Tonal Atmosphere
We use a monochromatic foundation punctuated by a single, high-vibrancy "Teal-Green" to represent life and progress.

### Core Palette (Material Design Mapping)
*   **Background (`#131313`):** The void. Used for the base canvas to minimize eye strain.
    *   **STALE (2026-10-16, PRD D6b):** The fixed dark-only canvas is superseded — the app now ships three themes (Mint / Airbnb / Rabbit), **each with light and dark mode**, so the base background is a per-theme token, not a fixed `#131313`. `#131313` remains the reference value for the **dark** themes' canvas only.
*   **Primary (`#4BE277`):** The "Flow State" green. Reserved for active timers and primary actions.
*   **Surface (`#131313`):** The primary layout container.
*   **Surface Container Highest (`#353534`):** For active elements or elevated cards.
*   **On-Surface (`#E5E2E1`):** High-contrast text for maximum legibility.

### The "No-Line" Rule
**Explicit Instruction:** Prohibit 1px solid borders for sectioning. Traditional "boxes" create visual noise that breaks focus. Instead, define boundaries through:
1.  **Background Shifts:** Place a `surface-container-low` task list against a `surface` background.
2.  **Generous Negative Space:** Use the spacing scale to let elements "float" in their own zones.

### The "Glass & Gradient" Rule
To elevate the "Locked In" vibe, floating modals or "Up Next" drawers should utilize **Glassmorphism**. Use `surface` at 60% opacity with a `20px` backdrop-blur. 

**Signature Texture:** Main CTAs (like "Start Timer") should not be flat. Use a subtle linear gradient from `primary` to `primary-container` at a 145-degree angle to give the button a tactile, "lit from within" quality.

---

## 3. Typography: Editorial Authority
Typography is our primary tool for hierarchy. We pair the functional precision of **Inter** with the utilitarian soul of **Monospace**.

*   **Display (Timer Digits):** Use Monospace (JetBrains Mono or similar). It suggests a machine-like precision. At `display-lg` (3.5rem), the numbers become the interface’s heartbeat.
*   **Headlines (Tasks):** `headline-md` (1.75rem) in Inter. Use a `tracking-tight` (-0.02em) setting to give it a premium, editorial feel.
*   **Labels/Body:** `body-sm` (0.75rem). In deep work mode, smaller, high-contrast labels feel less intrusive than large, medium-grey text.

---

## 4. Elevation & Depth: Tonal Layering
We do not use structural lines to separate "Work" from "Rest." We use light.

*   **The Layering Principle:** Depth is achieved by stacking. Place a `surface-container-lowest` card (the "task") inside a `surface-container-low` section (the "list"). This creates a "recessed" look that feels integrated into the UI rather than sitting on top of it.
*   **Ambient Shadows:** For floating elements (like a settings popover), use a "Long Shadow" approach: `0 20px 50px -12px rgba(0, 0, 0, 0.5)`. The shadow must feel like it’s being cast by a soft studio light, not a computer-generated drop shadow.
*   **The "Ghost Border" Fallback:** If a border is required for a focused input state, use `outline-variant` at **15% opacity**. It should be a suggestion of a border, felt rather than seen.

---

## 5. Components: Precision Primitives

### Buttons
*   **Primary:** High-saturation `primary` background. No border. Roundedness: `md` (0.75rem).
*   **Secondary/Ghost:** Use `on-surface` text with no background. Upon hover, transition to `surface-container-high` background. This maintains a "calm" state until the user interacts.

### Progress Rings
*   **The Signature Element:** The ring should have a "Track" and a "Progress" stroke. The Track is `surface-container-highest` at 10% opacity. The Progress is a `primary` gradient. The stroke-cap must be `round` to soften the technical aesthetic.

### Cards & Lists
*   **Constraint:** Forbid divider lines (`<hr>` or `border-b`).
*   **Execution:** Separate task items using `12px` of vertical margin. If a separation is needed, use a subtle background shift to `surface-container-lowest` for every second item (zebra striping) but at an ultra-low contrast (2% difference).

### Input Fields
*   **Minimalist Input:** No background, no border. Just a `label-sm` sitting above the text. Upon focus, a `primary` 2px underline expands from the center—a "Focus Beam" interaction.

### Additional Component: The "Focus Shroud"
A full-screen overlay component that dims all non-essential UI (Task list, Nav, Stats) when the timer is running, leaving only the Monospace timer and the current active task.

---

## 6. Do’s and Don’ts

### Do:
*   **Do** use extreme whitespace (64px+) between the timer and the task list to prevent visual crowding.
*   **Do** use `text-on-surface-variant` (lower contrast) for completed tasks to "recede" them into the background.
*   **Do** ensure all transitions (Timer start, task completion) use a `cubic-bezier(0.4, 0, 0.2, 1)` easing for a "premium" feel.

### Don't:
*   **Don't** use pure white (`#FFFFFF`). It is too aggressive for a "Locked In" focus environment. Use `on-surface` (`#E5E2E1`).
    *   **STALE (2026-10-16, PRD D6b):** This "no pure white" rule is obsolete now that light mode exists — the light themes legitimately render near-white surfaces (`oklch(100%)` / `oklch(97%)`), and the DOM tests that enforced it are relaxed in light mode. The rule's *intent* still holds where it was written: the **dark** themes should keep the canvas off pure white and use `on-surface` text. Apply this line to dark mode only; it is not a cross-theme invariant.
*   **Don't** use standard 1px borders to separate the sidebar from the main content. Use a subtle tonal shift between `surface` and `surface-container-low`.
*   **Don't** use "Alert" colors for errors if possible. Use `tertiary` (muted red/coral) to notify the user without triggering a "panic" response during deep work.
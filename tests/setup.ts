/**
 * jsdom floor for components backed by `motion` and Arc UI (ADR-006):
 * motion's in-view/resize observers and Arc's media queries have no DOM
 * API in jsdom. Individual tests keep their own stricter stubs; this file
 * only guarantees the constructors exist so `renderShallow`/`renderView`
 * never crash before a test asserts.
 */

if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class ResizeObserver {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  } as unknown as typeof ResizeObserver;
}

if (typeof globalThis.IntersectionObserver === "undefined") {
  globalThis.IntersectionObserver = class IntersectionObserver {
    root: Element | Document | null = null;
    rootMargin = "";
    threshold: number[] = [];
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
    takeRecords(): IntersectionObserverEntry[] {
      return [];
    }
  } as unknown as typeof IntersectionObserver;
}

if (typeof window !== "undefined" && typeof window.matchMedia === "undefined") {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: (): void => {},
    removeListener: (): void => {},
    addEventListener: (): void => {},
    removeEventListener: (): void => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

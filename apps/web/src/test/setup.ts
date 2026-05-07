import '@testing-library/jest-dom/vitest';

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => {
    const viewportWidth = window.innerWidth;
    let matches = false;

    const minWidthMatch = query.match(/min-width:\s*(\d+)px/);
    if (minWidthMatch) {
      matches = viewportWidth >= Number.parseInt(minWidthMatch[1], 10);
    }

    const maxWidthMatch = query.match(/max-width:\s*(\d+)px/);
    if (maxWidthMatch) {
      matches = viewportWidth <= Number.parseInt(maxWidthMatch[1], 10);
    }

    if (query === 'prefers-color-scheme: dark') {
      matches = false;
    }

    return {
      matches,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    };
  },
});

if (!Element.prototype.hasPointerCapture) {
  Element.prototype.hasPointerCapture = () => false;
}

if (!Element.prototype.setPointerCapture) {
  Element.prototype.setPointerCapture = () => {};
}

if (!Element.prototype.releasePointerCapture) {
  Element.prototype.releasePointerCapture = () => {};
}

if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}

if (!window.ResizeObserver) {
  class ResizeObserverMock {
    observe() {}

    unobserve() {}

    disconnect() {}
  }

  window.ResizeObserver = ResizeObserverMock as typeof ResizeObserver;
  globalThis.ResizeObserver = ResizeObserverMock as typeof ResizeObserver;
}

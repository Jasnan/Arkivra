import '@testing-library/jest-dom/vitest';
import { afterEach, vi } from 'vitest';

const MIN_WIDTH_PATTERN = /min-width:\s*(\d+)px/;
const MAX_WIDTH_PATTERN = /max-width:\s*(\d+)px/;

function createTestStorage(): Storage {
  const values = new Map<string, string>();

  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key: string) => values.get(key) ?? null,
    key: (index: number) => [...values.keys()][index] ?? null,
    removeItem: (key: string) => {
      values.delete(key);
    },
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
}

function installTestStorage() {
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    writable: true,
    value: createTestStorage(),
  });

  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    writable: true,
    value: window.localStorage,
  });
}

installTestStorage();

afterEach(() => {
  installTestStorage();
  document.body.removeAttribute('data-inert');
  document.body.removeAttribute('data-scroll-lock');
  document.body.style.cssText = '';
});

vi.mock('next-themes', async () => {
  const React = await vi.importActual<typeof import('react')>('react');
  const ThemeContext = React.createContext({
    forcedTheme: undefined as string | undefined,
    resolvedTheme: 'light',
    setTheme: (_theme: string) => {},
    systemTheme: 'light',
    theme: 'light',
    themes: ['light', 'dark', 'system'],
  });

  function ThemeProvider({
    attribute = 'data-theme',
    children,
    defaultTheme = 'light',
    enableSystem = true,
    storageKey = 'theme',
  }: {
    attribute?: string;
    children: React.ReactNode;
    defaultTheme?: string;
    enableSystem?: boolean;
    storageKey?: string;
  }) {
    const [theme, setThemeState] = React.useState(() => window.localStorage.getItem(storageKey) ?? defaultTheme);
    const resolvedTheme = theme === 'dark' ? 'dark' : 'light';

    const setTheme = React.useCallback((nextTheme: string) => {
      setThemeState(nextTheme);
      window.localStorage.setItem(storageKey, nextTheme);
    }, [storageKey]);

    React.useEffect(() => {
      const root = document.documentElement;

      if (attribute === 'class') {
        root.classList.remove('light', 'dark', 'system');
        root.classList.add(resolvedTheme);
        return;
      }

      root.setAttribute(attribute, resolvedTheme);
    }, [attribute, resolvedTheme]);

    const value = React.useMemo(() => ({
      forcedTheme: undefined,
      resolvedTheme,
      setTheme,
      systemTheme: 'light',
      theme,
      themes: enableSystem ? ['light', 'dark', 'system'] : ['light', 'dark'],
    }), [enableSystem, resolvedTheme, setTheme, theme]);

    return React.createElement(ThemeContext.Provider, { value }, children);
  }

  return {
    ThemeProvider,
    useTheme: () => React.useContext(ThemeContext),
  };
});

if (!window.PointerEvent) {
  class PointerEventMock extends MouseEvent {}

  window.PointerEvent = PointerEventMock as typeof PointerEvent;
  globalThis.PointerEvent = PointerEventMock as typeof PointerEvent;
}

if (!window.DOMMatrix) {
  class DOMMatrixMock {
    a = 1;
    b = 0;
    c = 0;
    d = 1;
    e = 0;
    f = 0;
  }

  window.DOMMatrix = DOMMatrixMock as typeof DOMMatrix;
  globalThis.DOMMatrix = DOMMatrixMock as typeof DOMMatrix;
}

Object.defineProperty(window, 'matchMedia', {
  configurable: true,
  writable: true,
  value: (query: string) => {
    const viewportWidth = window.innerWidth;
    let matches = false;

    const minWidthMatch = query.match(MIN_WIDTH_PATTERN);
    if (minWidthMatch) {
      matches = viewportWidth >= Number.parseInt(minWidthMatch[1], 10);
    }

    const maxWidthMatch = query.match(MAX_WIDTH_PATTERN);
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

window.scrollTo = () => {};

if (!window.ResizeObserver) {
  class ResizeObserverMock {
    observe() {}

    unobserve() {}

    disconnect() {}
  }

  window.ResizeObserver = ResizeObserverMock as typeof ResizeObserver;
  globalThis.ResizeObserver = ResizeObserverMock as typeof ResizeObserver;
}

if (!window.IntersectionObserver) {
  class IntersectionObserverMock {
    readonly root = null;
    readonly rootMargin = '';
    readonly thresholds = [];

    observe() {}

    unobserve() {}

    disconnect() {}

    takeRecords() {
      return [];
    }
  }

  window.IntersectionObserver = IntersectionObserverMock as unknown as typeof IntersectionObserver;
  globalThis.IntersectionObserver = IntersectionObserverMock as unknown as typeof IntersectionObserver;
}

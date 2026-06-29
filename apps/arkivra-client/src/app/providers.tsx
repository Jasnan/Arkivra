import type { PropsWithChildren } from 'react';
import { useEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/toaster';
import { AccentColorProvider } from '@/components/providers/accent-color-provider';
import { ThemeProvider } from '@/components/providers/theme-provider';
import { invalidateDocumentCollectionCaches } from '@/features/documents/document-cache-updates';

const UI_PREFERENCES_CACHE_KEY = 'arkivra.uiPreferences';
const THEME_MODE_STORAGE_KEY = 'arkivra.themeMode';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
      staleTime: 30_000,
    },
  },
});

function isThemeMode(value: string | null | undefined): value is 'light' | 'dark' {
  return value === 'light' || value === 'dark';
}

function getCachedThemeMode() {
  const cachedPreferenceValue = window.localStorage.getItem(UI_PREFERENCES_CACHE_KEY);

  if (cachedPreferenceValue === null) {
    return null;
  }

  try {
    const cachedPreferences = JSON.parse(cachedPreferenceValue) as Record<string, unknown>;
    const cachedThemeMode = typeof cachedPreferences.themeMode === 'string'
      ? cachedPreferences.themeMode
      : null;

    return isThemeMode(cachedThemeMode) ? cachedThemeMode : null;
  } catch {
    return null;
  }
}

function normalizeStoredThemeMode() {
  if (typeof window === 'undefined' || typeof window.localStorage?.getItem !== 'function') {
    return;
  }

  const storedThemeMode = window.localStorage.getItem(THEME_MODE_STORAGE_KEY);

  if (!isThemeMode(storedThemeMode)) {
    window.localStorage.setItem(THEME_MODE_STORAGE_KEY, getCachedThemeMode() ?? 'light');
  }
}

function UploadCompletionInvalidation() {
  useEffect(() => {
    async function handleUploadCompleted() {
      await invalidateDocumentCollectionCaches(queryClient);
    }

    window.addEventListener('arkivra:uploads-completed', handleUploadCompleted);
    return () => {
      window.removeEventListener('arkivra:uploads-completed', handleUploadCompleted);
    };
  }, []);

  return null;
}

export function AppProviders({ children }: PropsWithChildren) {
  normalizeStoredThemeMode();

  return (
    <ThemeProvider
      attribute="class"
      storageKey={THEME_MODE_STORAGE_KEY}
      defaultTheme="light"
      enableSystem={false}
      themes={['light', 'dark']}
      disableTransitionOnChange
    >
      <QueryClientProvider client={queryClient}>
        <AccentColorProvider>
          <UploadCompletionInvalidation />
          {children}
          <Toaster />
        </AccentColorProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}

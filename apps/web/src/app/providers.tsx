import type { PropsWithChildren } from 'react';
import { useEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/toaster';
import { AccentColorProvider } from '@/components/providers/accent-color-provider';
import { ThemeProvider } from '@/components/providers/theme-provider';
import { invalidateDocumentCollectionCaches } from '@/features/documents/document-cache-updates';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
      staleTime: 30_000,
    },
  },
});

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
  return (
    <ThemeProvider
      attribute="class"
      storageKey="arkivra.themeMode"
      defaultTheme="system"
      enableSystem
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

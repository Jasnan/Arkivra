import type { PropsWithChildren } from 'react';
import { useEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import { documentQueryKeys } from '@/features/documents/documents.queries';
import { searchQueryKeys } from '@/features/search/search.queries';
import { ThemeProvider } from '@/components/providers/theme-provider';

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
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: documentQueryKeys.all }),
        queryClient.invalidateQueries({ queryKey: searchQueryKeys.all }),
      ]);
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
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem disableTransitionOnChange>
      <QueryClientProvider client={queryClient}>
        <UploadCompletionInvalidation />
        {children}
        <Toaster position="top-right" richColors />
      </QueryClientProvider>
    </ThemeProvider>
  );
}

/* eslint-disable react-refresh/only-export-components */
import type { PropsWithChildren, ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { Toaster } from 'sonner';
import { ThemeProvider } from '@/components/providers/theme-provider';

function TestProviders({
  children,
  initialEntries,
  routePath,
}: PropsWithChildren<{ initialEntries?: string[]; routePath?: string }>) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={initialEntries}>
          {routePath
            ? (
                <Routes>
                  <Route path={routePath} element={<>{children}</>} />
                </Routes>
              )
            : children}
        </MemoryRouter>
        <Toaster position="top-right" richColors />
      </QueryClientProvider>
    </ThemeProvider>
  );
}

export function renderWithProviders(
  ui: ReactNode,
  options?: { initialEntries?: string[]; routePath?: string },
) {
  return render(ui, {
    wrapper: ({ children }) => (
      <TestProviders initialEntries={options?.initialEntries} routePath={options?.routePath}>
        {children}
      </TestProviders>
    ),
  });
}

/* eslint-disable react-refresh/only-export-components */
import type { PropsWithChildren, ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import { createMemoryHistory, createRootRoute, createRoute, createRouter, RouterProvider } from '@tanstack/react-router'
import { Toaster } from 'sonner'
import { ThemeProvider } from '@/components/providers/theme-provider'

export async function renderWithProviders(
  ui: ReactNode,
  options?: { initialEntries?: string[]; routePath?: string },
) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  })

  const rootRoute = createRootRoute()
  const path = options?.routePath ? options.routePath.replace(/:(\w+)/g, '$$$1') : '/'
  const testRoute = createRoute({
    getParentRoute: () => rootRoute,
    path,
    component: () => <>{ui}</>,
  })
  const routeTree = rootRoute.addChildren([testRoute])

  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: options?.initialEntries ?? ['/'] }),
  })

  await router.load()

  function Wrapper({ children }: PropsWithChildren) {
    return (
      <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
        <QueryClientProvider client={queryClient}>
          <RouterProvider router={router} />
          <Toaster position="top-right" richColors />
        </QueryClientProvider>
      </ThemeProvider>
    )
  }

  return render(ui, { wrapper: Wrapper })
}

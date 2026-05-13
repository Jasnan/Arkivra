/* eslint-disable react-refresh/only-export-components */
import type { PropsWithChildren, ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import { createMemoryHistory, createRootRoute, createRoute, createRouter, RouterProvider } from '@tanstack/react-router'
import { Toaster } from 'sonner'
import { ThemeProvider } from '@/components/providers/theme-provider'

export async function renderWithProviders(
  ui: ReactNode,
  options?: { initialEntries?: string[]; routePath?: string; routePaths?: string[]; rootComponent?: boolean },
) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  })

  const rootRoute = createRootRoute(options?.rootComponent ? {
    component: () => <>{ui}</>,
  } : undefined)
  const paths = options?.routePaths ?? [options?.routePath ?? '/']
  const testRoutes = paths.map((routePath) => createRoute({
    getParentRoute: () => rootRoute,
    path: routePath.replace(/:(\w+)/g, '$$$1'),
    component: options?.rootComponent ? undefined : () => <>{ui}</>,
  }))
  const routeTree = rootRoute.addChildren(testRoutes)

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

  return {
    ...render(ui, { wrapper: Wrapper }),
    router,
  }
}

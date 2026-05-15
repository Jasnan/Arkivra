import type { PropsWithChildren, ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import { createMemoryHistory, createRootRoute, createRoute, createRouter, RouterProvider } from '@tanstack/react-router'
import { Toaster } from 'sonner'
import { AccentColorProvider } from '@/components/providers/accent-color-provider'
import { ThemeProvider } from '@/components/providers/theme-provider'

const routeParamPattern = /:(\w+)/g

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
    path: routePath.replace(routeParamPattern, '$$$1'),
    component: options?.rootComponent ? undefined : () => <>{ui}</>,
  }))
  const routeTree = rootRoute.addChildren(testRoutes)

  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: options?.initialEntries ?? ['/'] }),
  })

  await router.load()

  function Wrapper(_props: PropsWithChildren) {
    return (
      <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
        <AccentColorProvider>
          <QueryClientProvider client={queryClient}>
            <RouterProvider router={router} />
            <Toaster position="top-right" richColors />
          </QueryClientProvider>
        </AccentColorProvider>
      </ThemeProvider>
    )
  }

  return {
    ...render(ui, { wrapper: Wrapper }),
    router,
  }
}

import type { ComponentType, PropsWithChildren, ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import { createMemoryHistory, createRootRoute, createRoute, createRouter, RouterProvider } from '@tanstack/react-router'
import { Toaster } from '@/components/ui/toaster'
import { AccentColorProvider } from '@/components/providers/accent-color-provider'
import { ThemeProvider } from '@/components/providers/theme-provider'

const routeParamPattern = /:(\w+)/g

interface TestRouteDefinition {
  path: string
  component?: ComponentType
}

export async function renderWithProviders(
  ui: ReactNode,
  options?: {
    initialEntries?: string[]
    routePath?: string
    routePaths?: string[]
    routes?: TestRouteDefinition[]
    rootComponent?: boolean
    includeToaster?: boolean
  },
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
  const routeDefinitions: TestRouteDefinition[] = options?.routes
    ?? (options?.routePaths ?? [options?.routePath ?? '/']).map(path => ({ path }))
  const testRoutes = routeDefinitions.map(({ path, component: Component }) => createRoute({
    getParentRoute: () => rootRoute,
    path: path.replace(routeParamPattern, '$$$1'),
    component: Component
      ? () => <Component />
      : options?.rootComponent ? undefined : () => <>{ui}</>,
  }))
  const routeTree = rootRoute.addChildren(testRoutes)

  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: options?.initialEntries ?? ['/'] }),
  })

  await router.load()

  function Wrapper(_props: PropsWithChildren) {
    return (
      <ThemeProvider attribute="class" storageKey="arkivra.themeMode" defaultTheme="light" enableSystem={false}>
        <QueryClientProvider client={queryClient}>
          <AccentColorProvider>
            <RouterProvider router={router} />
            {options?.includeToaster ? <Toaster /> : null}
          </AccentColorProvider>
        </QueryClientProvider>
      </ThemeProvider>
    )
  }

  return {
    ...render(ui, { wrapper: Wrapper }),
    router,
  }
}

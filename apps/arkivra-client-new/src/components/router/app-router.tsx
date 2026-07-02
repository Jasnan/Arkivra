"use client"

import { Suspense } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { routes, type RouteConfig } from '@/config/routes'
import { LoadingSpinner } from '@/components/ui/loading-spinner'
import { authClient } from '@/lib/auth-client'

const DEFAULT_AUTHENTICATED_ROUTE = "/dashboard"

function getRedirectPathFromLocationState(location: ReturnType<typeof useLocation>) {
  const from = (location.state as { from?: { pathname?: string; search?: string } } | null)?.from
  const pathname = from?.pathname

  if (!pathname || pathname === "/login" || pathname === "/register") {
    return DEFAULT_AUTHENTICATED_ROUTE
  }

  return `${pathname}${from?.search ?? ""}`
}

function AuthLoadingState() {
  return (
    <div className="bg-muted flex min-h-svh items-center justify-center">
      <LoadingSpinner />
    </div>
  )
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const location = useLocation()
  const { data: session, isPending } = authClient.useSession()

  if (isPending) {
    return <AuthLoadingState />
  }

  if (!session) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  return <>{children}</>
}

function PublicOnlyRoute({
  allowAuthenticated = false,
  children,
}: {
  allowAuthenticated?: boolean
  children: React.ReactNode
}) {
  const location = useLocation()
  const { data: session, isPending } = authClient.useSession()

  if (isPending) {
    return <AuthLoadingState />
  }

  if (session && !allowAuthenticated) {
    return <Navigate to={getRedirectPathFromLocationState(location)} replace />
  }

  return <>{children}</>
}

function renderRoutes(routeConfigs: RouteConfig[]) {
  return routeConfigs.map((route, index) => {
    const element = (
      <Suspense fallback={<LoadingSpinner />}>
        {route.public ? (
          <PublicOnlyRoute allowAuthenticated={route.allowAuthenticated}>
            {route.element}
          </PublicOnlyRoute>
        ) : (
          <ProtectedRoute>{route.element}</ProtectedRoute>
        )}
      </Suspense>
    )

    return route.index ? (
      <Route key={`index-${index}`} index element={element} />
    ) : (
      <Route key={(route.path ?? "route") + index} path={route.path} element={element}>
        {route.children && renderRoutes(route.children)}
      </Route>
    )
  })
}

export function AppRouter() {
  return (
    <Routes>
      {renderRoutes(routes)}
    </Routes>
  )
}

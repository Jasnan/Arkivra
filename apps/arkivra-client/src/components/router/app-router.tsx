"use client"

import { Suspense, useEffect, useMemo } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { routes, type RouteConfig } from '@/config/routes'
import { LoadingSpinner } from '@/components/ui/loading-spinner'
import { authClient } from '@/lib/auth-client'
import {
  AuthenticatedAppearanceBoundary,
  PublicAppearanceBoundary,
} from '@/components/appearance-preferences-boundary'
import { getAppearanceUserKey } from '@/lib/appearance-preferences'
import {
  getServerRegionalPreferences,
  setRegionalBootstrapUserKey,
  writeRegionalPreferences,
} from '@/lib/regional-preferences'

const DEFAULT_AUTHENTICATED_ROUTE = "/vaults"

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
  const regionalUserKey = useMemo(
    () => session ? getAppearanceUserKey(session.user) : null,
    [session],
  )

  useEffect(() => {
    if (!regionalUserKey) return

    let ignore = false
    setRegionalBootstrapUserKey(regionalUserKey)

    getServerRegionalPreferences()
      .then((preferences) => {
        if (!ignore) {
          writeRegionalPreferences(regionalUserKey, preferences)
        }
      })
      .catch(() => undefined)

    return () => {
      ignore = true
    }
  }, [regionalUserKey])

  if (isPending) {
    return <AuthLoadingState />
  }

  if (!session) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  return (
    <AuthenticatedAppearanceBoundary userKey={getAppearanceUserKey(session.user)}>
      {children}
    </AuthenticatedAppearanceBoundary>
  )
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
  const regionalUserKey = useMemo(
    () => session ? getAppearanceUserKey(session.user) : null,
    [session],
  )

  useEffect(() => {
    if (!regionalUserKey) return

    let ignore = false
    setRegionalBootstrapUserKey(regionalUserKey)

    getServerRegionalPreferences()
      .then((preferences) => {
        if (!ignore) {
          writeRegionalPreferences(regionalUserKey, preferences)
        }
      })
      .catch(() => undefined)

    return () => {
      ignore = true
    }
  }, [regionalUserKey])

  if (isPending) {
    return <AuthLoadingState />
  }

  if (session && !allowAuthenticated) {
    return <Navigate to={getRedirectPathFromLocationState(location)} replace />
  }

  if (!session) {
    return <PublicAppearanceBoundary>{children}</PublicAppearanceBoundary>
  }

  if (allowAuthenticated) {
    return (
      <AuthenticatedAppearanceBoundary userKey={getAppearanceUserKey(session.user)}>
        {children}
      </AuthenticatedAppearanceBoundary>
    )
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

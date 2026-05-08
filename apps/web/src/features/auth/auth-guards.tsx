import { useEffect } from 'react'
import { useRouterState } from '@tanstack/react-router'

export function RouterDebugProbe() {
  const location = useRouterState({ select: (s) => s.location })
  const matches = useRouterState({ select: (s) => s.matches })

  useEffect(() => {
    console.log('[RouterDebugProbe]', {
      pathname: location.pathname,
      matches: matches.map((m) => m.routeId),
    })
  })

  return null
}

import { RouterProvider } from '@tanstack/react-router'
import { AppProviders } from '@/app/providers'
import { appRouter } from '@/app/router'

export function App() {
  return (
    <AppProviders>
      <RouterProvider router={appRouter} />
    </AppProviders>
  )
}

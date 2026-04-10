import { RouterProvider } from 'react-router-dom';
import { AppProviders } from '@/app/providers';
import { createAppRouter } from '@/app/router';

const router = createAppRouter();

export function App() {
  return (
    <AppProviders>
      <RouterProvider router={router} />
    </AppProviders>
  );
}

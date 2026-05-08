import { BrowserRouter } from 'react-router-dom';
import { AppProviders } from '@/app/providers';
import { createAppRouter } from '@/app/router';

export function App() {
  return (
    <AppProviders>
      <BrowserRouter>
        {createAppRouter()}
      </BrowserRouter>
    </AppProviders>
  );
}

import { screen } from '@testing-library/react';
import { DashboardPage } from '@/features/dashboard/dashboard-page';
import { renderWithProviders } from '@/test/utils';

describe('dashboard page', () => {
  it('renders the phase 3 scaffold content', async () => {
    renderWithProviders(<DashboardPage />);

    expect(screen.getByRole('heading', { name: /phase 3a core scaffold/i })).toBeInTheDocument();
    expect(screen.getByText(/better auth react client bootstrap/i)).toBeInTheDocument();
  });
});

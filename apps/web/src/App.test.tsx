import { screen } from '@testing-library/react';
import { DashboardPage } from '@/features/dashboard/dashboard-page';
import { renderWithProviders } from '@/test/utils';

describe('dashboard page', () => {
  it('renders the phase 3 scaffold content', async () => {
    renderWithProviders(<DashboardPage />);

    expect(screen.getByRole('heading', { name: /arkivra is ready for phase 3 feature work/i })).toBeInTheDocument();
    expect(screen.getByText(/testing harness/i)).toBeInTheDocument();
  });
});

import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '@/test/utils';
import { ActivityEventTimeline } from './activity-event-timeline';

describe('audit event timeline', () => {
  it('shows an empty activity state', async () => {
    await renderWithProviders(
      <ActivityEventTimeline events={[]} isLoading={false} isError={false} />,
    );

    expect(screen.getByText(/no activity recorded yet/i)).toBeInTheDocument();
  });

  it('renders activity events with safe metadata', async () => {
    await renderWithProviders(
      <ActivityEventTimeline
        isLoading={false}
        isError={false}
        events={[
          {
            id: 'aud_1',
            occurredAt: '2026-01-01T12:00:00.000Z',
            activityType: 'document.created',
            entityType: 'document',
            entityId: 'doc_1',
            actorDisplayName: 'Anna',
            summary: 'Anna uploaded file',
            metadata: {
              file_name: 'contract.pdf',
              file_size: 2048,
            },
          },
        ]}
      />,
    );

    expect(screen.getByText('Anna uploaded file')).toBeInTheDocument();
    expect(screen.getByText(/file name: contract.pdf/i)).toBeInTheDocument();
    expect(screen.getByText(/file size: 2.0 KB/i)).toBeInTheDocument();
  });
});

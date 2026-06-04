import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/test/utils';
import { AuditDateFilterPicker } from './audit-date-filter-picker';

describe('audit date filter picker', () => {
  const store = new Map<string, string>();

  beforeEach(() => {
    store.clear();
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: {
        getItem: vi.fn((key: string) => store.get(key) ?? null),
        setItem: vi.fn((key: string, value: string) => {
          store.set(key, value);
        }),
        removeItem: vi.fn((key: string) => {
          store.delete(key);
        }),
      },
    });
  });

  it('displays stored ISO dates in the active local date format', async () => {
    window.localStorage.setItem('arkivra.uiPreferences', JSON.stringify({ language: 'de' }));

    await renderWithProviders(
      <AuditDateFilterPicker
        id="audit-date-from"
        label="From"
        value="2026-01-15"
        onValueChange={() => undefined}
      />,
    );

    expect(screen.getByRole('textbox', { name: /^from$/i })).toHaveValue('15.01.2026');
  });
});

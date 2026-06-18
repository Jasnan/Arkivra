/* eslint-disable react-refresh/only-export-components */
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import type { ReactNode } from 'react';
import type userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { WorkspaceLayoutContext } from '@/components/layout/workspace-context';
import type { WorkspaceHeaderConfig } from '@/components/layout/workspace-context';

export function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

export async function selectRadixOption(user: ReturnType<typeof userEvent.setup>, triggerName: RegExp, optionName: RegExp) {
  await user.click(screen.getByRole('button', { name: triggerName }));
  await user.click(await screen.findByRole('menuitemradio', { name: optionName }));
}

export async function findCalendarDate(dateLabel: RegExp) {
  let calendarDay: HTMLElement | undefined;

  await waitFor(() => {
    calendarDay = [...document.querySelectorAll<HTMLElement>('[role="button"][aria-label]')]
      .find((element) => {
        dateLabel.lastIndex = 0;
        return dateLabel.test(element.getAttribute('aria-label') ?? '');
      });
    expect(calendarDay).toBeDefined();
  });

  return calendarDay!;
}

export async function selectCalendarDate(user: ReturnType<typeof userEvent.setup>, dateLabel: RegExp) {
  void user;
  const calendarDate = await findCalendarDate(dateLabel);
  await act(async () => {
    fireEvent.pointerDown(calendarDate, { pointerType: 'mouse', button: 0 });
    fireEvent.mouseDown(calendarDate);
    fireEvent.pointerUp(calendarDate, { pointerType: 'mouse', button: 0 });
    fireEvent.mouseUp(calendarDate);
    fireEvent.click(calendarDate);
  });
}

export function WorkspaceHeaderHarness({ children }: { children: ReactNode }) {
  const [headerConfig, setHeaderConfig] = useState<WorkspaceHeaderConfig | null>(null);

  return (
    <WorkspaceLayoutContext value={{ setHeaderConfig, setSecondaryContent: vi.fn() }}>
      <div data-testid="app-shell-header">
        {headerConfig?.left}
        {headerConfig?.content}
        {headerConfig?.actions}
      </div>
      {children}
    </WorkspaceLayoutContext>
  );
}

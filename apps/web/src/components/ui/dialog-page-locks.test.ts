import { afterEach, describe, expect, it, vi } from 'vitest';
import { scheduleDialogPageLockCleanup } from './dialog-page-locks';

describe('dialog page lock cleanup', () => {
  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = '';
    document.body.removeAttribute('data-inert');
    document.body.removeAttribute('data-scroll-lock');
    document.body.style.pointerEvents = '';
  });

  it('retries until a closing dialog is removed from the DOM', () => {
    vi.useFakeTimers();
    const dialog = document.createElement('div');
    dialog.setAttribute('role', 'dialog');
    document.body.append(dialog);
    document.body.setAttribute('data-inert', '');
    document.body.setAttribute('data-scroll-lock', '');
    document.body.style.pointerEvents = 'none';

    const cancelCleanup = scheduleDialogPageLockCleanup();

    vi.advanceTimersByTime(120);

    expect(document.body).toHaveAttribute('data-inert');
    expect(document.body).toHaveAttribute('data-scroll-lock');
    expect(document.body.style.pointerEvents).toBe('none');

    dialog.remove();
    vi.advanceTimersByTime(80);

    expect(document.body).not.toHaveAttribute('data-inert');
    expect(document.body).not.toHaveAttribute('data-scroll-lock');
    expect(document.body.style.pointerEvents).toBe('');

    cancelCleanup();
  });
});

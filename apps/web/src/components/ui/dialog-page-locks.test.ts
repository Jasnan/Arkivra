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
    document.body.setAttribute('inert', '');
    document.body.setAttribute('data-scroll-lock', '');
    document.body.style.pointerEvents = 'none';
    const appRoot = document.createElement('div');
    appRoot.setAttribute('data-inert', '');
    appRoot.setAttribute('inert', '');
    document.body.append(appRoot);

    const cancelCleanup = scheduleDialogPageLockCleanup();

    vi.advanceTimersByTime(120);

    expect(document.body).toHaveAttribute('data-inert');
    expect(document.body).toHaveAttribute('inert');
    expect(document.body).toHaveAttribute('data-scroll-lock');
    expect(document.body.style.pointerEvents).toBe('none');
    expect(appRoot).toHaveAttribute('data-inert');
    expect(appRoot).toHaveAttribute('inert');

    dialog.remove();
    vi.advanceTimersByTime(80);

    expect(document.body).not.toHaveAttribute('data-inert');
    expect(document.body).not.toHaveAttribute('inert');
    expect(document.body).not.toHaveAttribute('data-scroll-lock');
    expect(document.body.style.pointerEvents).toBe('');
    expect(appRoot).not.toHaveAttribute('data-inert');
    expect(appRoot).not.toHaveAttribute('inert');

    cancelCleanup();
  });
});

import { useEffect } from 'react';

function hasActiveDialog() {
  return document.querySelector('[role="dialog"]') !== null;
}

export function cleanupDialogPageLocks() {
  if (hasActiveDialog()) {
    return;
  }

  document.body.removeAttribute('data-inert');
  document.body.removeAttribute('data-scroll-lock');
  document.body.style.pointerEvents = '';

  for (const element of document.querySelectorAll<HTMLElement>('[data-inert]')) {
    element.removeAttribute('data-inert');
  }
}

export function scheduleDialogPageLockCleanup() {
  const timeoutIds = [
    window.setTimeout(cleanupDialogPageLocks, 0),
    window.setTimeout(cleanupDialogPageLocks, 120),
  ];

  return () => {
    for (const timeoutId of timeoutIds) {
      window.clearTimeout(timeoutId);
    }
  };
}

export function useDialogPageLockCleanup(open: boolean) {
  useEffect(() => {
    if (open) {
      return;
    }

    return scheduleDialogPageLockCleanup();
  }, [open]);

  useEffect(() => () => {
    scheduleDialogPageLockCleanup();
  }, []);
}

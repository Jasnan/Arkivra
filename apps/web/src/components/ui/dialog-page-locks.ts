import { useEffect } from 'react';

const DIALOG_LOCK_CLEANUP_RETRY_MS = 80;
const DIALOG_LOCK_CLEANUP_MAX_ATTEMPTS = 16;

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
  const timeoutIds: number[] = [];
  let attempts = 0;

  function runCleanup() {
    attempts += 1;
    cleanupDialogPageLocks();

    if (!hasActiveDialog() || attempts >= DIALOG_LOCK_CLEANUP_MAX_ATTEMPTS) {
      return;
    }

    timeoutIds.push(window.setTimeout(runCleanup, DIALOG_LOCK_CLEANUP_RETRY_MS));
  }

  timeoutIds.push(window.setTimeout(runCleanup, 0));

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

import type { ReactNode } from 'react';
import { createToaster } from '@chakra-ui/react';

type ToastType = 'success' | 'error' | 'warning' | 'info';

interface ToastAction {
  label: string;
  onClick: () => void;
}

export const toaster = createToaster({
  placement: 'top-end',
  pauseOnPageIdle: true,
});

type ChakraToastOptions = Parameters<typeof toaster.create>[0];
type ToastOptions = Omit<ChakraToastOptions, 'title' | 'description' | 'type' | 'closable' | 'action'> & {
  action?: ToastAction;
  closable?: boolean;
  description?: ReactNode;
};

function createToast(type: ToastType, title: ReactNode, options: ToastOptions = {}) {
  return toaster.create({
    ...options,
    title,
    type,
    closable: options.closable ?? true,
    action: options.action,
  });
}

export const toast = {
  success: (title: ReactNode, options?: ToastOptions) => createToast('success', title, options),
  error: (title: ReactNode, options?: ToastOptions) => createToast('error', title, options),
  warning: (title: ReactNode, options?: ToastOptions) => createToast('warning', title, options),
  info: (title: ReactNode, options?: ToastOptions) => createToast('info', title, options),
  dismiss: (id?: string) => toaster.dismiss(id),
};

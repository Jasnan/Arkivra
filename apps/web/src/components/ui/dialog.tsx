import * as React from 'react';
import { Dialog as ChakraDialog, Portal } from '@chakra-ui/react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

const DialogFocusContext = React.createContext<{
  setTriggerElement: (element: HTMLElement | null) => void;
} | null>(null);

type DialogRootProps = Omit<
  React.ComponentProps<typeof ChakraDialog.Root>,
  'onOpenChange'
> & {
  onOpenChange?: (open: boolean) => void;
};

export function Dialog({ onOpenChange, ...props }: DialogRootProps) {
  const triggerElementRef = React.useRef<HTMLElement | null>(null);

  return (
    <DialogFocusContext value={{ setTriggerElement: (element) => {
      triggerElementRef.current = element;
    } }}
    >
      <ChakraDialog.Root
        placement="center"
        onOpenChange={(event) => {
          onOpenChange?.(event.open);
          if (!event.open) {
            window.setTimeout(() => triggerElementRef.current?.focus(), 0);
          }
        }}
        {...props}
      />
    </DialogFocusContext>
  );
}

export function DialogTrigger(props: React.ComponentProps<typeof ChakraDialog.Trigger>) {
  const focus = React.useContext(DialogFocusContext);

  return (
    <ChakraDialog.Trigger
      {...props}
      onClick={(event) => {
        focus?.setTriggerElement(event.currentTarget);
        props.onClick?.(event);
      }}
    />
  );
}

export function DialogPortal(props: React.ComponentProps<typeof Portal>) {
  return <Portal {...props} />;
}

export function DialogClose(props: React.ComponentProps<typeof ChakraDialog.CloseTrigger>) {
  return <ChakraDialog.CloseTrigger {...props} />;
}

type DialogOverlayProps = React.ComponentPropsWithRef<typeof ChakraDialog.Backdrop>;

export function DialogOverlay({ className, ref, ...props }: DialogOverlayProps) {
  return (
    <ChakraDialog.Backdrop
      ref={ref}
      className={cn('fixed inset-0 z-50 bg-background/65 backdrop-blur-sm', className)}
      {...props}
    />
  );
}

type DialogContentProps = React.ComponentPropsWithRef<typeof ChakraDialog.Content> & {
  hideCloseButton?: boolean;
  onEscapeKeyDown?: (event: Event) => void;
  onOpenAutoFocus?: (event: Event) => void;
  onPointerDownOutside?: (event: Event) => void;
};

export function DialogContent({
  className,
  children,
  hideCloseButton = false,
  onEscapeKeyDown: _onEscapeKeyDown,
  onOpenAutoFocus: _onOpenAutoFocus,
  onPointerDownOutside: _onPointerDownOutside,
  ref,
  ...props
}: DialogContentProps) {
  return (
    <Portal>
      <DialogOverlay />
      <ChakraDialog.Positioner className="fixed inset-0 z-50 flex items-center justify-center px-4 py-8">
        <ChakraDialog.Content
          ref={ref}
          className={cn(
            'relative z-50 w-full overflow-hidden rounded-lg border border-border/70 bg-card shadow-xl',
            className,
          )}
          {...(props as any)}
        >
          {children}
          {hideCloseButton ? null : (
            <ChakraDialog.CloseTrigger
              aria-label="Close"
              className="absolute right-6 top-6 inline-flex size-9 items-center justify-center rounded-full text-muted-foreground transition hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <X className="size-5" />
            </ChakraDialog.CloseTrigger>
          )}
        </ChakraDialog.Content>
      </ChakraDialog.Positioner>
    </Portal>
  );
}

export const DialogHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <ChakraDialog.Header className={cn('flex flex-col gap-2', className)} {...props} />
);

export const DialogFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <ChakraDialog.Footer className={cn('flex flex-wrap justify-end gap-3', className)} {...props} />
);

type DialogTitleProps = React.ComponentPropsWithRef<typeof ChakraDialog.Title>;

export function DialogTitle({ className, ref, ...props }: DialogTitleProps) {
  return (
    <ChakraDialog.Title
      ref={ref}
      className={cn('font-display text-xl font-semibold text-foreground', className)}
      {...props}
    />
  );
}

type DialogDescriptionProps = React.ComponentPropsWithRef<typeof ChakraDialog.Description>;

export function DialogDescription({ className, ref, ...props }: DialogDescriptionProps) {
  return (
    <ChakraDialog.Description
      ref={ref}
      className={cn('text-sm leading-6 text-muted-foreground', className)}
      {...props}
    />
  );
}

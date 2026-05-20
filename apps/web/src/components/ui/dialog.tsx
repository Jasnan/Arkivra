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

export function Dialog({ onOpenChange, onEscapeKeyDown, closeOnEscape, open, ...props }: DialogRootProps) {
  const triggerElementRef = React.useRef<HTMLElement | null>(null);
  const handleOpenChange = React.useCallback((open: boolean) => {
    onOpenChange?.(open);
    if (!open) {
      window.setTimeout(() => triggerElementRef.current?.focus(), 0);
    }
  }, [onOpenChange]);

  React.useEffect(() => {
    if (!open || closeOnEscape === false) {
      return;
    }

    function closeOnEscapeKey(event: KeyboardEvent) {
      if (event.key !== 'Escape' || event.defaultPrevented) {
        return;
      }

      handleOpenChange(false);
    }

    window.addEventListener('keydown', closeOnEscapeKey);
    return () => window.removeEventListener('keydown', closeOnEscapeKey);
  }, [closeOnEscape, handleOpenChange, open]);

  return (
    <DialogFocusContext value={{ setTriggerElement: (element) => {
      triggerElementRef.current = element;
    } }}
    >
      <ChakraDialog.Root
        placement="center"
        lazyMount
        unmountOnExit
        open={open}
        closeOnEscape={closeOnEscape}
        onEscapeKeyDown={(event) => {
          onEscapeKeyDown?.(event);
          if (event.defaultPrevented || closeOnEscape === false) {
            return;
          }

          handleOpenChange(false);
        }}
        onOpenChange={(event) => {
          handleOpenChange(event.open);
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

type DialogBodyProps = React.ComponentPropsWithRef<typeof ChakraDialog.Body>;

export const DialogBody = ({ className, ...props }: DialogBodyProps) => (
  <ChakraDialog.Body className={className} {...props} />
);

type DialogOverlayProps = React.ComponentPropsWithRef<typeof ChakraDialog.Backdrop>;

export function DialogOverlay({ className, ref, ...props }: DialogOverlayProps) {
  return (
    <ChakraDialog.Backdrop
      ref={ref}
      className={className}
      position="fixed"
      inset="0"
      zIndex="modal"
      backdropFilter="blur(4px)"
      bg="rgba(11, 13, 18, 0.65)"
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
  onEscapeKeyDown,
  onOpenAutoFocus,
  onPointerDownOutside,
  ref,
  ...props
}: DialogContentProps) {
  return (
    <Portal>
      <DialogOverlay />
      <ChakraDialog.Positioner
        position="fixed"
        inset="0"
        zIndex="modal"
        display="flex"
        alignItems="center"
        justifyContent="center"
        px="4"
        py="8"
      >
        <ChakraDialog.Content
          ref={ref}
          className={className}
          position="relative"
          zIndex="modal"
          w="full"
          overflow="hidden"
          rounded="lg"
          borderWidth="1px"
          borderColor="border.surface"
          bg="bg.surface"
          shadow="xl"
          onEscapeKeyDown={onEscapeKeyDown}
          onOpenAutoFocus={onOpenAutoFocus}
          onPointerDownOutside={onPointerDownOutside}
          {...(props as any)}
        >
          {hideCloseButton ? null : (
            <ChakraDialog.CloseTrigger
              aria-label="Close"
              position="absolute"
              top="6"
              right="6"
              display="inline-flex"
              alignItems="center"
              justifyContent="center"
              boxSize="9"
              rounded="full"
              color="fg.muted"
              transition="background 0.15s ease, color 0.15s ease"
              _hover={{ bg: 'bg.subtle', color: 'fg' }}
              _focusVisible={{ outline: '2px solid', outlineColor: 'teal.focusRing', outlineOffset: '2px' }}
            >
              <X size={20} />
            </ChakraDialog.CloseTrigger>
          )}
          {children}
        </ChakraDialog.Content>
      </ChakraDialog.Positioner>
    </Portal>
  );
}

type DialogHeaderProps = React.ComponentPropsWithRef<typeof ChakraDialog.Header>;

export const DialogHeader = ({ className, ...props }: DialogHeaderProps) => (
  <ChakraDialog.Header
    className={className}
    display="flex"
    flexDirection="column"
    gap="2"
    {...props}
  />
);

type DialogFooterProps = React.ComponentPropsWithRef<typeof ChakraDialog.Footer>;

export const DialogFooter = ({ className, ...props }: DialogFooterProps) => (
  <ChakraDialog.Footer
    className={className}
    display="flex"
    flexWrap="wrap"
    justifyContent="flex-end"
    gap="3"
    {...props}
  />
);

type DialogTitleProps = React.ComponentPropsWithRef<typeof ChakraDialog.Title>;

export function DialogTitle({ className, ref, ...props }: DialogTitleProps) {
  return (
    <ChakraDialog.Title
      ref={ref}
      className={cn('font-display', className)}
      fontSize="xl"
      fontWeight="semibold"
      color="fg"
      {...props}
    />
  );
}

type DialogDescriptionProps = React.ComponentPropsWithRef<typeof ChakraDialog.Description>;

export function DialogDescription({ className, ref, ...props }: DialogDescriptionProps) {
  return (
    <ChakraDialog.Description
      ref={ref}
      className={className}
      fontSize="sm"
      lineHeight="1.55"
      color="fg.muted"
      {...props}
    />
  );
}

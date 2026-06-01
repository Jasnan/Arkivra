import * as React from 'react';
import { AbsoluteCenter, Menu as ChakraMenu, Portal } from '@chakra-ui/react';
import { Check, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

function textValue(children: React.ReactNode, fallback = 'item') {
  if (typeof children === 'string' || typeof children === 'number') {
    return String(children);
  }

  return fallback;
}

function isTextEntryElement(element: EventTarget | null) {
  return (
    element instanceof HTMLInputElement
    || element instanceof HTMLTextAreaElement
    || (element instanceof HTMLElement && element.isContentEditable)
  );
}

type DropdownMenuProps = Omit<
  React.ComponentProps<typeof ChakraMenu.Root>,
  'onOpenChange'
> & {
  modal?: boolean;
  onOpenChange?: (open: boolean) => void;
};

export function DropdownMenu({ onOpenChange, modal: _modal, ...props }: DropdownMenuProps) {
  return (
    <ChakraMenu.Root
      lazyMount
      typeahead={false}
      unmountOnExit
      onOpenChange={onOpenChange ? (event) => onOpenChange(event.open) : undefined}
      {...props}
    />
  );
}

export function DropdownMenuTrigger(props: React.ComponentProps<typeof ChakraMenu.Trigger>) {
  return <ChakraMenu.Trigger {...props} />;
}

export function DropdownMenuPortal(props: React.ComponentProps<typeof Portal>) {
  return <Portal {...props} />;
}

export function DropdownMenuGroup(props: React.ComponentProps<typeof ChakraMenu.ItemGroup>) {
  return <ChakraMenu.ItemGroup {...props} />;
}

export function DropdownMenuSub(props: React.ComponentProps<typeof ChakraMenu.Root>) {
  return <ChakraMenu.Root positioning={{ placement: 'right-start', gutter: 2 }} {...props} />;
}

type DropdownMenuRadioGroupProps = Omit<
  React.ComponentProps<typeof ChakraMenu.RadioItemGroup>,
  'onValueChange'
> & {
  onValueChange?: (value: string) => void;
};

export function DropdownMenuRadioGroup({
  onValueChange,
  ...props
}: DropdownMenuRadioGroupProps) {
  return (
    <ChakraMenu.RadioItemGroup
      onValueChange={onValueChange ? (event) => onValueChange(event.value) : undefined}
      {...props}
    />
  );
}

type DropdownMenuSubTriggerProps = React.ComponentPropsWithRef<
  typeof ChakraMenu.TriggerItem
> & {
  inset?: boolean;
};

export function DropdownMenuSubTrigger({
  className,
  inset,
  children,
  ref,
  ...props
}: DropdownMenuSubTriggerProps) {
  return (
    <ChakraMenu.TriggerItem
      ref={ref}
      className={className}
      cursor="default"
      display="flex"
      alignItems="center"
      gap="2"
      rounded="md"
      px="3"
      py="2"
      ps={inset ? '8' : undefined}
      fontSize="sm"
      fontWeight="medium"
      color="fg.muted"
      outline="none"
      transition="background-color 120ms ease, color 120ms ease"
      _highlighted={{ bg: 'bg.subtle', color: 'fg' }}
      _open={{ bg: 'bg.subtle', color: 'fg' }}
      {...props}
    >
      {children}
      <ChevronRight className="ml-auto size-4" />
    </ChakraMenu.TriggerItem>
  );
}

type DropdownMenuSubContentProps = React.ComponentPropsWithRef<typeof ChakraMenu.Content>;

export function DropdownMenuSubContent({ className, ref, ...props }: DropdownMenuSubContentProps) {
  return (
    <Portal>
      <ChakraMenu.Positioner>
        <ChakraMenu.Content
          ref={ref}
          className={className}
          zIndex="dropdown"
          minW="9rem"
          overflow="hidden"
          rounded="lg"
          borderWidth="1px"
          borderColor="border.surface"
          bg="bg.surface"
          p="1.5"
          shadow="lg"
          {...props}
        />
      </ChakraMenu.Positioner>
    </Portal>
  );
}

type DropdownMenuContentProps = React.ComponentPropsWithRef<typeof ChakraMenu.Content> & {
  align?: 'start' | 'center' | 'end';
  onCloseAutoFocus?: (event: Event) => void;
  sideOffset?: number;
};

export function DropdownMenuContent({
  className,
  align: _align,
  onCloseAutoFocus: _onCloseAutoFocus,
  sideOffset: _sideOffset,
  onKeyDownCapture,
  ref,
  ...props
}: DropdownMenuContentProps) {
  return (
    <Portal>
      <ChakraMenu.Positioner>
        <ChakraMenu.Content
          ref={ref}
          className={className}
          zIndex="dropdown"
          minW="9rem"
          overflow="hidden"
          rounded="lg"
          borderWidth="1px"
          borderColor="border.surface"
          bg="bg.surface"
          p="1.5"
          shadow="lg"
          onKeyDownCapture={(event) => {
            onKeyDownCapture?.(event);
            if (!event.defaultPrevented && isTextEntryElement(event.target)) {
              event.stopPropagation();
            }
          }}
          onPointerDownCapture={(event) => {
            if (isTextEntryElement(event.target)) {
              event.stopPropagation();
            }
          }}
          onClickCapture={(event) => {
            if (isTextEntryElement(event.target)) {
              event.stopPropagation();
            }
          }}
          {...(props as any)}
        />
      </ChakraMenu.Positioner>
    </Portal>
  );
}

type DropdownMenuItemProps = Omit<
  React.ComponentPropsWithRef<typeof ChakraMenu.Item>,
  'value'
> & {
  value?: string;
  inset?: boolean;
};

export function DropdownMenuItem({
  className,
  inset,
  children,
  onClick,
  onSelect,
  ref,
  value,
  ...props
}: DropdownMenuItemProps) {
  return (
    <ChakraMenu.Item
      ref={ref}
      value={value ?? textValue(children)}
      className={className}
      cursor="default"
      userSelect="none"
      display="flex"
      alignItems="center"
      gap="3"
      rounded="md"
      px="3"
      py="2"
      ps={inset ? '8' : undefined}
      fontSize="sm"
      fontWeight="medium"
      color="fg.muted"
      outline="none"
      transition="background-color 120ms ease, color 120ms ease"
      _highlighted={{ bg: 'bg.subtle', color: 'fg' }}
      _disabled={{ pointerEvents: 'none', opacity: 0.5 }}
      onClick={(event) => {
        onClick?.(event);
        onSelect?.();
      }}
      {...props}
    >
      {children}
    </ChakraMenu.Item>
  );
}

type DropdownMenuCheckboxItemProps = Omit<
  React.ComponentPropsWithRef<typeof ChakraMenu.CheckboxItem>,
  'value'
> & {
  value?: string;
  onSelect?: (event: { preventDefault: () => void }) => void;
};

export function DropdownMenuCheckboxItem({
  className,
  children,
  checked,
  ref,
  value,
  closeOnSelect = false,
  onSelect,
  ...props
}: DropdownMenuCheckboxItemProps) {
  return (
    <ChakraMenu.CheckboxItem
      ref={ref}
      value={value ?? textValue(children)}
      className={className}
      cursor="default"
      userSelect="none"
      display="flex"
      alignItems="center"
      gap="3"
      rounded="md"
      py="2"
      ps="3"
      pe="10"
      fontSize="sm"
      fontWeight="medium"
      color="fg.muted"
      outline="none"
      transition="background-color 120ms ease, color 120ms ease"
      _checked={{ bg: 'teal.subtle', color: 'fg' }}
      _highlighted={{ bg: 'bg.subtle', color: 'fg' }}
      _disabled={{ pointerEvents: 'none', opacity: 0.5 }}
      checked={checked}
      closeOnSelect={closeOnSelect}
      onClick={() => onSelect?.({ preventDefault: () => {} })}
      {...props}
    >
      <AbsoluteCenter axis="horizontal" insetStart="3">
        <ChakraMenu.ItemIndicator>
          <Check className="size-4" />
        </ChakraMenu.ItemIndicator>
      </AbsoluteCenter>
      {children}
    </ChakraMenu.CheckboxItem>
  );
}

type DropdownMenuRadioItemProps = React.ComponentPropsWithRef<typeof ChakraMenu.RadioItem>;

export function DropdownMenuRadioItem({
  className,
  children,
  ref,
  value,
  ...props
}: DropdownMenuRadioItemProps) {
  return (
    <ChakraMenu.RadioItem
      ref={ref}
      value={value}
      className={className}
      cursor="default"
      userSelect="none"
      display="flex"
      alignItems="center"
      gap="3"
      rounded="md"
      py="2"
      ps="9"
      pe="3"
      fontSize="sm"
      fontWeight="medium"
      color="fg.muted"
      outline="none"
      transition="background-color 120ms ease, color 120ms ease"
      _highlighted={{ bg: 'bg.subtle', color: 'fg' }}
      _disabled={{ pointerEvents: 'none', opacity: 0.5 }}
      {...props}
    >
      <AbsoluteCenter axis="horizontal" insetEnd="2.5">
        <ChakraMenu.ItemIndicator>
          <Check className="size-4 stroke-[2.5]" />
        </ChakraMenu.ItemIndicator>
      </AbsoluteCenter>
      {children}
    </ChakraMenu.RadioItem>
  );
}

type DropdownMenuLabelProps = React.HTMLAttributes<HTMLDivElement> & {
  inset?: boolean;
  ref?: React.Ref<HTMLDivElement>;
};

export function DropdownMenuLabel({ className, inset, ref, ...props }: DropdownMenuLabelProps) {
  return (
    <div
      ref={ref}
      className={cn('px-3 py-2 text-sm font-medium text-foreground', inset && 'pl-8', className)}
      {...props}
    />
  );
}

type DropdownMenuSeparatorProps = React.ComponentPropsWithRef<typeof ChakraMenu.Separator>;

export function DropdownMenuSeparator({ className, ref, ...props }: DropdownMenuSeparatorProps) {
  return (
    <ChakraMenu.Separator
      ref={ref}
      className={cn('-mx-1 my-1 h-px bg-border/70', className)}
      {...props}
    />
  );
}

export const DropdownMenuShortcut = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement>) => (
  <span
    className={cn('ml-auto text-xs tracking-[0.16em] text-muted-foreground', className)}
    {...props}
  />
);

DropdownMenuShortcut.displayName = 'DropdownMenuShortcut';

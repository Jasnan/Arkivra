import * as React from 'react';
import { AbsoluteCenter, Menu as ChakraMenu, Portal } from '@chakra-ui/react';
import { Check, ChevronRight, Circle } from 'lucide-react';
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
      className={cn(
        'flex cursor-default items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground outline-none transition focus:bg-secondary/70 focus:text-foreground data-[state=open]:bg-secondary/70 data-[state=open]:text-foreground',
        inset && 'pl-8',
        className,
      )}
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
    <ChakraMenu.Positioner>
      <ChakraMenu.Content
        ref={ref}
        className={cn(
          'z-50 min-w-36 overflow-hidden rounded-lg border border-border/70 bg-card p-1.5 shadow-lg',
          className,
        )}
        {...props}
      />
    </ChakraMenu.Positioner>
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
    <ChakraMenu.Positioner>
      <ChakraMenu.Content
        ref={ref}
        className={cn(
          'z-50 min-w-36 overflow-hidden rounded-lg border border-border/70 bg-card p-1.5 shadow-lg',
          className,
        )}
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
      className={cn(
        'relative flex cursor-default select-none items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground outline-none transition focus:bg-secondary/70 focus:text-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
        inset && 'pl-8',
        className,
      )}
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
      className={cn(
        'relative flex cursor-default select-none items-center gap-3 rounded-md py-2 pl-9 pr-3 text-sm font-medium text-muted-foreground outline-none transition focus:bg-secondary/70 focus:text-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
        className,
      )}
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
      className={cn(
        'relative flex cursor-default select-none items-center gap-3 rounded-md py-2 pl-9 pr-3 text-sm font-medium text-muted-foreground outline-none transition focus:bg-secondary/70 focus:text-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
        className,
      )}
      {...props}
    >
      <AbsoluteCenter axis="horizontal" insetStart="3">
        <ChakraMenu.ItemIndicator>
          <Circle className="size-2.5 fill-current" />
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

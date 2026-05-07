import * as React from 'react';
import {
  Select as ChakraSelect,
  createListCollection,
} from '@chakra-ui/react';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SelectOption {
  label: string;
  value: string;
}

const SelectItemsContext = React.createContext<Map<string, SelectOption> | null>(null);

function nodeText(node: React.ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') {
    return String(node);
  }

  if (Array.isArray(node)) {
    return node.map(nodeText).join('');
  }

  if (React.isValidElement<{ children?: React.ReactNode }>(node)) {
    return nodeText(node.props.children);
  }

  return '';
}

function collectItems(children: React.ReactNode, items = new Map<string, SelectOption>()) {
  React.Children.forEach(children, (child) => {
    if (!React.isValidElement(child)) {
      return;
    }

    if (child.type === SelectItem) {
      const props = child.props as { value?: string; children?: React.ReactNode };
      if (props.value) {
        items.set(props.value, {
          value: props.value,
          label: nodeText(props.children) || props.value,
        });
      }
      return;
    }

    if (child.type === React.Fragment) {
      collectItems((child.props as { children?: React.ReactNode }).children, items);
      return;
    }

    collectItems((child.props as { children?: React.ReactNode }).children, items);
  });

  return items;
}

type SelectProps = Omit<
  React.ComponentProps<typeof ChakraSelect.Root>,
  'collection' | 'defaultValue' | 'onValueChange' | 'value'
> & {
  defaultValue?: string;
  value?: string;
  onValueChange?: (value: string) => void;
};

export function Select({
  children,
  defaultValue,
  onValueChange,
  value,
  positioning,
  ...props
}: SelectProps) {
  const items = React.useMemo(() => collectItems(children), [children]);
  const collection = React.useMemo(
    () => createListCollection({ items: Array.from(items.values()) }),
    [items],
  );

  return (
    <SelectItemsContext value={items}>
      <ChakraSelect.Root
        collection={collection}
        defaultValue={defaultValue ? [defaultValue] : undefined}
        value={value ? [value] : undefined}
        onValueChange={onValueChange ? (event) => onValueChange(event.value[0] ?? '') : undefined}
        positioning={{ sameWidth: true, ...positioning }}
        {...props}
      >
        <ChakraSelect.HiddenSelect />
        {children}
      </ChakraSelect.Root>
    </SelectItemsContext>
  );
}

export function SelectGroup(props: React.ComponentProps<typeof ChakraSelect.ItemGroup>) {
  return <ChakraSelect.ItemGroup {...props} />;
}

export function SelectValue(props: React.ComponentProps<typeof ChakraSelect.ValueText>) {
  return <ChakraSelect.ValueText {...props} />;
}

type SelectTriggerProps = React.ComponentPropsWithRef<typeof ChakraSelect.Trigger>;

export function SelectTrigger({ className, children, ref, ...props }: SelectTriggerProps) {
  return (
    <ChakraSelect.Control>
      <ChakraSelect.Trigger
        ref={ref}
        className={cn(
          'flex h-10 w-full items-center justify-between gap-2 rounded-lg border border-border/70 bg-background px-3 text-left text-sm font-medium text-foreground outline-none transition focus:ring-2 focus:ring-primary/15 disabled:cursor-not-allowed disabled:opacity-50 [&>span]:truncate',
          className,
        )}
        {...props}
      >
        {children}
      </ChakraSelect.Trigger>
      <ChakraSelect.IndicatorGroup>
        <ChakraSelect.Indicator />
      </ChakraSelect.IndicatorGroup>
    </ChakraSelect.Control>
  );
}

export function SelectScrollUpButton(_props: React.HTMLAttributes<HTMLDivElement>) {
  return null;
}

export function SelectScrollDownButton(_props: React.HTMLAttributes<HTMLDivElement>) {
  return null;
}

type SelectContentProps = React.ComponentPropsWithRef<typeof ChakraSelect.Content> & {
  align?: 'start' | 'center' | 'end';
  position?: 'popper' | 'item-aligned';
};

export function SelectContent({
  className,
  children,
  align: _align,
  position: _position,
  ref,
  ...props
}: SelectContentProps) {
  const setContentRef = React.useCallback(
    (node: HTMLDivElement | null) => {
      if (node && typeof node.scrollTo !== 'function') {
        node.scrollTo = () => {};
      }

      if (typeof ref === 'function') {
        ref(node);
      } else if (ref) {
        ref.current = node;
      }
    },
    [ref],
  );

  return (
    <ChakraSelect.Positioner>
      <ChakraSelect.Content
        ref={setContentRef}
        className={cn(
          'z-50 max-h-96 min-w-[8rem] overflow-hidden rounded-lg border border-border/70 bg-card text-card-foreground shadow-lg',
          className,
        )}
        {...props}
      >
        {children}
      </ChakraSelect.Content>
    </ChakraSelect.Positioner>
  );
}

type SelectLabelProps = React.ComponentPropsWithRef<typeof ChakraSelect.Label>;

export function SelectLabel({ className, ref, ...props }: SelectLabelProps) {
  return (
    <ChakraSelect.Label
      ref={ref}
      className={cn('px-3 py-2 text-sm font-medium text-foreground', className)}
      {...props}
    />
  );
}

type SelectItemProps = Omit<
  React.ComponentPropsWithRef<typeof ChakraSelect.Item>,
  'item'
> & {
  value: string;
};

export function SelectItem({ className, children, ref, value, ...props }: SelectItemProps) {
  const items = React.useContext(SelectItemsContext);
  const item = items?.get(value) ?? { value, label: nodeText(children) || value };

  return (
    <ChakraSelect.Item
      ref={ref}
      item={item}
      className={cn(
        'relative flex w-full cursor-default select-none items-center rounded-md py-2 pl-9 pr-3 text-sm font-medium text-muted-foreground outline-none transition focus:bg-secondary/70 focus:text-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
        className,
      )}
      {...props}
    >
      <span className="absolute left-3 flex size-4 items-center justify-center">
        <ChakraSelect.ItemIndicator>
          <Check className="size-4" />
        </ChakraSelect.ItemIndicator>
      </span>
      <ChakraSelect.ItemText>{children}</ChakraSelect.ItemText>
    </ChakraSelect.Item>
  );
}

type SelectSeparatorProps = React.ComponentPropsWithRef<typeof ChakraSelect.ItemGroupLabel>;

export function SelectSeparator({ className, ref, ...props }: SelectSeparatorProps) {
  return (
    <ChakraSelect.ItemGroupLabel
      ref={ref}
      className={cn('-mx-1 my-1 h-px bg-border/70 p-0', className)}
      {...props}
    />
  );
}

import * as React from 'react';
import {
  Box,
  Select as ChakraSelect,
  createListCollection,
} from '@chakra-ui/react';
import { Check } from 'lucide-react';

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
        className={className}
        display="flex"
        w="full"
        alignItems="center"
        justifyContent="space-between"
        gap="2"
        rounded="lg"
        borderWidth="1px"
        borderColor="border.surface"
        bg="bg.surface"
        textAlign="left"
        fontSize="sm"
        fontWeight="medium"
        color="fg"
        outline="none"
        transition="border-color 120ms ease, box-shadow 120ms ease, background-color 120ms ease"
        _hover={{ borderColor: 'border.strong', bg: 'bg.surface' }}
        _focusVisible={{
          borderColor: 'teal.solid',
          boxShadow: '0 0 0 2px var(--chakra-colors-teal-focus-ring)',
        }}
        _disabled={{ cursor: 'not-allowed', opacity: 0.5 }}
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
        className={className}
        zIndex="dropdown"
        maxH="24rem"
        overflow="hidden"
        rounded="lg"
        borderWidth="1px"
        borderColor="border.surface"
        bg="bg.surface"
        color="fg"
        p="1.5"
        shadow="lg"
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
      className={className}
      px="3"
      py="2"
      fontSize="sm"
      fontWeight="medium"
      color="fg"
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
      className={className}
      position="relative"
      display="flex"
      w="full"
      cursor="default"
      userSelect="none"
      alignItems="center"
      minH="var(--arkivra-menuItemMinHeight, 2.5rem)"
      rounded="md"
      py="var(--arkivra-menuItemPaddingY, 0.5rem)"
      ps="3"
      pe="10"
      fontSize="sm"
      fontWeight="medium"
      color="fg"
      outline="none"
      borderWidth="1px"
      borderColor="transparent"
      transition="background-color 120ms ease, border-color 120ms ease, color 120ms ease"
      _checked={{ bg: 'teal.subtle', borderColor: 'teal.muted', color: 'teal.fg' }}
      _highlighted={{ bg: 'teal.subtle', borderColor: 'teal.muted', color: 'teal.fg' }}
      _disabled={{ pointerEvents: 'none', opacity: 0.5 }}
      css={{
        '&[data-highlighted][data-state=checked]': {
          background: 'var(--chakra-colors-teal-subtle)',
          borderColor: 'var(--chakra-colors-teal-muted)',
        },
      }}
      {...props}
    >
      <Box
        as="span"
        position="absolute"
        right="2.5"
        top="50%"
        display="flex"
        boxSize="5"
        alignItems="center"
        justifyContent="center"
        color="teal.solid"
        transform="translateY(-50%)"
      >
        <ChakraSelect.ItemIndicator>
          <Check className="size-4 stroke-[2.5]" />
        </ChakraSelect.ItemIndicator>
      </Box>
      <ChakraSelect.ItemText>{children}</ChakraSelect.ItemText>
    </ChakraSelect.Item>
  );
}

type SelectSeparatorProps = React.ComponentPropsWithRef<typeof ChakraSelect.ItemGroupLabel>;

export function SelectSeparator({ className, ref, ...props }: SelectSeparatorProps) {
  return (
    <ChakraSelect.ItemGroupLabel
      ref={ref}
      className={className}
      mx="-1"
      my="1"
      h="1px"
      bg="border.divider"
      p="0"
      {...props}
    />
  );
}

import * as React from 'react';
import type { ButtonProps, GroupProps, StackProps } from '@chakra-ui/react';
import {
  Box,
  HStack,
  IconButton,
  InputGroup,
  Stack,
  mergeRefs,
  useControllableState,
} from '@chakra-ui/react';
import { Eye, EyeOff } from 'lucide-react';
import { Input } from './input';

export interface PasswordVisibilityProps {
  defaultVisible?: boolean;
  visible?: boolean;
  onVisibleChange?: (visible: boolean) => void;
  visibilityIcon?: { on: React.ReactNode; off: React.ReactNode };
}

export interface PasswordInputProps
  extends Omit<React.ComponentProps<typeof Input>, 'type'>,
  PasswordVisibilityProps {
  ref?: React.Ref<HTMLInputElement>;
  rootProps?: GroupProps;
}

type VisibilityTriggerProps = ButtonProps & {
  ref?: React.Ref<HTMLButtonElement>;
};

function VisibilityTrigger({ ref, ...props }: VisibilityTriggerProps) {
  return (
    <IconButton
      tabIndex={-1}
      ref={ref}
      me="-2"
      aspectRatio="square"
      size="sm"
      variant="ghost"
      height="calc(100% - {spacing.2})"
      aria-label="Toggle password visibility"
      {...props}
    />
  );
}

export function PasswordInput({
  defaultVisible,
  ref,
  rootProps,
  onVisibleChange,
  visibilityIcon = { on: <Eye size={15} />, off: <EyeOff size={15} /> },
  visible: visibleProp,
  ...props
}: PasswordInputProps) {
  const [visible, setVisible] = useControllableState({
    defaultValue: defaultVisible || false,
    onChange: onVisibleChange,
    value: visibleProp,
  });
  const inputRef = React.useRef<HTMLInputElement>(null);

  return (
    <InputGroup
      endElement={(
        <VisibilityTrigger
          disabled={props.disabled}
          onPointerDown={(event) => {
            if (props.disabled) return;
            if (event.button !== 0) return;
            event.preventDefault();
            setVisible(!visible);
          }}
        >
          {visible ? visibilityIcon.off : visibilityIcon.on}
        </VisibilityTrigger>
      )}
      {...rootProps}
    >
      <Input
        ref={mergeRefs(ref, inputRef)}
        type={visible ? 'text' : 'password'}
        {...props}
      />
    </InputGroup>
  );
}

PasswordInput.displayName = 'PasswordInput';

interface PasswordStrengthMeterProps extends StackProps {
  max?: number;
  ref?: React.Ref<HTMLDivElement>;
  value: number;
}

export function PasswordStrengthMeter({
  max = 4,
  ref,
  value,
  ...rest
}: PasswordStrengthMeterProps) {
  const percent = (value / max) * 100;
  const { colorPalette, label } = getColorPalette(percent);

  return (
    <Stack align="flex-end" gap="1" ref={ref} {...rest}>
      <HStack width="full">
        {Array.from({ length: max }).map((_, index) => (
          <Box
            key={`strength-segment-${index + 1}`}
            height="1"
            flex="1"
            rounded="sm"
            data-selected={index < value ? '' : undefined}
            layerStyle="fill.subtle"
            colorPalette="gray"
            _selected={{
              colorPalette,
              layerStyle: 'fill.solid',
            }}
          />
        ))}
      </HStack>
      {label ? <HStack textStyle="xs">{label}</HStack> : null}
    </Stack>
  );
}

function getColorPalette(percent: number) {
  if (percent <= 0) {
    return { colorPalette: 'gray', label: 'Not started' };
  }

  switch (true) {
    case percent < 33:
      return { colorPalette: 'red', label: 'Low' };
    case percent < 66:
      return { colorPalette: 'orange', label: 'Medium' };
    default:
      return { colorPalette: 'green', label: 'High' };
  }
}

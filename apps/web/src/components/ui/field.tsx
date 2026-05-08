import * as React from 'react';
import { Box, Field as ChakraField, Stack, Text, chakra } from '@chakra-ui/react';
import { Separator } from './separator';

export function FieldSet(props: React.ComponentProps<typeof Box>) {
  return <Box as="fieldset" display="grid" gap="4" {...props} />;
}

export function FieldLegend({
  variant = 'legend',
  ...props
}: React.ComponentProps<typeof Box> & {
  variant?: 'legend' | 'label';
}) {
  return (
    <Box
      as="legend"
      textStyle={variant === 'legend' ? 'section.title' : undefined}
      fontSize={variant === 'label' ? 'sm' : undefined}
      fontWeight={variant === 'label' ? 'medium' : undefined}
      color="fg"
      {...props}
    />
  );
}

export function FieldGroup(props: React.ComponentProps<typeof Stack>) {
  return <Stack gap="4" {...props} />;
}

export function FieldSeparator(props: React.ComponentProps<typeof Separator>) {
  return <Separator {...props} />;
}

export function FieldContent(props: React.ComponentProps<typeof Stack>) {
  return <Stack gap="1.5" {...props} />;
}

export function FieldTitle(props: React.ComponentProps<typeof Box>) {
  return <Box fontSize="sm" fontWeight="medium" color="fg" {...props} />;
}

export function FieldDescription(props: React.ComponentProps<typeof Text>) {
  return <Text textStyle="sm" color="fg.muted" {...props} />;
}

export function FieldError({
  errors,
  children,
  ...props
}: React.ComponentProps<typeof ChakraField.ErrorText> & {
  errors?: Array<{ message?: string } | undefined>;
}) {
  const messages = errors?.map((error) => error?.message).filter(Boolean);

  if (messages && messages.length > 0) {
    return (
      <ChakraField.ErrorText {...props}>
        {messages.length === 1
          ? messages[0]
          : (
              <Box as="ul" ps="5">
                {messages.map((message) => <Box as="li" key={message}>{message}</Box>)}
              </Box>
            )}
      </ChakraField.ErrorText>
    );
  }

  return <ChakraField.ErrorText {...props}>{children}</ChakraField.ErrorText>;
}

type FieldProps = React.ComponentProps<typeof ChakraField.Root> & {
  ref?: React.Ref<HTMLDivElement>;
};

export function Field({ ref, ...props }: FieldProps) {
  return <ChakraField.Root ref={ref} role="group" {...props} />;
}

Field.displayName = 'Field';

type FieldLabelProps = React.ComponentProps<typeof chakra.label> & {
  ref?: React.Ref<HTMLLabelElement>;
};

export function FieldLabel({ ref, ...props }: FieldLabelProps) {
  return (
    <chakra.label
      ref={ref}
      fontSize="sm"
      fontWeight="medium"
      color="fg"
      {...props}
    />
  );
}

FieldLabel.displayName = 'FieldLabel';

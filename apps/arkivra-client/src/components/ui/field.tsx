import * as React from 'react';
import { Box, Stack, Text, chakra } from '@chakra-ui/react';
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
}: React.ComponentProps<typeof Text> & {
  errors?: Array<{ message?: string } | undefined>;
}) {
  const messages = errors?.map((error) => error?.message).filter(Boolean);

  return (
    <Text fontSize="sm" color="fg.error" {...props}>
      {messages && messages.length > 0
        ? messages.length === 1
          ? messages[0]
          : (
              <Box as="ul" ps="5">
                {messages.map((message) => <Box as="li" key={message}>{message}</Box>)}
              </Box>
            )
        : children}
    </Text>
  );
}

type FieldProps = React.ComponentProps<typeof Box> & {
  ref?: React.Ref<HTMLDivElement>;
};

export function Field({ ref, ...props }: FieldProps) {
  return <Box ref={ref} {...props} />;
}

Field.displayName = 'Field';

type FieldLabelProps = React.ComponentProps<typeof chakra.label> & {
  ref?: React.Ref<HTMLLabelElement>;
  srOnly?: boolean;
};

export function FieldLabel({ ref, srOnly, ...props }: FieldLabelProps) {
  return (
    <chakra.label
      ref={ref}
      fontSize="sm"
      fontWeight="medium"
      color="fg"
      {...(srOnly ? { srOnly: true } : {})}
      {...props}
    />
  );
}

FieldLabel.displayName = 'FieldLabel';

import * as React from 'react';
import { Box, Heading, Text } from '@chakra-ui/react';

export function Card(props: React.ComponentProps<typeof Box>) {
  return <Box rounded="lg" borderWidth="1px" borderColor="border.surface" bg="bg.surface" shadow="sm" {...props} />;
}

export function CardHeader(props: React.ComponentProps<typeof Box>) {
  return <Box display="grid" gap="1.5" {...props} />;
}

export function CardTitle(props: React.ComponentProps<typeof Heading>) {
  return <Heading as="h3" textStyle="lg" fontWeight="semibold" lineHeight="short" {...props} />;
}

export function CardDescription(props: React.ComponentProps<typeof Text>) {
  return <Text textStyle="sm" color="fg.muted" {...props} />;
}

export function CardContent(props: React.ComponentProps<typeof Box>) {
  return <Box {...props} />;
}

export function CardFooter(props: React.ComponentProps<typeof Box>) {
  return <Box display="flex" alignItems="center" {...props} />;
}

import { defineTextStyles } from '@chakra-ui/react';

export const textStyles = defineTextStyles({
  'page.title': {
    value: {
      fontFamily: 'heading',
      fontSize: { base: '2xl', md: '3xl' },
      fontWeight: 'semibold',
      lineHeight: '1.2',
      letterSpacing: '0',
      color: 'text.default',
    },
  },
  'section.title': {
    value: {
      fontFamily: 'heading',
      fontSize: 'lg',
      fontWeight: 'semibold',
      lineHeight: '1.3',
      letterSpacing: '0',
      color: 'text.default',
    },
  },
  label: {
    value: {
      fontSize: 'xs',
      fontWeight: 'medium',
      lineHeight: '1.2',
      letterSpacing: '0.08em',
      textTransform: 'uppercase',
      color: 'text.muted',
    },
  },
  body: {
    value: {
      fontSize: 'sm',
      lineHeight: '1.6',
      color: 'text.default',
    },
  },
  metadata: {
    value: {
      fontSize: 'sm',
      lineHeight: '1.5',
      color: 'text.muted',
    },
  },
  snippet: {
    value: {
      fontSize: 'sm',
      lineHeight: '1.75',
      color: 'text.muted',
    },
  },
});

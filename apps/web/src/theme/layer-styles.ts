import { defineLayerStyles } from '@chakra-ui/react';

export const layerStyles = defineLayerStyles({
  'ark.panel': {
    value: {
      rounded: 'lg',
      borderWidth: '1px',
      borderColor: 'border.subtle',
      bg: 'surface.default',
      color: 'text.default',
      shadow: 'xs',
    },
  },
  'ark.panel.subtle': {
    value: {
      rounded: 'lg',
      borderWidth: '1px',
      borderColor: 'border.subtle',
      bg: 'surface.subtle',
      color: 'text.default',
    },
  },
  'ark.panel.raised': {
    value: {
      rounded: 'lg',
      borderWidth: '1px',
      borderColor: 'border.default',
      bg: 'surface.raised',
      color: 'text.default',
      shadow: 'lg',
    },
  },
  'ark.panel.strong': {
    value: {
      rounded: 'lg',
      bg: 'surface.strong',
      color: 'text.inverse',
    },
  },
  'ark.toolbar': {
    value: {
      rounded: 'lg',
      borderWidth: '1px',
      borderColor: 'border.subtle',
      bg: 'surface.default/85',
      p: '4',
    },
  },
  'ark.empty': {
    value: {
      rounded: 'lg',
      borderWidth: '1px',
      borderStyle: 'dashed',
      borderColor: 'border.default',
      bg: 'surface.subtle',
      color: 'text.muted',
      p: '4',
    },
  },
  'ark.listRow': {
    value: {
      borderColor: 'border.subtle',
      _hover: {
        bg: 'surface.selected',
      },
    },
  },
  'ark.sidebar': {
    value: {
      bg: 'app.shell',
      color: 'text.default',
      borderColor: 'border.subtle',
    },
  },
} as any);

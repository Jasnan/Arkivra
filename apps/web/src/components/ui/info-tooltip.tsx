import type { ComponentProps, ReactNode } from 'react';
import { IconButton, Text } from '@chakra-ui/react';
import { CircleHelp } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from './tooltip';

export function InfoTooltip({
  content,
  contentProps,
  label = 'Show help tooltip',
  triggerClassName,
  contentClassName,
}: {
  content: ReactNode;
  contentProps?: Omit<ComponentProps<typeof TooltipContent>, 'children' | 'className'>;
  label?: string;
  triggerClassName?: string;
  contentClassName?: string;
}) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <IconButton
            type="button"
            aria-label={label}
            className={triggerClassName}
            variant="ghost"
            size="xs"
            boxSize="6"
            minW="6"
            rounded="full"
            borderWidth="1px"
            borderColor="border.surface"
            bg="bg.surface"
            color="fg.muted"
            _hover={{ bg: 'bg.subtle', color: 'fg' }}
            _focusVisible={{ outline: '2px solid', outlineColor: 'teal.focusRing', outlineOffset: '2px' }}
          >
            <CircleHelp size={14} />
          </IconButton>
        </TooltipTrigger>
        <TooltipContent className={contentClassName} {...contentProps}>
          <Text as="span" fontSize="sm" lineHeight="1.45">
            {content}
          </Text>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

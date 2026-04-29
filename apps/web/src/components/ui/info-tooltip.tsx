import type { ReactNode } from 'react';
import { CircleHelp } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from './tooltip';

export function InfoTooltip({
  content,
  label = 'Show help tooltip',
  triggerClassName,
  contentClassName,
}: {
  content: ReactNode;
  label?: string;
  triggerClassName?: string;
  contentClassName?: string;
}) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label={label}
            className={cn(
              'inline-flex size-6 items-center justify-center rounded-full border border-border/70 bg-background text-muted-foreground transition hover:text-foreground',
              triggerClassName,
            )}
          >
            <CircleHelp className="size-3.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent className={contentClassName}>
          {content}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

type TooltipIconButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  tooltip?: string;
  side?: "top" | "right" | "bottom" | "left";
  variant?: string;
  size?: string;
  children?: ReactNode;
};

export function TooltipIconButton({ tooltip, className, children, ...props }: TooltipIconButtonProps) {
  return (
    <button
      type="button"
      aria-label={tooltip}
      title={tooltip}
      className={cn("inline-flex size-8 items-center justify-center rounded-md transition-colors hover:bg-muted disabled:opacity-50", className)}
      {...props}
    >
      {children}
    </button>
  );
}

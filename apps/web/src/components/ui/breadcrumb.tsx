import * as React from 'react';
import { ChevronRight, MoreHorizontal } from 'lucide-react';
import { cn } from '@/lib/utils';

type BreadcrumbProps = React.ComponentPropsWithoutRef<'nav'> & {
  ref?: React.Ref<HTMLElement>;
};

export function Breadcrumb({ className, ref, ...props }: BreadcrumbProps) {
  return (
    <nav
      ref={ref}
      aria-label="Breadcrumb"
      className={cn('min-w-0 overflow-hidden', className)}
      {...props}
    />
  );
}

Breadcrumb.displayName = 'Breadcrumb';

type BreadcrumbListProps = React.ComponentPropsWithoutRef<'ol'> & {
  ref?: React.Ref<HTMLOListElement>;
};

export function BreadcrumbList({ className, ref, ...props }: BreadcrumbListProps) {
  return (
    <ol
      ref={ref}
      className={cn(
        'flex min-w-0 flex-wrap items-center gap-1.5 text-sm text-muted-foreground',
        className,
      )}
      {...props}
    />
  );
}

BreadcrumbList.displayName = 'BreadcrumbList';

type BreadcrumbItemProps = React.ComponentPropsWithoutRef<'li'> & {
  ref?: React.Ref<HTMLLIElement>;
};

export function BreadcrumbItem({ className, ref, ...props }: BreadcrumbItemProps) {
  return (
    <li
      ref={ref}
      className={cn('inline-flex min-w-0 items-center gap-1.5', className)}
      {...props}
    />
  );
}

BreadcrumbItem.displayName = 'BreadcrumbItem';

type BreadcrumbLinkProps = React.ComponentPropsWithoutRef<'a'> & {
  ref?: React.Ref<HTMLAnchorElement>;
};

export function BreadcrumbLink({ className, ref, ...props }: BreadcrumbLinkProps) {
  return (
    <a
      ref={ref}
      className={cn('font-medium transition hover:text-foreground', className)}
      {...props}
    />
  );
}

BreadcrumbLink.displayName = 'BreadcrumbLink';

type BreadcrumbPageProps = React.ComponentPropsWithoutRef<'span'> & {
  ref?: React.Ref<HTMLSpanElement>;
};

export function BreadcrumbPage({ className, ref, ...props }: BreadcrumbPageProps) {
  return (
    <span
      ref={ref}
      aria-current="page"
      className={cn('font-medium text-foreground', className)}
      {...props}
    />
  );
}

BreadcrumbPage.displayName = 'BreadcrumbPage';

export const BreadcrumbSeparator = ({
  children,
  className,
  ...props
}: React.ComponentPropsWithoutRef<'li'>) => (
  <li
    role="presentation"
    aria-hidden="true"
    className={cn('shrink-0 text-muted-foreground', className)}
    {...props}
  >
    {children ?? <ChevronRight className="size-3.5" />}
  </li>
);

BreadcrumbSeparator.displayName = 'BreadcrumbSeparator';

export const BreadcrumbEllipsis = ({
  className,
  ...props
}: React.ComponentPropsWithoutRef<'span'>) => (
  <span
    role="presentation"
    aria-hidden="true"
    className={cn('flex size-9 items-center justify-center', className)}
    {...props}
  >
    <MoreHorizontal className="size-4" />
    <span className="sr-only">More</span>
  </span>
);

BreadcrumbEllipsis.displayName = 'BreadcrumbEllipsis';

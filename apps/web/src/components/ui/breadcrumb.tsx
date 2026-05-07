import * as React from 'react';
import { chakra } from '@chakra-ui/react';
import { ChevronRight, MoreHorizontal } from 'lucide-react';

type BreadcrumbProps = React.ComponentProps<typeof chakra.nav> & {
  ref?: React.Ref<HTMLElement>;
};

export function Breadcrumb({ ref, ...props }: BreadcrumbProps) {
  return (
    <chakra.nav
      ref={ref}
      aria-label="Breadcrumb"
      minW="0"
      overflow="hidden"
      {...props}
    />
  );
}

Breadcrumb.displayName = 'Breadcrumb';

type BreadcrumbListProps = React.ComponentProps<typeof chakra.ol> & {
  ref?: React.Ref<HTMLOListElement>;
};

export function BreadcrumbList({ ref, ...props }: BreadcrumbListProps) {
  return (
    <chakra.ol
      ref={ref}
      display="flex"
      minW="0"
      flexWrap="wrap"
      alignItems="center"
      gap="1.5"
      fontSize="sm"
      color="text.muted"
      {...props}
    />
  );
}

BreadcrumbList.displayName = 'BreadcrumbList';

type BreadcrumbItemProps = React.ComponentProps<typeof chakra.li> & {
  ref?: React.Ref<HTMLLIElement>;
};

export function BreadcrumbItem({ ref, ...props }: BreadcrumbItemProps) {
  return (
    <chakra.li
      ref={ref}
      display="inline-flex"
      minW="0"
      alignItems="center"
      gap="1.5"
      {...props}
    />
  );
}

BreadcrumbItem.displayName = 'BreadcrumbItem';

type BreadcrumbLinkProps = React.ComponentProps<typeof chakra.a> & {
  ref?: React.Ref<HTMLAnchorElement>;
};

export function BreadcrumbLink({ ref, ...props }: BreadcrumbLinkProps) {
  return (
    <chakra.a
      ref={ref}
      fontWeight="medium"
      transition="color 0.15s ease"
      _hover={{ color: 'text.default' }}
      {...props}
    />
  );
}

BreadcrumbLink.displayName = 'BreadcrumbLink';

type BreadcrumbPageProps = React.ComponentProps<typeof chakra.span> & {
  ref?: React.Ref<HTMLSpanElement>;
};

export function BreadcrumbPage({ ref, ...props }: BreadcrumbPageProps) {
  return (
    <chakra.span
      ref={ref}
      aria-current="page"
      fontWeight="medium"
      color="text.default"
      {...props}
    />
  );
}

BreadcrumbPage.displayName = 'BreadcrumbPage';

export const BreadcrumbSeparator = ({
  children,
  ...props
}: React.ComponentProps<typeof chakra.li>) => (
  <chakra.li
    role="presentation"
    aria-hidden="true"
    flexShrink="0"
    color="text.muted"
    {...props}
  >
    {children ?? <ChevronRight className="size-3.5" />}
  </chakra.li>
);

BreadcrumbSeparator.displayName = 'BreadcrumbSeparator';

export const BreadcrumbEllipsis = ({
  ...props
}: React.ComponentProps<typeof chakra.span>) => (
  <chakra.span
    role="presentation"
    aria-hidden="true"
    display="flex"
    boxSize="9"
    alignItems="center"
    justifyContent="center"
    {...props}
  >
    <MoreHorizontal className="size-4" />
    <span className="sr-only">More</span>
  </chakra.span>
);

BreadcrumbEllipsis.displayName = 'BreadcrumbEllipsis';

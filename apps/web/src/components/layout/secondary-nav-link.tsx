import type { ReactNode } from 'react';
import { Box, Flex, Text, chakra } from '@chakra-ui/react';
import { Link } from '@tanstack/react-router';
import { ChevronDown, ChevronRight } from 'lucide-react';

export type SecondaryNavLinkExpansionState = 'expanded' | 'collapsed';

export function SecondaryNavLink({
  to,
  label,
  icon,
  active,
  depth = 0,
  search,
  expansionState,
  onExpand,
  onCollapse,
  reserveDisclosureSpace = false,
}: {
  to: string;
  label: string;
  icon: ReactNode;
  active?: boolean;
  depth?: number;
  search?: Record<string, string>;
  expansionState?: SecondaryNavLinkExpansionState;
  onExpand?: () => void;
  onCollapse?: () => void;
  reserveDisclosureSpace?: boolean;
}) {
  const hasExpansionState = expansionState !== undefined;
  const isExpanded = expansionState === 'expanded';
  const showDisclosureSlot = hasExpansionState || reserveDisclosureSpace;

  return (
    <Flex
      align="center"
      gap="2"
      minH="9"
      rounded="md"
      px="2.5"
      ml={`${Math.min(depth, 6) * 0.8}rem`}
      fontSize="sm"
      color={active ? 'fg' : 'fg.muted'}
      bg={active ? 'bg.muted' : 'transparent'}
      _hover={{ bg: 'bg.muted', color: 'fg' }}
    >
      {showDisclosureSlot ? (
        hasExpansionState ? (
          <chakra.button
            type="button"
            aria-label={`${isExpanded ? 'Collapse' : 'Expand'} ${label}`}
            aria-expanded={isExpanded}
            onClick={() => {
              if (isExpanded) {
                onCollapse?.();
              } else {
                onExpand?.();
              }
            }}
            display="inline-flex"
            alignItems="center"
            justifyContent="center"
            flexShrink={0}
            width="5"
            height="5"
            rounded="sm"
            color={active ? 'fg' : 'fg.subtle'}
            _hover={{ color: 'fg', bg: 'bg.subtle' }}
            _focusVisible={{ outline: '2px solid', outlineColor: 'teal.focusRing', outlineOffset: '2px' }}
          >
            {isExpanded
              ? <ChevronDown size={15} strokeWidth={2.25} />
              : <ChevronRight size={15} strokeWidth={2.25} />}
          </chakra.button>
        ) : (
          <Box boxSize="5" flexShrink={0} aria-hidden="true" />
        )
      ) : null}
      <Link
        to={to}
        search={search as any}
        onClick={(event) => {
          if (!hasExpansionState) return;
          if (
            event.defaultPrevented ||
            event.button !== 0 ||
            event.metaKey ||
            event.ctrlKey ||
            event.shiftKey ||
            event.altKey
          ) return;

          if (isExpanded) {
            onCollapse?.();
          } else {
            onExpand?.();
          }
        }}
        style={{ color: 'inherit', textDecoration: 'none', minWidth: 0, flex: 1 }}
      >
        <Flex align="center" gap="2.5" minW="0">
          <Flex boxSize="4.5" align="center" justify="center" shrink={0}>
            {icon}
          </Flex>
          <Text truncate>{label}</Text>
        </Flex>
      </Link>
    </Flex>
  );
}

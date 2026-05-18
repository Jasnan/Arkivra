import type { ReactNode } from 'react';
import { Box, Flex, Text, chakra } from '@chakra-ui/react';
import { Link } from '@tanstack/react-router';
import { ChevronDown, ChevronRight } from 'lucide-react';

export type SecondaryNavLinkExpansionState = 'expanded' | 'collapsed';

export function SecondaryNavLink({
  to,
  label,
  description,
  icon,
  active,
  depth = 0,
  search,
  expansionState,
  onExpand,
  onCollapse,
  reserveDisclosureSpace = false,
  density = 'default',
}: {
  to: string;
  label: string;
  description?: string;
  icon: ReactNode;
  active?: boolean;
  depth?: number;
  search?: Record<string, string>;
  expansionState?: SecondaryNavLinkExpansionState;
  onExpand?: () => void;
  onCollapse?: () => void;
  reserveDisclosureSpace?: boolean;
  density?: 'default' | 'compact';
}) {
  const hasExpansionState = expansionState !== undefined;
  const isExpanded = expansionState === 'expanded';
  const showDisclosureSlot = hasExpansionState || reserveDisclosureSpace;
  const isCompact = density === 'compact';

  return (
    <Flex
      align="center"
      gap="2"
      minH={description ? (isCompact ? '10' : '12') : (isCompact ? '8' : '9')}
      rounded="md"
      px="2.5"
      py={description ? (isCompact ? '1.5' : '2') : undefined}
      ml={`${Math.min(depth, 6) * 0.8}rem`}
      textStyle="sidebar"
      color={active ? 'teal.fg' : 'fg.muted'}
      bg={active ? 'teal.subtle' : 'transparent'}
      _hover={{ bg: active ? 'teal.subtle' : 'bg.muted', color: active ? 'teal.fg' : 'fg' }}
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
            color={active ? 'teal.fg' : 'fg.subtle'}
            _hover={{ color: active ? 'teal.fg' : 'fg', bg: active ? 'teal.subtle' : 'bg.subtle' }}
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
        <Flex align="center" gap={isCompact ? '2' : '2.5'} minW="0">
          <Flex boxSize="4.5" align="center" justify="center" shrink={0}>
            {icon}
          </Flex>
          <Box minW="0">
            <Text truncate fontWeight={active ? 'semibold' : 'medium'}>{label}</Text>
            {description ? (
              <Text truncate textStyle="caption" color={active ? 'teal.fg' : 'fg.subtle'}>
                {description}
              </Text>
            ) : null}
          </Box>
        </Flex>
      </Link>
    </Flex>
  );
}

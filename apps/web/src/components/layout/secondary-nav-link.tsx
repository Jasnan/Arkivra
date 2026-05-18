import type { ComponentType } from 'react';
import { Box, Flex, Text, chakra } from '@chakra-ui/react';
import { Link } from '@tanstack/react-router';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type { LucideProps } from 'lucide-react';

export type SecondaryNavLinkExpansionState = 'expanded' | 'collapsed';
export type SecondaryNavIcon = ComponentType<LucideProps>;
export const SECONDARY_NAV_COMPACT_TWO_LINE_HEIGHT = '3.125rem';
type SecondaryNavDensity = 'default' | 'compact';

function SecondaryNavIconSlot({
  icon: Icon,
  active,
  density,
}: {
  icon: SecondaryNavIcon;
  active?: boolean;
  density: SecondaryNavDensity;
}) {
  return (
    <Flex
      aria-hidden="true"
      boxSize={density === 'compact' ? '5.5' : '6'}
      align="center"
      justify="center"
      shrink={0}
      color="currentColor"
      opacity={active ? 1 : 0.92}
    >
      <Icon size={20} strokeWidth={2.1} />
    </Flex>
  );
}

function SecondaryNavBody({
  label,
  description,
  icon,
  active,
  density,
  iconOnly = false,
}: {
  label: string;
  description?: string;
  icon: SecondaryNavIcon;
  active?: boolean;
  density: SecondaryNavDensity;
  iconOnly?: boolean;
}) {
  const isCompact = density === 'compact';

  if (iconOnly) {
    return (
      <Flex align="center" justify="center" minW="0" w="full">
        <SecondaryNavIconSlot icon={icon} active={active} density={density} />
      </Flex>
    );
  }

  return (
    <Flex align="center" gap={isCompact ? '2' : '2.5'} minW="0">
      <SecondaryNavIconSlot icon={icon} active={active} density={density} />
      <Box minW="0" pt={description ? '0.5px' : undefined}>
        <Text truncate fontWeight={active ? 'semibold' : 'medium'} lineHeight="1.25">{label}</Text>
        {description ? (
          <Text truncate mt="1" textStyle="caption" lineHeight="1.2" color={active ? 'teal.fg' : 'fg.subtle'}>
            {description}
          </Text>
        ) : null}
      </Box>
    </Flex>
  );
}

function secondaryNavItemStyles({
  active,
  density,
  description,
  showDisclosureSlot = false,
  iconOnly = false,
}: {
  active?: boolean;
  density: SecondaryNavDensity;
  description?: string;
  showDisclosureSlot?: boolean;
  iconOnly?: boolean;
}) {
  const isCompact = density === 'compact';
  const usesTwoLineHeight = Boolean(description) || iconOnly;

  return {
    alignItems: 'center',
    bg: active ? 'teal.subtle' : 'transparent',
    color: active ? 'teal.fg' : 'fg.muted',
    display: 'flex',
    gap: showDisclosureSlot ? '2' : '0',
    minHeight: usesTwoLineHeight ? (isCompact ? SECONDARY_NAV_COMPACT_TWO_LINE_HEIGHT : '3.375rem') : (isCompact ? '2.375rem' : '2.625rem'),
    paddingInline: isCompact ? '0.875rem' : '0.75rem',
    paddingBlock: usesTwoLineHeight ? (isCompact ? '0.5rem' : '0.625rem') : undefined,
    textStyle: 'sidebar',
    borderRadius: 'var(--chakra-radii-md)',
    transition: 'background-color 120ms ease, color 120ms ease',
  } as const;
}

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
  iconOnly = false,
}: {
  to: string;
  label: string;
  description?: string;
  icon: SecondaryNavIcon;
  active?: boolean;
  depth?: number;
  search?: Record<string, string>;
  expansionState?: SecondaryNavLinkExpansionState;
  onExpand?: () => void;
  onCollapse?: () => void;
  reserveDisclosureSpace?: boolean;
  density?: SecondaryNavDensity;
  iconOnly?: boolean;
}) {
  const hasExpansionState = expansionState !== undefined;
  const isExpanded = expansionState === 'expanded';
  const showDisclosureSlot = hasExpansionState || reserveDisclosureSpace;

  return (
    <Flex
      {...secondaryNavItemStyles({ active, density, description, showDisclosureSlot, iconOnly })}
      ml={`${Math.min(depth, 6) * 0.8}rem`}
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
        aria-label={iconOnly ? label : undefined}
        aria-current={active ? 'page' : undefined}
      >
        <SecondaryNavBody label={label} description={description} icon={icon} active={active} density={density} iconOnly={iconOnly} />
      </Link>
    </Flex>
  );
}

export function SecondaryNavButton({
  label,
  description,
  icon,
  active,
  density = 'compact',
  iconOnly = false,
  onClick,
}: {
  label: string;
  description?: string;
  icon: SecondaryNavIcon;
  active?: boolean;
  density?: SecondaryNavDensity;
  iconOnly?: boolean;
  onClick: () => void;
}) {
  return (
    <chakra.button
      type="button"
      aria-current={active ? 'page' : undefined}
      {...secondaryNavItemStyles({ active, density, description, iconOnly })}
      width="full"
      textAlign="left"
      cursor="pointer"
      _hover={{ bg: active ? 'teal.subtle' : 'bg.muted', color: active ? 'teal.fg' : 'fg' }}
      _focusVisible={{ outline: '2px solid', outlineColor: 'teal.focusRing', outlineOffset: '2px' }}
      onClick={onClick}
    >
      <SecondaryNavBody label={label} description={description} icon={icon} active={active} density={density} iconOnly={iconOnly} />
    </chakra.button>
  );
}

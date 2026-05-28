import { chakra } from '@chakra-ui/react';

const trailingPseudoRegex = /(::?[\w-]+(?:\([^)]*\))?)+$/;
const excludedClassName = '.not-prose';

function inWhere<T extends string>(selector: T): T {
  const rebuiltSelector = selector.startsWith('& ')
    ? selector.slice(2)
    : selector;
  const match = selector.match(trailingPseudoRegex);
  const pseudo = match ? match[0] : '';
  const base = match ? selector.slice(0, -match[0].length) : rebuiltSelector;

  return `& :where(${base}):not(${excludedClassName}, ${excludedClassName} *)${pseudo}` as T;
}

export const Prose = chakra('div', {
  base: {
    color: 'fg',
    maxWidth: '65ch',
    fontFamily: 'document',
    fontSize: 'sm',
    lineHeight: 'var(--arkivra-line-height-body)',
    overflowWrap: 'anywhere',
    [inWhere('& p')]: {
      marginTop: '1em',
      marginBottom: '1em',
    },
    [inWhere('& blockquote')]: {
      marginTop: '1.25em',
      marginBottom: '1.25em',
      paddingInline: '1.25em',
      paddingBlock: '0.8em',
      borderInlineStartWidth: '0.25em',
      borderColor: 'teal.solid',
      backgroundColor: 'bg.subtle',
      color: 'fg.muted',
      fontStyle: 'italic',
    },
    [inWhere('& a')]: {
      color: 'teal.fg',
      textDecoration: 'underline',
      textUnderlineOffset: '3px',
      fontWeight: '500',
    },
    [inWhere('& strong')]: {
      fontWeight: '600',
    },
    [inWhere('& em')]: {
      fontStyle: 'italic',
    },
    [inWhere('& h1')]: {
      fontSize: '2xl',
      marginTop: '0',
      marginBottom: '0.8em',
      lineHeight: 'var(--arkivra-line-height-heading)',
    },
    [inWhere('& h2')]: {
      fontSize: 'xl',
      marginTop: '1.6em',
      marginBottom: '0.8em',
      lineHeight: 'var(--arkivra-line-height-heading)',
    },
    [inWhere('& h3')]: {
      fontSize: 'lg',
      marginTop: '1.5em',
      marginBottom: '0.45em',
      lineHeight: 'var(--arkivra-line-height-heading)',
    },
    [inWhere('& h4')]: {
      fontSize: 'md',
      marginTop: '1.4em',
      marginBottom: '0.5em',
      lineHeight: 'var(--arkivra-line-height-heading)',
    },
    [inWhere('& h5')]: {
      fontSize: 'sm',
      marginTop: '1.25em',
      marginBottom: '0.5em',
      lineHeight: 'var(--arkivra-line-height-heading)',
    },
    [inWhere('& h6')]: {
      fontSize: 'xs',
      marginTop: '1.25em',
      marginBottom: '0.5em',
      color: 'fg.muted',
      lineHeight: 'var(--arkivra-line-height-heading)',
    },
    [inWhere('& h1, h2, h3, h4, h5, h6')]: {
      color: 'fg',
      fontFamily: 'document',
      fontWeight: '600',
    },
    [inWhere('& :is(h1,h2,h3,h4,h5,h6,hr) + *')]: {
      marginTop: '0',
    },
    [inWhere('& hr')]: {
      marginTop: '2em',
      marginBottom: '2em',
      borderColor: 'border.surface',
    },
    [inWhere('& ol')]: {
      marginTop: '1em',
      marginBottom: '1em',
      paddingInlineStart: '1.5em',
    },
    [inWhere('& ul')]: {
      marginTop: '1em',
      marginBottom: '1em',
      paddingInlineStart: '1.5em',
    },
    [inWhere('& li')]: {
      marginTop: '0.3em',
      marginBottom: '0.3em',
    },
    [inWhere('& ol > li')]: {
      paddingInlineStart: '0.4em',
      listStyleType: 'decimal',
    },
    [inWhere('& ul > li')]: {
      paddingInlineStart: '0.4em',
      listStyleType: 'disc',
    },
    [inWhere('& > ul > li p')]: {
      marginTop: '0.5em',
      marginBottom: '0.5em',
    },
    [inWhere('& > ol > li p')]: {
      marginTop: '0.5em',
      marginBottom: '0.5em',
    },
    [inWhere('& > ul > li > p:first-of-type')]: {
      marginTop: '0',
    },
    [inWhere('& > ol > li > p:first-of-type')]: {
      marginTop: '0',
    },
    [inWhere('& > ul > li > p:last-of-type')]: {
      marginBottom: '0',
    },
    [inWhere('& > ol > li > p:last-of-type')]: {
      marginBottom: '0',
    },
    [inWhere('& ul ul')]: {
      marginTop: '0.5em',
      marginBottom: '0.5em',
    },
    [inWhere('& ul ol')]: {
      marginTop: '0.5em',
      marginBottom: '0.5em',
    },
    [inWhere('& ol ul')]: {
      marginTop: '0.5em',
      marginBottom: '0.5em',
    },
    [inWhere('& ol ol')]: {
      marginTop: '0.5em',
      marginBottom: '0.5em',
    },
    [inWhere('& code')]: {
      borderRadius: 'sm',
      backgroundColor: 'bg.subtle',
      paddingInline: '0.25em',
      paddingBlock: '0.1em',
      fontFamily: 'mono',
      fontSize: '0.92em',
      color: 'fg',
    },
    [inWhere('& pre')]: {
      marginTop: '1.5em',
      marginBottom: '1.5em',
      maxWidth: 'full',
      overflowX: 'auto',
      borderRadius: 'md',
      borderWidth: '1px',
      borderColor: 'border.surface',
      backgroundColor: 'bg.subtle',
      padding: '1rem',
      fontFamily: 'mono',
      fontSize: 'sm',
      lineHeight: '1.55',
      color: 'fg',
    },
    [inWhere('& pre code')]: {
      borderWidth: '0',
      backgroundColor: 'transparent',
      padding: '0',
      fontSize: 'inherit',
    },
    [inWhere('& table')]: {
      width: '100%',
      minWidth: 'max-content',
      borderCollapse: 'collapse',
      fontSize: 'sm',
      lineHeight: '1.5',
    },
    [inWhere('& th')]: {
      borderWidth: '1px',
      borderColor: 'border.surface',
      backgroundColor: 'bg.subtle',
      paddingInline: '0.75rem',
      paddingBlock: '0.5rem',
      textAlign: 'start',
      fontWeight: '600',
      color: 'fg',
    },
    [inWhere('& td')]: {
      borderWidth: '1px',
      borderColor: 'border.surface',
      paddingInline: '0.75rem',
      paddingBlock: '0.5rem',
      color: 'fg',
    },
  },
});

import type { HTMLChakraProps } from '@chakra-ui/react';
import { chakra } from '@chakra-ui/react';

const strokeProps = {
  stroke: 'currentColor',
  strokeWidth: 12,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  fill: 'none',
} as const;

export function ArkivraLogo({ title, ...props }: HTMLChakraProps<'svg'> & { title?: string }) {
  return (
    <chakra.svg
      viewBox="0 0 256 256"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
      focusable="false"
      {...props}
    >
      {title ? <title>{title}</title> : null}
      <rect x="36" y="28" width="184" height="184" rx="18" {...strokeProps} />
      <rect x="24" y="72" width="20" height="36" rx="6" fill="currentColor" />
      <rect x="24" y="148" width="20" height="36" rx="6" fill="currentColor" />
      <path d="M128 82V112" {...strokeProps} />
      <path d="M84 112H172" {...strokeProps} />
      <path d="M84 112V142" {...strokeProps} />
      <path d="M172 112V142" {...strokeProps} />
      <path
        d="M110 54H138L154 70V102C154 106 151 109 147 109H110C106 109 103 106 103 102V61C103 57 106 54 110 54Z"
        {...strokeProps}
      />
      <path d="M138 54V70H154" {...strokeProps} />
      <path d="M116 80H140" {...strokeProps} />
      <path d="M116 92H136" {...strokeProps} />
      <path
        d="M66 142H94L110 158V190C110 194 107 197 103 197H66C62 197 59 194 59 190V149C59 145 62 142 66 142Z"
        {...strokeProps}
      />
      <path d="M94 142V158H110" {...strokeProps} />
      <path d="M72 168H96" {...strokeProps} />
      <path d="M72 180H92" {...strokeProps} />
      <path
        d="M154 142H182L198 158V190C198 194 195 197 191 197H154C150 197 147 194 147 190V149C147 145 150 142 154 142Z"
        {...strokeProps}
      />
      <path d="M182 142V158H198" {...strokeProps} />
      <path d="M160 168H184" {...strokeProps} />
      <path d="M160 180H180" {...strokeProps} />
    </chakra.svg>
  );
}

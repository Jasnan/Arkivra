import type { ThemeProviderProps } from 'next-themes';
import type { PropsWithChildren } from 'react';
import { ChakraProvider } from '@chakra-ui/react';
import { ThemeProvider as NextThemesProvider } from 'next-themes';
import { arkivraSystem } from '@/theme/system';

export function ThemeProvider({ children, ...props }: PropsWithChildren<ThemeProviderProps>) {
  return (
    <ChakraProvider value={arkivraSystem}>
      <NextThemesProvider {...props}>{children}</NextThemesProvider>
    </ChakraProvider>
  );
}

import type { ThemeProviderProps } from 'next-themes';
import type { PropsWithChildren } from 'react';
import { ChakraProvider } from '@chakra-ui/react';
import { arkivraSystem } from '@/theme/system';

export function ThemeProvider({ children }: PropsWithChildren<ThemeProviderProps>) {
  return (
    <ChakraProvider value={arkivraSystem}>
      {children}
    </ChakraProvider>
  );
}

import {
  Portal,
  Spinner,
  Stack,
  Toast,
  Toaster as ChakraToaster,
} from '@chakra-ui/react';
import { toaster } from '@/components/ui/toaster-store';

export function Toaster() {
  return (
    <Portal>
      <ChakraToaster toaster={toaster} insetInline={{ mdDown: '4' }}>
        {(item) => (
          <Toast.Root data-size="sm" width={{ md: 'sm' }} px="3" py="2.5" textStyle="sm">
            {item.type === 'loading' ? (
              <Spinner size="sm" color="teal.solid" />
            ) : (
              <Toast.Indicator />
            )}
            <Stack gap="1" flex="1" maxW="100%">
              {item.title ? <Toast.Title>{item.title}</Toast.Title> : null}
              {item.description ? (
                <Toast.Description>{item.description}</Toast.Description>
              ) : null}
            </Stack>
            {item.action ? (
              <Toast.ActionTrigger onClick={item.action.onClick}>
                {item.action.label}
              </Toast.ActionTrigger>
            ) : null}
            {item.closable ? <Toast.CloseTrigger /> : null}
          </Toast.Root>
        )}
      </ChakraToaster>
    </Portal>
  );
}

import type { ReactNode } from 'react';
import { Text } from '@chakra-ui/react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { SettingsPageFrame } from '@/features/settings/components/settings-ui';

export function AdminAccessBoundary({
  accessTitle,
  actions,
  children,
  description,
  isEnabled,
  isLoading,
  title,
}: {
  title?: ReactNode;
  accessTitle?: string;
  actions?: ReactNode;
  description?: ReactNode;
  isEnabled: boolean;
  isLoading: boolean;
  children: ReactNode;
}) {
  if (isLoading) {
    return <Text textStyle="sm">Loading admin context...</Text>;
  }

  if (!isEnabled) {
    return (
      <SettingsPageFrame title={title ?? accessTitle} description="Admin access is required to open this page." density="compact">
        <Alert variant="destructive">
          <AlertDescription>
            Admin access is required to open this page.
          </AlertDescription>
        </Alert>
      </SettingsPageFrame>
    );
  }

  return (
    <SettingsPageFrame title={title} description={description} actions={actions} density="compact">
      {children}
    </SettingsPageFrame>
  );
}

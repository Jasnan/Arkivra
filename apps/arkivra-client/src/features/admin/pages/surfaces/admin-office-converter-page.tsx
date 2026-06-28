import { useState } from 'react';
import type { ReactNode } from 'react';
import { Box, Flex, HStack, SimpleGrid, Stack, Text } from '@chakra-ui/react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Clock,
  FileText,
  Globe2,
  Info,
  RefreshCw,
  Search,
  Shield,
  TriangleAlert,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { toast } from '@/components/ui/toaster-store';
import {
  scheduleMissingOfficePreviews,
  updateAdminOfficeConverterSettings,
} from '@/features/admin/admin.api';
import { adminQueryKeys, useAdminOfficeConverterStatusQuery } from '@/features/admin/admin.queries';
import type { AdminOfficeConverterStatus } from '@/features/admin/admin.types';
import { useMeQuery } from '@/features/me/me.queries';
import { AdminAccessBoundary } from './admin-shared';

export function AdminOfficeConverterPage() {
  const queryClient = useQueryClient();
  const meQuery = useMeQuery();
  const isEnabled = meQuery.data?.isAdmin === true;
  const officeConverterStatusQuery = useAdminOfficeConverterStatusQuery({ enabled: isEnabled });
  const [isGeneratePreviewsDialogOpen, setIsGeneratePreviewsDialogOpen] = useState(false);

  const updateOfficeConversionMutation = useMutation({
    mutationFn: updateAdminOfficeConverterSettings,
    onSuccess: async ({ settings }) => {
      toast.success(settings.enabled ? 'Office conversion enabled.' : 'Office conversion disabled.');
      await queryClient.invalidateQueries({ queryKey: adminQueryKeys.officeConverterStatus() });
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : 'Could not update Office conversion settings.',
      );
    },
  });

  const generateMissingOfficePreviewsMutation = useMutation({
    mutationFn: scheduleMissingOfficePreviews,
    onSuccess: async () => {
      setIsGeneratePreviewsDialogOpen(false);
      toast.success('Preview generation has been scheduled.', {
        description: 'Arkivra will continue processing in the background.',
      });
      await queryClient.invalidateQueries({ queryKey: adminQueryKeys.officeConverterStatus() });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Could not schedule preview generation.');
    },
  });

  return (
    <AdminAccessBoundary
      title={
        <HStack gap="3" align="center">
          <DocumentConversionIcon size="lg" />
          <Text as="span">Office Document Conversion</Text>
        </HStack>
      }
      description="Convert Office and OpenDocument files to PDF for in-browser previews, citations, and AI processing."
      isEnabled={isEnabled}
      isLoading={meQuery.isLoading}
    >
      {officeConverterStatusQuery.isLoading ? (
        <Card p={{ base: '4', lg: '5' }} shadow="xs">
          <Text textStyle="sm" color="fg.muted">
            Loading converter status...
          </Text>
        </Card>
      ) : officeConverterStatusQuery.isError ? (
        <Card p={{ base: '4', lg: '5' }} shadow="xs">
          <HStack align="start" gap="2" color="orange.fg">
            <TriangleAlert size={16} />
            <Text textStyle="sm">Could not load Office document conversion status.</Text>
          </HStack>
        </Card>
      ) : officeConverterStatusQuery.data?.officeConverter.supported ? (
        <OfficeDocumentConversionSection
          status={officeConverterStatusQuery.data.officeConverter}
          isSaving={updateOfficeConversionMutation.isPending}
          isScheduling={generateMissingOfficePreviewsMutation.isPending}
          onToggleEnabled={(enabled) => updateOfficeConversionMutation.mutate({ enabled })}
          onGenerateMissingPreviews={() => setIsGeneratePreviewsDialogOpen(true)}
        />
      ) : (
        <Card p={{ base: '4', lg: '5' }} shadow="xs">
          <Text textStyle="sm" color="fg.muted">
            This Arkivra build does not include Office document conversion support.
          </Text>
        </Card>
      )}

      <GenerateOfficePreviewsDialog
        open={isGeneratePreviewsDialogOpen}
        isScheduling={generateMissingOfficePreviewsMutation.isPending}
        onConfirm={() => generateMissingOfficePreviewsMutation.mutate()}
        onOpenChange={setIsGeneratePreviewsDialogOpen}
      />
    </AdminAccessBoundary>
  );
}

function OfficeDocumentConversionSection({
  isSaving,
  isScheduling,
  status,
  onToggleEnabled,
  onGenerateMissingPreviews,
}: {
  status: AdminOfficeConverterStatus;
  isSaving: boolean;
  isScheduling: boolean;
  onToggleEnabled: (enabled: boolean) => void;
  onGenerateMissingPreviews: () => void;
}) {
  const health = getOfficeConverterHealth(status);
  const providerLabel = formatConverterProvider(status.provider);
  const canGenerateMissingPreviews = status.enabled && status.configured && status.healthy;

  return (
    <Card p={{ base: '4', lg: '5' }} shadow="xs">
      <Stack gap="5">
        <HStack gap="4" justify="space-between" align="start">
          <Stack gap="1" minW="0">
            <Text fontSize="md" fontWeight="semibold" color="fg">
              Enable Office Document Conversion
            </Text>
            <Text textStyle="sm" color="fg.muted">
              When enabled, supported documents are converted to PDF for previews and citations.
            </Text>
          </Stack>
          <HStack gap="3" flexShrink={0}>
            <Switch
              aria-label="Enable Office Document Conversion"
              checked={status.enabled}
              colorPalette="blue"
              disabled={isSaving}
              onCheckedChange={onToggleEnabled}
            />
            <Text
              minW="4.75rem"
              textStyle="sm"
              fontWeight="semibold"
              color={status.enabled ? 'green.fg' : 'fg.muted'}
            >
              {status.enabled ? 'Enabled' : 'Disabled'}
            </Text>
          </HStack>
        </HStack>

        <SimpleGrid columns={{ base: 1, xl: 2 }} gap="4">
          <Stack
            gap="5"
            rounded="md"
            borderWidth="1px"
            borderColor="border.surface"
            bg="bg.surface"
            p={{ base: '4', md: '5' }}
          >
            <Stack gap="3">
              <HStack gap="3" align="center" flexWrap="wrap">
                <Text fontSize="md" fontWeight="semibold" color="fg">
                  Connection & Status
                </Text>
                <Badge colorPalette={health.palette} variant="subtle">
                  {health.label}
                </Badge>
              </HStack>
              <Text textStyle="sm" color="fg.muted">
                {health.description}
              </Text>
              <Text textStyle="sm" color="fg.muted">
                {status.enabled
                  ? 'New uploads will receive PDF previews when the service is healthy.'
                  : 'New uploads will skip PDF preview generation.'}
              </Text>
            </Stack>

            {status.error ? (
              <HStack
                align="start"
                gap="2"
                rounded="md"
                borderWidth="1px"
                borderColor="orange.muted"
                bg="orange.subtle"
                color="orange.fg"
                p="3"
              >
                <TriangleAlert size={16} />
                <Text textStyle="sm">{status.error}</Text>
              </HStack>
            ) : null}

            <Box h="1px" bg="border.surface" />

            <SimpleGrid columns={{ base: 1, sm: 2 }} gap="4">
              <StatusMetric icon={<Globe2 size={18} />} label="Service" value={providerLabel} />
              <StatusMetric
                icon={<Clock size={18} />}
                label="Last checked"
                value={formatOfficeConverterDate(status.lastHealthCheck)}
              />
            </SimpleGrid>

            <Box h="1px" bg="border.surface" />

            <Stack gap="3">
              <Text textStyle="sm" color="fg.muted">
                Supported formats
              </Text>
              <HStack gap="2" flexWrap="wrap">
                {status.supportedFormats.map(format => (
                  <Badge key={format} variant="outline" colorPalette="gray" px="3" py="1">
                    {format}
                  </Badge>
                ))}
              </HStack>
            </Stack>
          </Stack>

          <Stack
            gap="4"
            rounded="md"
            borderWidth="1px"
            borderColor="border.surface"
            bg="bg.surface"
            p={{ base: '4', md: '5' }}
          >
            <HStack gap="3" align="center">
              <Flex
                boxSize="8"
                rounded="md"
                bg="blue.subtle"
                color="blue.solid"
                align="center"
                justify="center"
              >
                <RefreshCw size={18} />
              </Flex>
              <Text fontSize="md" fontWeight="semibold" color="fg">
                Existing Documents
              </Text>
            </HStack>
            <Text textStyle="sm" color="fg.muted">
              Generate PDF previews for Office and OpenDocument files that were indexed before the
              converter was available.
            </Text>

            <MaintenanceNote icon={<FileText size={18} />}>
              Generated previews replace parser output for those document versions.
            </MaintenanceNote>
            <MaintenanceNote icon={<Search size={18} />}>
              Search indexes are rebuilt when AI indexing is enabled.
            </MaintenanceNote>

            <Box>
              <Button
                type="button"
                disabled={!canGenerateMissingPreviews || isScheduling}
                onClick={onGenerateMissingPreviews}
              >
                <RefreshCw size={16} />
                {isScheduling ? 'Scheduling...' : 'Generate Missing Previews'}
              </Button>
            </Box>
          </Stack>
        </SimpleGrid>

        <HStack
          align="start"
          gap="3"
          rounded="md"
          bg="blue.subtle"
          color="blue.fg"
          px={{ base: '3', md: '4' }}
          py="3"
        >
          <Info size={18} />
          <Text textStyle="sm">
            Disabling the converter stops generating new PDF previews for future uploads. Existing
            previews remain available.
          </Text>
        </HStack>
      </Stack>
    </Card>
  );
}

function DocumentConversionIcon({ size = 'md' }: { size?: 'md' | 'lg' }) {
  return (
    <Flex
      boxSize={size === 'lg' ? '12' : '9'}
      rounded="md"
      bg="blue.subtle"
      color="blue.solid"
      align="center"
      justify="center"
      flexShrink={0}
      aria-hidden="true"
    >
      <FileText size={size === 'lg' ? 26 : 18} />
    </Flex>
  );
}

function StatusMetric({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <HStack gap="3" align="center" minW="0">
      <Flex boxSize="9" rounded="md" bg="bg.subtle" align="center" justify="center" flexShrink={0}>
        {icon}
      </Flex>
      <Stack gap="0" minW="0">
        <Text textStyle="xs" color="fg.muted">
          {label}
        </Text>
        <Text textStyle="sm" fontWeight="semibold" color="fg" wordBreak="break-word">
          {value}
        </Text>
      </Stack>
    </HStack>
  );
}

function MaintenanceNote({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <HStack
      align="center"
      gap="3"
      rounded="md"
      borderWidth="1px"
      borderColor="border.surface"
      px="3"
      py="3"
    >
      <Flex boxSize="9" rounded="md" bg="bg.subtle" color="blue.solid" align="center" justify="center">
        {icon}
      </Flex>
      <Text textStyle="sm" color="fg.muted">
        {children}
      </Text>
    </HStack>
  );
}

function getOfficeConverterHealth(status: AdminOfficeConverterStatus) {
  if (!status.configured) {
    return {
      label: 'Not configured',
      palette: 'gray' as const,
      description: 'No converter service is configured.',
    };
  }

  if (status.healthy) {
    return {
      label: 'Healthy',
      palette: 'green' as const,
      description: status.enabled
        ? 'The converter service is connected and ready.'
        : 'The converter service is connected. Conversion is disabled.',
    };
  }

  return {
    label: 'Unavailable',
    palette: 'orange' as const,
    description: 'The converter service is configured but cannot be reached.',
  };
}

function formatOfficeConverterDate(value: string | null) {
  if (value === null) return 'Not checked';

  return new Date(value).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function formatConverterProvider(provider: string | null) {
  if (provider === null) return 'Not configured';
  if (provider === 'gotenberg') return 'Gotenberg';
  return provider;
}

function GenerateOfficePreviewsDialog({
  isScheduling,
  open,
  onConfirm,
  onOpenChange,
}: {
  open: boolean;
  isScheduling: boolean;
  onConfirm: () => void;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent maxW="38rem" w="calc(100vw - 2rem)" p="0">
        <DialogHeader px={{ base: '5', md: '6' }} pt={{ base: '5', md: '6' }} pb="0">
          <HStack align="start" gap="4" pr="8">
            <Flex
              boxSize="12"
              rounded="full"
              bg="blue.subtle"
              color="blue.solid"
              align="center"
              justify="center"
              flexShrink={0}
              aria-hidden="true"
            >
              <RefreshCw size={26} />
            </Flex>
            <Stack gap="2" minW="0">
              <DialogTitle fontSize={{ base: 'xl', md: '2xl' }} lineHeight="1.2">
                Generate Missing Office Previews?
              </DialogTitle>
              <DialogDescription fontSize="sm" lineHeight="1.55" maxW="30rem">
                Arkivra will create PDF previews for eligible Office and OpenDocument versions that
                don&apos;t have one.
              </DialogDescription>
            </Stack>
          </HStack>
        </DialogHeader>
        <DialogBody px={{ base: '5', md: '6' }} py="5">
          <Stack
            gap="0"
            rounded="md"
            bg="blue.subtle"
            px="4"
            py="1"
          >
            <PreviewGenerationDetail
              icon={<FileText size={22} />}
              title="What will happen"
              description="PDF previews will be generated in the background for eligible versions."
            />
            <Box h="1px" bg="border.surface" />
            <PreviewGenerationDetail
              icon={<Shield size={24} />}
              title="Original files stay unchanged"
              description="Versions that already have previews are skipped."
            />
            <Box h="1px" bg="border.surface" />
            <PreviewGenerationDetail
              icon={<Search size={24} />}
              title="Index updates"
              description="Search indexes will be rebuilt if AI indexing is enabled."
            />
          </Stack>
        </DialogBody>
        <DialogFooter
          borderTopWidth="1px"
          borderColor="border.surface"
          px={{ base: '5', md: '6' }}
          py="4"
        >
          <Button
            type="button"
            variant="outline"
            disabled={isScheduling}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            colorPalette="blue"
            disabled={isScheduling}
            onClick={onConfirm}
          >
            {isScheduling ? 'Scheduling...' : 'Generate'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PreviewGenerationDetail({
  icon,
  title,
  description,
}: {
  icon: ReactNode;
  title: string;
  description: string;
}) {
  return (
    <HStack align="start" gap="3" py="3">
      <Flex boxSize="8" color="blue.solid" align="center" justify="center" flexShrink={0}>
        {icon}
      </Flex>
      <Stack gap="1" minW="0">
        <Text textStyle="sm" fontWeight="semibold" color="fg">
          {title}
        </Text>
        <Text textStyle="sm" lineHeight="1.5" color="fg.muted">
          {description}
        </Text>
      </Stack>
    </HStack>
  );
}

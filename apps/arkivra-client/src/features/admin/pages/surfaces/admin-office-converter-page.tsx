import { useState } from 'react';
import { Box, Flex, HStack, SimpleGrid, Stack, Text } from '@chakra-ui/react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { FileText, Package, RefreshCw, Settings, TriangleAlert } from 'lucide-react';
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
import { toast } from '@/components/ui/toaster-store';
import { scheduleMissingOfficePreviews } from '@/features/admin/admin.api';
import { adminQueryKeys, useAdminOfficeConverterStatusQuery } from '@/features/admin/admin.queries';
import type { AdminOfficeConverterStatus } from '@/features/admin/admin.types';
import { useMeQuery } from '@/features/me/me.queries';
import { AdminAccessBoundary } from './admin-shared';

export function AdminOfficeConverterPage() {
  const queryClient = useQueryClient();
  const meQuery = useMeQuery();
  const isEnabled = meQuery.data?.isAdmin === true;
  const officeConverterStatusQuery = useAdminOfficeConverterStatusQuery({ enabled: isEnabled });
  const [isConfigDialogOpen, setIsConfigDialogOpen] = useState(false);
  const [isGeneratePreviewsDialogOpen, setIsGeneratePreviewsDialogOpen] = useState(false);

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
      title="Office Document Converter"
      description="Optional platform service for browser previews, citations, and AI processing."
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
            <Text textStyle="sm">Could not load Office Document Converter status.</Text>
          </HStack>
        </Card>
      ) : officeConverterStatusQuery.data?.officeConverter.supported ? (
        <OfficeDocumentConverterSection
          status={officeConverterStatusQuery.data.officeConverter}
          isScheduling={generateMissingOfficePreviewsMutation.isPending}
          onConfigure={() => setIsConfigDialogOpen(true)}
          onGenerateMissingPreviews={() => setIsGeneratePreviewsDialogOpen(true)}
        />
      ) : (
        <Card p={{ base: '4', lg: '5' }} shadow="xs">
          <Text textStyle="sm" color="fg.muted">
            This Arkivra build does not include Office Document Converter support.
          </Text>
        </Card>
      )}

      <OfficeConverterConfigureDialog
        open={isConfigDialogOpen}
        onOpenChange={setIsConfigDialogOpen}
      />

      <GenerateOfficePreviewsDialog
        open={isGeneratePreviewsDialogOpen}
        isScheduling={generateMissingOfficePreviewsMutation.isPending}
        onConfirm={() => generateMissingOfficePreviewsMutation.mutate()}
        onOpenChange={setIsGeneratePreviewsDialogOpen}
      />
    </AdminAccessBoundary>
  );
}

function getOfficeConverterState(status: AdminOfficeConverterStatus) {
  if (!status.configured) {
    return {
      label: 'Not configured',
      tone: 'inactive' as const,
      description: 'No Office Converter has been configured.',
      detail:
        'Office and OpenDocument files continue to work normally but cannot be previewed in the browser. Existing generated previews remain available.',
    };
  }

  if (status.healthy) {
    return {
      label: 'Healthy',
      tone: 'enabled' as const,
      description: 'Office document previews are available.',
      detail: 'New Office and OpenDocument uploads can receive browser previews and PDF-based citations.',
    };
  }

  return {
    label: 'Unavailable',
    tone: 'warning' as const,
    description: 'Configuration exists but the service cannot be reached.',
    detail:
      'Previously generated previews continue working. New Office uploads will not receive preview PDFs until the service becomes available.',
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

function OfficeDocumentConverterSection({
  isScheduling,
  status,
  onConfigure,
  onGenerateMissingPreviews,
}: {
  status: AdminOfficeConverterStatus;
  isScheduling: boolean;
  onConfigure: () => void;
  onGenerateMissingPreviews: () => void;
}) {
  const state = getOfficeConverterState(status);
  const providerLabel = formatConverterProvider(status.provider);

  return (
    <Card p={{ base: '4', lg: '5' }} shadow="xs">
      <Stack gap="5">
        <HStack gap="4" justify="space-between" align="start">
          <HStack gap="3" align="center" minW="0">
            <Flex
              boxSize="11"
              rounded="md"
              bg="cyan.subtle"
              color="cyan.solid"
              align="center"
              justify="center"
            >
              <FileText size={22} />
            </Flex>
            <Stack gap="0.5" minW="0">
              <Text fontSize="lg" fontWeight="semibold" color="fg">
                Office Document Converter
              </Text>
              <Text textStyle="sm" color="fg.muted">
                Converts Microsoft Office and OpenDocument files into PDF previews for browser
                viewing, citations, and AI processing.
              </Text>
            </Stack>
          </HStack>
          <Badge colorPalette={getStatusPalette(state.tone)} variant="subtle" flexShrink={0}>
            {state.label}
          </Badge>
        </HStack>

        <SimpleGrid columns={{ base: 1, xl: status.healthy ? 2 : 1 }} gap="4">
          <Stack
            gap="4"
            rounded="md"
            borderWidth="1px"
            borderColor="border.surface"
            bg="bg.surface"
            p="4"
          >
            <Stack gap="2">
              <Text textStyle="sm" fontWeight="semibold" color="fg">
                Status
              </Text>
              <Text textStyle="sm" color="fg">
                {state.description}
              </Text>
              <Text textStyle="sm" color="fg.muted">
                {state.detail}
              </Text>
            </Stack>

            <SimpleGrid columns={{ base: 1, sm: 2 }} gap="3">
              <ModelSummary label="Connected to" model={providerLabel} />
              <ModelSummary
                label="Last health check"
                model={formatOfficeConverterDate(status.lastHealthCheck)}
              />
            </SimpleGrid>

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

            <Stack gap="2">
              <Text textStyle="xs" color="fg.muted">
                Supported formats
              </Text>
              <HStack gap="2" flexWrap="wrap">
                {status.supportedFormats.map(format => (
                  <Badge key={format} variant="outline" colorPalette="gray">
                    {format}
                  </Badge>
                ))}
              </HStack>
            </Stack>

            {!status.configured ? (
              <Box>
                <Button type="button" size="sm" variant="outline" onClick={onConfigure}>
                  <Settings size={14} />
                  Configure
                </Button>
              </Box>
            ) : null}
          </Stack>

          {status.healthy ? (
            <Stack
              gap="4"
              rounded="md"
              borderWidth="1px"
              borderColor="border.surface"
              bg="bg.surface"
              p="4"
              justify="space-between"
            >
              <Stack gap="2">
                <Text textStyle="sm" fontWeight="semibold" color="fg">
                  Generate Missing Previews
                </Text>
                <Text textStyle="sm" color="fg.muted">
                  Generate preview PDFs for previously uploaded Office and OpenDocument files that
                  were indexed before the Office Converter was available.
                </Text>
                <Text textStyle="sm" color="fg.muted">
                  Generated previews will replace the parser output for those document versions and
                  rebuild search indexes when AI indexing is enabled.
                </Text>
              </Stack>
              <Box>
                <Button
                  type="button"
                  size="sm"
                  disabled={isScheduling}
                  onClick={onGenerateMissingPreviews}
                >
                  <RefreshCw size={14} />
                  {isScheduling ? 'Scheduling...' : 'Generate Missing Previews'}
                </Button>
              </Box>
            </Stack>
          ) : null}
        </SimpleGrid>
      </Stack>
    </Card>
  );
}

function ModelSummary({ label, model }: { label: string; model: string }) {
  return (
    <Stack gap="1">
      <Text textStyle="xs" color="fg.muted">
        {label}
      </Text>
      <HStack gap="2" minW="0" flexWrap="wrap">
        <Package size={15} />
        <Text textStyle="sm" fontWeight="semibold" color="fg" wordBreak="break-word">
          {model}
        </Text>
      </HStack>
    </Stack>
  );
}

function OfficeConverterConfigureDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent maxW="lg">
        <DialogHeader>
          <DialogTitle>Configure Office Document Converter</DialogTitle>
          <DialogDescription>
            Enable the Office Document Converter by configuring a Gotenberg base URL for the
            Arkivra API and worker processes.
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <Stack gap="4">
            <Stack gap="2">
              <Text textStyle="sm" color="fg">
                Set this environment variable and restart Arkivra:
              </Text>
              <Box
                rounded="md"
                borderWidth="1px"
                borderColor="border.surface"
                bg="bg.subtle"
                px="3"
                py="2"
                fontFamily="mono"
                fontSize="sm"
              >
                ARKIVRA_GOTENBERG_URL=http://gotenberg:3000
              </Box>
            </Stack>
            <Text textStyle="sm" color="fg.muted">
              If Arkivra runs outside Docker, use the reachable base URL for your Gotenberg
              service, for example http://localhost:3000.
            </Text>
          </Stack>
        </DialogBody>
        <DialogFooter>
          <Button type="button" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
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
      <DialogContent maxW="lg">
        <DialogHeader>
          <DialogTitle>Generate Missing Office Previews?</DialogTitle>
          <DialogDescription>
            Arkivra will process eligible Office and OpenDocument document versions in the
            background.
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <Stack gap="4">
            <Text textStyle="sm" color="fg">
              Arkivra will:
            </Text>
            <Box as="ul" pl="5" color="fg.muted" fontSize="sm">
              <Box as="li">Convert eligible Office and OpenDocument documents to PDF.</Box>
              <Box as="li">Generate browser previews.</Box>
              <Box as="li">Re-parse those document versions from the generated PDFs.</Box>
              <Box as="li">Replace existing parser output for those versions.</Box>
              <Box as="li">Rebuild semantic embeddings when AI indexing is enabled.</Box>
            </Box>
            <Text textStyle="sm" color="fg.muted">
              Original uploaded documents will not be modified. Existing previews are skipped.
            </Text>
          </Stack>
        </DialogBody>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={isScheduling}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button type="button" disabled={isScheduling} onClick={onConfirm}>
            {isScheduling ? 'Scheduling...' : 'Generate'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function getStatusPalette(tone: 'enabled' | 'inactive' | 'warning') {
  if (tone === 'enabled') return 'green';
  if (tone === 'warning') return 'orange';
  return 'gray';
}

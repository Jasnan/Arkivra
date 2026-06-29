import { Box, CloseButton, Flex, Input, Menu as ChakraMenu, Portal, Spinner, Text } from '@chakra-ui/react';
import { ChevronLeft, ChevronRight, Languages, Printer, ZoomIn, ZoomOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { DocumentTranslationLanguage } from '@/features/documents/documents.api';
import {
  TranslationLanguageMenuLabel,
  TranslationResultText,
  getMenuAnchorRect,
  getTranslationLanguageLabel,
  getTranslationSourceLabel,
  pdfPreviewToolbarMinHeight,
} from './pdf-preview-frame.helpers';
import type {
  PdfZoomMode,
  TextSelectionMenuState,
  TranslationPaneState,
  VisualSelectionMenuState,
} from './pdf-preview-frame.helpers';

export function PdfPreviewToolbar({
  canZoomIn,
  canZoomOut,
  getFitButtonStyles,
  hasNextPage,
  hasPreviousPage,
  numPages,
  pageNumber,
  toolbarRef,
  zoomMode,
  zoomPercent,
  onFitModeChange,
  onNextPage,
  onPageInputBlur,
  onPageInputKeyDown,
  onPreviousPage,
  onPrint,
  onZoomIn,
  onZoomOut,
}: {
  canZoomIn: boolean;
  canZoomOut: boolean;
  getFitButtonStyles: (mode: PdfZoomMode) => Record<string, string> | undefined;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  numPages: number | null;
  pageNumber: number;
  toolbarRef: React.RefObject<HTMLDivElement | null>;
  zoomMode: PdfZoomMode;
  zoomPercent: number;
  onFitModeChange: (mode: PdfZoomMode) => void;
  onNextPage: () => void;
  onPageInputBlur: (input: HTMLInputElement) => void;
  onPageInputKeyDown: (event: React.KeyboardEvent<HTMLInputElement>) => void;
  onPreviousPage: () => void;
  onPrint: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
}) {
  return (
    <Flex
      ref={toolbarRef}
      minH={`${pdfPreviewToolbarMinHeight}px`}
      align="center"
      justify="space-between"
      gap="3"
      wrap="wrap"
      borderBottomWidth="1px"
      borderColor="border.surface"
      bg="bg.surface"
      px={{ base: '3', md: '4' }}
      py="2"
    >
      <Flex align="center" gap="1.5" minW="0">
        <Button type="button" size="sm" variant="outline" aria-label="Previous PDF page" disabled={!hasPreviousPage} onClick={onPreviousPage}>
          <ChevronLeft size={16} />
        </Button>
        <Button type="button" size="sm" variant="outline" aria-label="Next PDF page" disabled={!hasNextPage} onClick={onNextPage}>
          <ChevronRight size={16} />
        </Button>
        <Text fontSize="sm" fontWeight="medium" color="fg" whiteSpace="nowrap">
          Page
        </Text>
        <Input
          key={`pdf-page-input-${pageNumber}`}
          aria-label="PDF page number"
          defaultValue={pageNumber}
          inputMode="numeric"
          pattern="[0-9]*"
          size="sm"
          w="14"
          h="9"
          rounded="md"
          textAlign="center"
          disabled={numPages === null}
          onBlur={(event) => onPageInputBlur(event.currentTarget)}
          onKeyDown={onPageInputKeyDown}
        />
        <Text fontSize="sm" fontWeight="medium" color="fg.muted" whiteSpace="nowrap">
          of {numPages ?? '...'}
        </Text>
      </Flex>

      <Flex align="center" gap="2" minW="0">
        <Button type="button" size="sm" variant="outline" aria-label="Zoom out" disabled={!canZoomOut} onClick={onZoomOut}>
          <ZoomOut size={16} />
        </Button>
        <Text minW="3.5rem" textAlign="center" fontSize="sm" fontWeight="medium" color="fg">
          {zoomPercent}%
        </Text>
        <Button type="button" size="sm" variant="outline" aria-label="Zoom in" disabled={!canZoomIn} onClick={onZoomIn}>
          <ZoomIn size={16} />
        </Button>
        <Flex align="center" gap="1" rounded="md" borderWidth="1px" borderColor="border.surface" p="0.5">
          <Button type="button" size="sm" variant="ghost" h="8" px="2.5" aria-pressed={zoomMode === 'fit-page'} onClick={() => onFitModeChange('fit-page')} {...getFitButtonStyles('fit-page')}>
            Fit page
          </Button>
          <Button type="button" size="sm" variant="ghost" h="8" px="2.5" aria-pressed={zoomMode === 'fit-width'} onClick={() => onFitModeChange('fit-width')} {...getFitButtonStyles('fit-width')}>
            Fit width
          </Button>
          <Button type="button" size="sm" variant="ghost" h="8" px="2.5" aria-pressed={zoomMode === 'actual'} onClick={() => onFitModeChange('actual')} {...getFitButtonStyles('actual')}>
            100%
          </Button>
        </Flex>
      </Flex>

      <Flex align="center" gap="2">
        <Button type="button" size="sm" variant="outline" onClick={onPrint}>
          <Printer size={16} />
          Print
        </Button>
      </Flex>
    </Flex>
  );
}

export function PdfTranslationPane({
  translationPane,
  onCancel,
  onClose,
}: {
  translationPane: TranslationPaneState;
  onCancel: () => void;
  onClose: () => void;
}) {
  return (
    <Box flex={{ base: '0 0 auto', xl: '0 0 22rem' }} h={{ base: '24rem', xl: 'full' }} minH="0" overflow="hidden" rounded="lg" borderWidth="1px" borderColor="border.surface" bg="bg.surface">
      <Flex h="14" align="center" justify="space-between" gap="3" borderBottomWidth="1px" borderColor="border.surface" px="4">
        <Box minW="0">
          <Text fontSize="sm" fontWeight="semibold" color="fg" truncate>
            {getTranslationSourceLabel(translationPane.sourceType)} translation
          </Text>
          <Text fontSize="xs" color="fg.muted" truncate>
            Page {translationPane.pageNumber} to {getTranslationLanguageLabel(translationPane.targetLanguage)}
          </Text>
        </Box>
        <CloseButton size="sm" aria-label="Close translation pane" onClick={onClose} />
      </Flex>
      <Box h="calc(100% - 3.5rem)" overflow="auto" px="4" py="4">
        {translationPane.status === 'loading' ? (
          <Flex minH="40" align="center" justify="center" direction="column" gap="3" textAlign="center">
            <Spinner size="sm" color="teal.solid" />
            <Text fontSize="sm" color="fg.muted">
              Translating {getTranslationSourceLabel(translationPane.sourceType).toLowerCase()}...
            </Text>
            <Button type="button" size="sm" variant="outline" onClick={onCancel}>
              Cancel
            </Button>
          </Flex>
        ) : translationPane.status === 'error' ? (
          <Text fontSize="sm" color="fg.error" whiteSpace="pre-wrap">
            {translationPane.error ?? 'Translation failed.'}
          </Text>
        ) : (
          <Box fontSize="sm" color="fg">
            <TranslationResultText text={translationPane.text} />
            {translationPane.provider !== null ? (
              <Text mt="4" fontSize="xs" color="fg.muted">
                {translationPane.provider} - {translationPane.model}
              </Text>
            ) : null}
          </Box>
        )}
      </Box>
    </Box>
  );
}

export function PdfTranslationMenus({
  availableTranslationLanguages,
  isTranslationPending,
  pageContextMenu,
  textSelectionMenu,
  translationsDisabled,
  visualSelectionMenu,
  onPageMenuOpenChange,
  onTextMenuOpenChange,
  onTranslatePage,
  onTranslateTextSelection,
  onTranslateVisualSelection,
  onVisualMenuOpenChange,
}: {
  availableTranslationLanguages: Array<{ value: DocumentTranslationLanguage; label: string; flag: string }>;
  isTranslationPending: boolean;
  pageContextMenu: { open: boolean; point: { x: number; y: number } } | null;
  textSelectionMenu: TextSelectionMenuState | null;
  translationsDisabled: boolean;
  visualSelectionMenu: VisualSelectionMenuState | null;
  onPageMenuOpenChange: (open: boolean) => void;
  onTextMenuOpenChange: (open: boolean) => void;
  onTranslatePage: (language: DocumentTranslationLanguage) => void;
  onTranslateTextSelection: (language: DocumentTranslationLanguage, menu: TextSelectionMenuState) => void;
  onTranslateVisualSelection: (language: DocumentTranslationLanguage, menu: VisualSelectionMenuState) => void;
  onVisualMenuOpenChange: (open: boolean) => void;
}) {
  return (
    <>
      <TranslationMenu
        open={!translationsDisabled && (pageContextMenu?.open ?? false)}
        point={pageContextMenu?.point}
        label="Translate Page"
        disabled={isTranslationPending}
        itemValuePrefix="translate-page"
        languages={availableTranslationLanguages}
        onOpenChange={onPageMenuOpenChange}
        onSelect={(language) => onTranslatePage(language)}
      />
      <TranslationMenu
        open={!translationsDisabled && (textSelectionMenu?.open ?? false)}
        point={textSelectionMenu?.point}
        label="Translate Selection"
        disabled={isTranslationPending || textSelectionMenu === null}
        itemValuePrefix="translate-text"
        languages={availableTranslationLanguages}
        onOpenChange={onTextMenuOpenChange}
        onSelect={(language) => {
          if (textSelectionMenu !== null) {
            onTranslateTextSelection(language, textSelectionMenu);
          }
        }}
      />
      <TranslationMenu
        open={!translationsDisabled && (visualSelectionMenu?.open ?? false)}
        point={visualSelectionMenu?.point}
        label="Translate Selection"
        disabled={isTranslationPending || visualSelectionMenu === null}
        itemValuePrefix="translate-area"
        languages={availableTranslationLanguages}
        onOpenChange={onVisualMenuOpenChange}
        onSelect={(language) => {
          if (visualSelectionMenu !== null) {
            onTranslateVisualSelection(language, visualSelectionMenu);
          }
        }}
      />
    </>
  );
}

function TranslationMenu({
  disabled,
  itemValuePrefix,
  label,
  languages,
  open,
  point,
  onOpenChange,
  onSelect,
}: {
  disabled: boolean;
  itemValuePrefix: string;
  label: string;
  languages: Array<{ value: DocumentTranslationLanguage; label: string; flag: string }>;
  open: boolean;
  point: { x: number; y: number } | undefined;
  onOpenChange: (open: boolean) => void;
  onSelect: (language: DocumentTranslationLanguage) => void;
}) {
  return (
    <ChakraMenu.Root
      open={open}
      onOpenChange={(event) => onOpenChange(event.open)}
      positioning={{
        placement: 'bottom-start',
        hideWhenDetached: true,
        getAnchorRect: () => getMenuAnchorRect(point),
      }}
    >
      <Portal>
        <ChakraMenu.Positioner>
          <ChakraMenu.Content zIndex="dropdown" minW="14rem" rounded="lg" borderWidth="1px" borderColor="border.surface" bg="bg.surface" p="1.5" shadow="lg">
            <ChakraMenu.Root positioning={{ placement: 'right-start', gutter: 2 }}>
              <ChakraMenu.TriggerItem display="flex" alignItems="center" gap="2" rounded="md" borderWidth="1px" borderColor="transparent" px="3" py="2" fontSize="sm" fontWeight="medium" color="fg.muted" _highlighted={{ bg: 'teal.subtle', borderColor: 'teal.muted', color: 'teal.fg' }}>
                <Languages size={16} />
                <Text flex="1">{label}</Text>
                <ChevronRight size={16} />
              </ChakraMenu.TriggerItem>
              <Portal>
                <ChakraMenu.Positioner>
                  <ChakraMenu.Content zIndex="dropdown" minW="10rem" rounded="lg" borderWidth="1px" borderColor="border.surface" bg="bg.surface" p="1.5" shadow="lg">
                    {languages.map((language) => (
                      <ChakraMenu.Item
                        key={language.value}
                        value={`${itemValuePrefix}-${language.value}`}
                        disabled={disabled}
                        display="flex"
                        alignItems="center"
                        gap="2"
                        rounded="md"
                        px="3"
                        py="2"
                        fontSize="sm"
                        fontWeight="medium"
                        color="fg.muted"
                        borderWidth="1px"
                        borderColor="transparent"
                        _highlighted={{ bg: 'teal.subtle', borderColor: 'teal.muted', color: 'teal.fg' }}
                        onSelect={() => onSelect(language.value)}
                      >
                        <TranslationLanguageMenuLabel language={language} />
                      </ChakraMenu.Item>
                    ))}
                  </ChakraMenu.Content>
                </ChakraMenu.Positioner>
              </Portal>
            </ChakraMenu.Root>
          </ChakraMenu.Content>
        </ChakraMenu.Positioner>
      </Portal>
    </ChakraMenu.Root>
  );
}

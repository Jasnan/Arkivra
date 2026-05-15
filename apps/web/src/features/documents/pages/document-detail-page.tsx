import type { FormEvent } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';
import { Document as PdfDocument, Page as PdfPage, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/TextLayer.css';
import {
  Box,
  Flex,
  Text,
  CloseButton,
  Dialog as ChakraDialog,
  Menu as ChakraMenu,
  Portal,
  Spinner,
  chakra,
  Heading,
} from '@chakra-ui/react';
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Download,
  Image as ImageIcon,
  Languages,
  MessageSquare,
  Pencil,
  ScanText,
  Tags,
  Plus,
  Printer,
  RotateCcw,
  Trash2,
  ZoomIn,
  ZoomOut,
  X,
} from 'lucide-react';
import { useLocation, useNavigate, useParams } from '@tanstack/react-router';
import { toast } from 'sonner';
import { ROUTES } from '@/app/routes';
import { useWorkspaceHeader } from '@/components/layout/workspace-context';
import { DeleteButton, SaveButton } from '@/components/ui/action-buttons';
import { ActionMenuItemIcon, ActionMenuTriggerButton } from '@/components/ui/action-menu';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Field, FieldLabel } from '@/components/ui/field';
import { InfoTooltip } from '@/components/ui/info-tooltip';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ChatWorkspace } from '@/features/chat/components/chat-workspace';
import { DocumentMarkdownPreview } from '@/features/documents/components/document-markdown-preview';
import {
  getDocumentDownloadUrl,
  getDocumentInlineFileUrl,
  renameDocument,
  restoreDocument,
  softDeleteDocument,
  translateDocument,
  updateDocumentDate,
  updateDocumentLanguage,
} from '@/features/documents/documents.api';
import type {
  DocumentTranslationLanguage,
  DocumentTranslationSource,
} from '@/features/documents/documents.api';
import type { DocumentLanguageMetadata } from '@/features/documents/documents.types';
import {
  captureCanvasRegionAsPngBase64,
  createNormalizedRect,
  getNormalizedPointFromClient,
} from '@/features/documents/pdf-translation-capture';
import type { NormalizedPoint, NormalizedRect } from '@/features/documents/pdf-translation-capture';
import {
  documentQueryKeys,
  useDeletedDocumentsQuery,
  useDocumentFileTextQuery,
  useDocumentQuery,
  useDocumentTagsQuery,
} from '@/features/documents/documents.queries';
import {
  formatBytes,
  formatDate,
  getDocumentProcessingStageDescription,
  getDocumentProcessingStageLabel,
  isDocumentProcessingActive,
} from '@/features/documents/documents.utils';
import { assignTagToDocument, createTag, removeTagFromDocument } from '@/features/tags/tags.api';
import { TagDialog } from '@/features/tags/components/tag-dialog';
import { tagQueryKeys, useTagsQuery } from '@/features/tags/tags.queries';
import { VaultRouteBreadcrumbs } from '@/features/file-browser/components/vault-browser-components';
import type { VaultBreadcrumbEntry } from '@/features/file-browser/components/vault-browser-components';
import { useFolderTreeQuery } from '@/features/file-browser/file-browser.queries';
import { useVaultQuery } from '@/features/vaults/vaults.queries';

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();

type PreviewKind = 'pdf' | 'image' | 'markdown' | 'text' | 'unsupported';
type DetailTab = 'preview' | 'content' | 'metadata' | 'chat';

const documentTabTriggerStyles = {
  h: '11',
  roundedTop: 'md',
  roundedBottom: '0',
  borderBottomWidth: '2px',
  borderColor: 'transparent',
  px: '3',
  pb: '3',
  pt: '2',
  color: 'fg.muted',
  _hover: { bg: 'teal.subtle', color: 'fg' },
  _selected: {
    bg: 'teal.subtle',
    borderColor: 'teal.solid',
    color: 'teal.fg',
    shadow: 'none',
  },
} as const;

const searchReturnParamKeys = ['q', 'vaultId', 'tagId', 'dateFrom', 'dateTo', 'sortBy'] as const;
const pdfPreviewRevealDelayMs = 120;
const pdfPreviewFadeMs = 420;
const pdfPreviewPadding = 32;
const pdfPreviewToolbarHeight = 88;
const pdfPreviewCommitCoverDelayMs = 120;
const pdfPreviewMinZoom = 0.5;
const pdfPreviewMaxZoom = 3;
const pdfPreviewZoomStep = 0.1;

type PdfZoomMode = 'fit-page' | 'fit-width' | 'actual' | 'custom';

function clampPdfZoom(value: number) {
  return Math.min(Math.max(value, pdfPreviewMinZoom), pdfPreviewMaxZoom);
}

const translationLanguages: Array<{ value: DocumentTranslationLanguage; label: string; flag: string }> = [
  { value: 'de', label: 'German', flag: '🇩🇪' },
  { value: 'en', label: 'English', flag: '🇬🇧' },
];

const editableDocumentLanguages = [
  { value: 'unknown', label: 'Unknown' },
  { value: 'de', label: 'German' },
  { value: 'en', label: 'English' },
  { value: 'es', label: 'Spanish' },
  { value: 'fr', label: 'French' },
] as const;

interface TranslationPaneState {
  status: 'loading' | 'success' | 'error';
  targetLanguage: DocumentTranslationLanguage;
  sourceType: DocumentTranslationSource['type'];
  pageNumber: number;
  text: string;
  error: string | null;
  provider: string | null;
  model: string | null;
}

interface PdfMenuPoint {
  x: number;
  y: number;
}

interface TextSelectionMenuState {
  open: boolean;
  point: PdfMenuPoint;
  text: string;
  pageNumber: number;
}

interface VisualSelectionMenuState {
  open: boolean;
  point: PdfMenuPoint;
  rect: NormalizedRect;
  pageNumber: number;
}

interface AreaDragState {
  pointerId: number;
  start: NormalizedPoint;
  current: NormalizedPoint;
}

function getTranslationLanguageLabel(language: DocumentTranslationLanguage) {
  return translationLanguages.find(item => item.value === language)?.label ?? language.toUpperCase();
}

function getDocumentLanguageLabel(language: DocumentLanguageMetadata | null) {
  if (language === null) {
    return 'Unknown';
  }

  return language.name || language.code.toUpperCase();
}

function getTranslationTargetLanguages(sourceLanguage: DocumentLanguageMetadata | null | undefined) {
  const sourceCode = sourceLanguage?.code.toLocaleLowerCase().split('-')[0];

  if (sourceCode === undefined) {
    return translationLanguages;
  }

  return translationLanguages.filter(language => language.value !== sourceCode);
}

function getTranslationSourceLabel(sourceType: DocumentTranslationSource['type']) {
  if (sourceType === 'page-image') {
    return 'Page';
  }

  return sourceType === 'area-image' ? 'Selected area' : 'Selected text';
}

function getAbortAwareError(error: unknown) {
  if (error instanceof DOMException && error.name === 'AbortError') {
    return 'Translation cancelled.';
  }

  if (error instanceof Error) {
    return error.message;
  }

  return 'Translation failed.';
}

function getRenderedPdfCanvas(pageElement: HTMLElement | null) {
  return pageElement?.querySelector('canvas') ?? null;
}

function getRectStyle(rect: NormalizedRect) {
  return {
    left: `${rect.x * 100}%`,
    top: `${rect.y * 100}%`,
    width: `${rect.width * 100}%`,
    height: `${rect.height * 100}%`,
  };
}

function isMeaningfulSelectionRect(rect: NormalizedRect) {
  return rect.width >= 0.01 && rect.height >= 0.01;
}

function getSelectionTextWithin(element: HTMLElement | null) {
  if (element === null) {
    return null;
  }

  const selection = window.getSelection();
  const text = selection?.toString().trim() ?? '';

  if (selection === null || selection.rangeCount === 0 || text.length === 0) {
    return null;
  }

  const anchorNode = selection.anchorNode;
  const focusNode = selection.focusNode;
  const hasEndpointInside = (node: Node | null) => node !== null && element.contains(node);

  if (!hasEndpointInside(anchorNode) && !hasEndpointInside(focusNode)) {
    return null;
  }

  return text;
}

function getMenuAnchorRect(point: PdfMenuPoint | undefined) {
  const x = point?.x ?? 0;
  const y = point?.y ?? 0;

  return {
    x,
    y,
    left: x,
    top: y,
    right: x + 1,
    bottom: y + 1,
    width: 1,
    height: 1,
  } as DOMRect;
}

function TranslationLanguageMenuLabel({
  language,
}: {
  language: typeof translationLanguages[number];
}) {
  return (
    <>
      <Text as="span" aria-hidden="true" fontSize="md" lineHeight="1">
        {language.flag}
      </Text>
      <Text as="span">{language.label}</Text>
    </>
  );
}

function TranslationResultText({ text }: { text: string }) {
  return (
    <Text
      as="div"
      fontSize="sm"
      lineHeight="1.5"
      color="fg"
      whiteSpace="pre-wrap"
      overflowWrap="anywhere"
    >
      {text}
    </Text>
  );
}

function PdfPreviewFrame({
  src,
  vaultId,
  documentId,
  onPrint,
  translationsDisabled = false,
  sourceLanguage = null,
}: {
  src: string;
  vaultId: string;
  documentId: string;
  onPrint: () => void;
  translationsDisabled?: boolean;
  sourceLanguage?: DocumentLanguageMetadata | null;
}) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const visiblePageRef = useRef<HTMLDivElement | null>(null);
  const activeTranslationControllerRef = useRef<AbortController | null>(null);
  const revealTimeoutRef = useRef<number | null>(null);
  const transitionTimeoutRef = useRef<number | null>(null);
  const commitCoverTimeoutRef = useRef<number | null>(null);
  const requestedPageNumberRef = useRef(1);
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });
  const [numPages, setNumPages] = useState<number | null>(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [visiblePageNumber, setVisiblePageNumber] = useState(1);
  const [isPendingPageRendered, setIsPendingPageRendered] = useState(false);
  const [commitCoverPageNumber, setCommitCoverPageNumber] = useState<number | null>(null);
  const [pageAspectRatio, setPageAspectRatio] = useState<number | null>(null);
  const [pageNaturalWidth, setPageNaturalWidth] = useState<number | null>(null);
  const [zoomMode, setZoomMode] = useState<PdfZoomMode>('fit-page');
  const [customZoomScale, setCustomZoomScale] = useState(1);
  const [isPageRendered, setIsPageRendered] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [translationPane, setTranslationPane] = useState<TranslationPaneState | null>(null);
  const [pageContextMenu, setPageContextMenu] = useState<{ open: boolean; point: PdfMenuPoint } | null>(null);
  const [textSelectionMenu, setTextSelectionMenu] = useState<TextSelectionMenuState | null>(null);
  const [visualSelectionMenu, setVisualSelectionMenu] = useState<VisualSelectionMenuState | null>(null);
  const [isAreaSelectionMode, setIsAreaSelectionMode] = useState(false);
  const [areaDrag, setAreaDrag] = useState<AreaDragState | null>(null);
  const [visualSelectionRect, setVisualSelectionRect] = useState<NormalizedRect | null>(null);
  const [isTranslationPending, setIsTranslationPending] = useState(false);

  useEffect(() => {
    const viewport = viewportRef.current;

    if (!viewport) {
      return undefined;
    }

    const observer = new ResizeObserver(([entry]) => {
      if (!entry) {
        return;
      }

      setViewportSize({
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      });
    });

    observer.observe(viewport);
    return () => {
      observer.disconnect();
    };
  }, []);

  useEffect(() => () => {
    activeTranslationControllerRef.current?.abort();

    if (revealTimeoutRef.current !== null) {
      window.clearTimeout(revealTimeoutRef.current);
    }

    if (transitionTimeoutRef.current !== null) {
      window.clearTimeout(transitionTimeoutRef.current);
    }

    if (commitCoverTimeoutRef.current !== null) {
      window.clearTimeout(commitCoverTimeoutRef.current);
    }
  }, []);

  requestedPageNumberRef.current = pageNumber;

  useEffect(() => {
    setTextSelectionMenu(null);
    setVisualSelectionMenu(null);
    setVisualSelectionRect(null);
    setAreaDrag(null);
  }, [src, visiblePageNumber]);

  const pageViewportWidth = Math.max(viewportSize.width - pdfPreviewPadding * 2, 0);
  const pageViewportHeight = Math.max(
    viewportSize.height - pdfPreviewToolbarHeight - pdfPreviewPadding * 2,
    0,
  );
  const fitPageWidth = pageAspectRatio
    ? Math.min(pageViewportWidth, pageViewportHeight * pageAspectRatio)
    : pageViewportWidth;
  const basePageWidth = Math.max(fitPageWidth, 240);
  const pageWidth = Math.max(
    zoomMode === 'fit-width'
      ? pageViewportWidth
      : zoomMode === 'actual'
        ? pageNaturalWidth ?? basePageWidth
        : zoomMode === 'custom'
          ? basePageWidth * customZoomScale
          : fitPageWidth,
    240,
  );
  const pageHeight = pageAspectRatio ? pageWidth / pageAspectRatio : undefined;
  const zoomPercent = pageNaturalWidth
    ? Math.round((pageWidth / pageNaturalWidth) * 100)
    : Math.round((pageWidth / basePageWidth) * 100);
  const hasPreviousPage = pageNumber > 1;
  const hasNextPage = numPages !== null && pageNumber < numPages;
  const isReady = isPageRendered && !loadError;
  const canZoomOut = pageWidth / basePageWidth > pdfPreviewMinZoom;
  const canZoomIn = pageWidth / basePageWidth < pdfPreviewMaxZoom;
  const isPageTransitioning = pageNumber !== visiblePageNumber;
  const pendingLayerPageNumber = commitCoverPageNumber ?? pageNumber;
  const hasPendingLayer = isPageTransitioning || commitCoverPageNumber !== null;
  const isPendingLayerVisible = isPendingPageRendered || commitCoverPageNumber !== null;
  const availableTranslationLanguages = useMemo(
    () => getTranslationTargetLanguages(sourceLanguage),
    [sourceLanguage],
  );

  function handleDocumentLoadSuccess(pdf: PDFDocumentProxy) {
    setNumPages(pdf.numPages);
    setPageNumber((currentPageNumber) => {
      const nextPageNumber = Math.min(currentPageNumber, pdf.numPages);
      setVisiblePageNumber(nextPageNumber);
      return nextPageNumber;
    });
    setLoadError(false);
  }

  function handlePageLoadSuccess(page: PDFPageProxy) {
    const viewport = page.getViewport({ scale: 1 });
    setPageAspectRatio(viewport.width / viewport.height);
    setPageNaturalWidth(viewport.width);
  }

  function handleVisiblePageRenderSuccess(renderedPageNumber: number) {
    if (revealTimeoutRef.current !== null) {
      window.clearTimeout(revealTimeoutRef.current);
    }

    revealTimeoutRef.current = window.setTimeout(() => {
      setIsPageRendered(true);

      if (commitCoverPageNumber === renderedPageNumber) {
        if (commitCoverTimeoutRef.current !== null) {
          window.clearTimeout(commitCoverTimeoutRef.current);
        }

        commitCoverTimeoutRef.current = window.setTimeout(() => {
          if (requestedPageNumberRef.current === renderedPageNumber) {
            setCommitCoverPageNumber(null);
            setIsPendingPageRendered(false);
          }

          commitCoverTimeoutRef.current = null;
        }, pdfPreviewCommitCoverDelayMs);
      }

      revealTimeoutRef.current = null;
    }, pdfPreviewRevealDelayMs);
  }

  function handlePendingPageRenderSuccess(renderedPageNumber: number) {
    if (requestedPageNumberRef.current !== renderedPageNumber) {
      return;
    }

    if (transitionTimeoutRef.current !== null) {
      window.clearTimeout(transitionTimeoutRef.current);
    }

    setIsPendingPageRendered(true);
    transitionTimeoutRef.current = window.setTimeout(() => {
      if (requestedPageNumberRef.current === renderedPageNumber) {
        setCommitCoverPageNumber(renderedPageNumber);
        setVisiblePageNumber(renderedPageNumber);
      }

      transitionTimeoutRef.current = null;
    }, pdfPreviewFadeMs);
  }

  function requestPage(nextPageNumber: number) {
    if (nextPageNumber === pageNumber) {
      return;
    }

    if (transitionTimeoutRef.current !== null) {
      window.clearTimeout(transitionTimeoutRef.current);
      transitionTimeoutRef.current = null;
    }

    if (commitCoverTimeoutRef.current !== null) {
      window.clearTimeout(commitCoverTimeoutRef.current);
      commitCoverTimeoutRef.current = null;
    }

    setIsPendingPageRendered(false);
    setCommitCoverPageNumber(null);
    setPageNumber(nextPageNumber);
  }

  function goToPreviousPage() {
    requestPage(Math.max(pageNumber - 1, 1));
  }

  function goToNextPage() {
    requestPage(Math.min(pageNumber + 1, numPages ?? pageNumber));
  }

  function goToPage(input: HTMLInputElement) {
    const value = input.value;
    const nextPageNumber = Number.parseInt(value, 10);

    if (!Number.isInteger(nextPageNumber) || numPages === null) {
      input.value = String(pageNumber);
      return;
    }

    const clampedPageNumber = Math.min(Math.max(nextPageNumber, 1), numPages);
    input.value = String(clampedPageNumber);
    requestPage(clampedPageNumber);
  }

  function handlePageInputKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key !== 'Enter') {
      return;
    }

    event.currentTarget.blur();
  }

  function setFitMode(nextZoomMode: PdfZoomMode) {
    if (transitionTimeoutRef.current !== null) {
      window.clearTimeout(transitionTimeoutRef.current);
      transitionTimeoutRef.current = null;
    }

    if (commitCoverTimeoutRef.current !== null) {
      window.clearTimeout(commitCoverTimeoutRef.current);
      commitCoverTimeoutRef.current = null;
    }

    setVisiblePageNumber(pageNumber);
    setIsPendingPageRendered(false);
    setCommitCoverPageNumber(null);
    setIsPageRendered(false);
    setZoomMode(nextZoomMode);
  }

  function updateCustomZoom(nextScale: number) {
    if (transitionTimeoutRef.current !== null) {
      window.clearTimeout(transitionTimeoutRef.current);
      transitionTimeoutRef.current = null;
    }

    if (commitCoverTimeoutRef.current !== null) {
      window.clearTimeout(commitCoverTimeoutRef.current);
      commitCoverTimeoutRef.current = null;
    }

    setVisiblePageNumber(pageNumber);
    setIsPendingPageRendered(false);
    setCommitCoverPageNumber(null);
    setIsPageRendered(false);
    setZoomMode('custom');
    setCustomZoomScale(clampPdfZoom(nextScale));
  }

  function zoomOut() {
    updateCustomZoom((pageWidth / basePageWidth) - pdfPreviewZoomStep);
  }

  function zoomIn() {
    updateCustomZoom((pageWidth / basePageWidth) + pdfPreviewZoomStep);
  }

  function cancelTranslation() {
    activeTranslationControllerRef.current?.abort();
  }

  function closeTranslationPane() {
    if (translationPane?.status === 'loading') {
      cancelTranslation();
    }

    setTranslationPane(null);
  }

  function createTranslationController() {
    activeTranslationControllerRef.current?.abort();
    const controller = new AbortController();
    activeTranslationControllerRef.current = controller;
    setIsTranslationPending(true);
    return controller;
  }

  function finishTranslation(controller: AbortController) {
    if (activeTranslationControllerRef.current === controller) {
      activeTranslationControllerRef.current = null;
      setIsTranslationPending(false);
    }
  }

  function getCurrentCanvas() {
    return getRenderedPdfCanvas(visiblePageRef.current);
  }

  async function runPageTranslation(targetLanguage: DocumentTranslationLanguage) {
    if (translationsDisabled) {
      return;
    }

    const controller = createTranslationController();
    const pendingState: TranslationPaneState = {
      status: 'loading',
      targetLanguage,
      sourceType: 'page-image',
      pageNumber: visiblePageNumber,
      text: '',
      error: null,
      provider: null,
      model: null,
    };
    setTranslationPane(pendingState);
    setPageContextMenu(null);

    try {
      const canvas = getCurrentCanvas();
      if (canvas === null) {
        throw new Error('The rendered PDF page is not ready yet.');
      }

      const imageBase64 = captureCanvasRegionAsPngBase64({ canvas });
      const response = await translateDocument({
        vaultId,
        documentId,
        targetLanguage,
        source: {
          type: 'page-image',
          pageNumber: visiblePageNumber,
          imageBase64,
          mimeType: 'image/png',
        },
        signal: controller.signal,
      });

      setTranslationPane(current => controller.signal.aborted && current === null
        ? null
        : {
            ...pendingState,
            status: 'success',
            text: response.translation.text,
            provider: response.translation.provider,
            model: response.translation.model,
          });
    } catch (error) {
      setTranslationPane(current => controller.signal.aborted && current === null
        ? null
        : {
            ...pendingState,
            status: 'error',
            error: getAbortAwareError(error),
          });
    } finally {
      finishTranslation(controller);
    }
  }

  async function runSelectionTranslation({
    targetLanguage,
    source,
  }: {
    targetLanguage: DocumentTranslationLanguage;
    source: Extract<DocumentTranslationSource, { type: 'text' | 'area-image' }>;
  }) {
    if (translationsDisabled) {
      return;
    }

    const controller = createTranslationController();
    const pendingState: TranslationPaneState = {
      status: 'loading',
      targetLanguage,
      sourceType: source.type,
      pageNumber: source.pageNumber ?? visiblePageNumber,
      text: '',
      error: null,
      provider: null,
      model: null,
    };
    setTranslationPane(pendingState);
    setTextSelectionMenu(null);
    setVisualSelectionMenu(null);

    try {
      const response = await translateDocument({
        vaultId,
        documentId,
        targetLanguage,
        source,
        signal: controller.signal,
      });

      setTranslationPane(current => controller.signal.aborted && current === null
        ? null
        : {
            ...pendingState,
            status: 'success',
            text: response.translation.text,
            provider: response.translation.provider,
            model: response.translation.model,
          });
    } catch (error) {
      setTranslationPane(current => controller.signal.aborted && current === null
        ? null
        : {
            ...pendingState,
            status: 'error',
            error: getAbortAwareError(error),
          });
    } finally {
      finishTranslation(controller);
    }
  }

  async function runVisualSelectionTranslation(targetLanguage: DocumentTranslationLanguage, rect: NormalizedRect) {
    if (translationsDisabled) {
      return;
    }

    const canvas = getCurrentCanvas();

    if (canvas === null) {
      setTranslationPane({
        status: 'error',
        targetLanguage,
        sourceType: 'area-image',
        pageNumber: visiblePageNumber,
        text: '',
        error: 'The rendered PDF page is not ready yet.',
        provider: null,
        model: null,
      });
      setVisualSelectionMenu(null);
      return;
    }

    const imageBase64 = captureCanvasRegionAsPngBase64({ canvas, rect });
    await runSelectionTranslation({
      targetLanguage,
      source: {
        type: 'area-image',
        pageNumber: visiblePageNumber,
        imageBase64,
        mimeType: 'image/png',
        rect,
      },
    });
  }

  function handlePageContextMenu(event: React.MouseEvent<HTMLDivElement>) {
    if (!isReady || isAreaSelectionMode || translationsDisabled) {
      return;
    }

    event.preventDefault();
    setTextSelectionMenu(null);
    setVisualSelectionMenu(null);
    setPageContextMenu({
      open: true,
      point: { x: event.clientX, y: event.clientY },
    });
  }

  function handlePageMouseUp(event: React.MouseEvent<HTMLDivElement>) {
    if (isAreaSelectionMode || !isReady || translationsDisabled) {
      return;
    }

    window.setTimeout(() => {
      const text = getSelectionTextWithin(visiblePageRef.current);
      if (text === null) {
        return;
      }

      setPageContextMenu(null);
      setVisualSelectionMenu(null);
      setTextSelectionMenu({
        open: true,
        point: { x: event.clientX, y: event.clientY },
        text,
        pageNumber: visiblePageNumber,
      });
    }, 0);
  }

  function handleAreaPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (!isAreaSelectionMode || !isReady || translationsDisabled || visiblePageRef.current === null) {
      return;
    }

    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    window.getSelection()?.removeAllRanges();
    const start = getNormalizedPointFromClient({
      clientX: event.clientX,
      clientY: event.clientY,
      bounds: visiblePageRef.current.getBoundingClientRect(),
    });
    setTextSelectionMenu(null);
    setPageContextMenu(null);
    setVisualSelectionMenu(null);
    setVisualSelectionRect(null);
    setAreaDrag({
      pointerId: event.pointerId,
      start,
      current: start,
    });
  }

  function handleAreaPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    if (areaDrag === null || visiblePageRef.current === null || areaDrag.pointerId !== event.pointerId) {
      return;
    }

    event.preventDefault();
    setAreaDrag({
      ...areaDrag,
      current: getNormalizedPointFromClient({
        clientX: event.clientX,
        clientY: event.clientY,
        bounds: visiblePageRef.current.getBoundingClientRect(),
      }),
    });
  }

  function handleAreaPointerUp(event: React.PointerEvent<HTMLDivElement>) {
    if (areaDrag === null || visiblePageRef.current === null || areaDrag.pointerId !== event.pointerId) {
      return;
    }

    event.preventDefault();
    const rect = createNormalizedRect(
      areaDrag.start,
      getNormalizedPointFromClient({
        clientX: event.clientX,
        clientY: event.clientY,
        bounds: visiblePageRef.current.getBoundingClientRect(),
      }),
    );
    setAreaDrag(null);

    if (!isMeaningfulSelectionRect(rect)) {
      setVisualSelectionRect(null);
      setVisualSelectionMenu(null);
      return;
    }

    setVisualSelectionRect(rect);
    setVisualSelectionMenu({
      open: true,
      point: { x: event.clientX, y: event.clientY },
      rect,
      pageNumber: visiblePageNumber,
    });
  }

  function getFitButtonStyles(mode: PdfZoomMode) {
    return zoomMode === mode
      ? { bg: 'teal.subtle', borderColor: 'teal.muted', color: 'teal.fg' }
      : undefined;
  }

  const activeAreaRect = areaDrag !== null
    ? createNormalizedRect(areaDrag.start, areaDrag.current)
    : visualSelectionRect;

  return (
    <Flex h="full" minH={{ base: '720px', md: '0' }} gap="3" direction={{ base: 'column', xl: 'row' }} overflow="hidden">
    <Box flex="1 1 0" minW="0" h="full" overflow="hidden" rounded="lg" bg="bg.subtle" p="2">
      <Box
        ref={viewportRef}
        position="relative"
        h="full"
        overflow="hidden"
        rounded="lg"
        borderWidth="1px"
        borderColor="border.subtle"
        bg="bg.surface"
      >
        <Flex
          h={`${pdfPreviewToolbarHeight}px`}
          align="center"
          justify="space-between"
          gap="3"
          wrap="wrap"
          borderBottomWidth="1px"
          borderColor="border.subtle"
          bg="bg.surface"
          px={{ base: '3', md: '4' }}
        >
          <Flex align="center" gap="1.5" minW="0">
            <Button
              type="button"
              size="sm"
              variant="outline"
              aria-label="Previous PDF page"
              disabled={!hasPreviousPage}
              onClick={goToPreviousPage}
            >
              <ChevronLeft size={16} />
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              aria-label="Next PDF page"
              disabled={!hasNextPage}
              onClick={goToNextPage}
            >
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
              onBlur={(event) => goToPage(event.currentTarget)}
              onKeyDown={handlePageInputKeyDown}
            />
            <Text fontSize="sm" fontWeight="medium" color="fg.muted" whiteSpace="nowrap">
              of {numPages ?? '...'}
            </Text>
          </Flex>

          <Flex align="center" gap="2" minW="0">
            <Button
              type="button"
              size="sm"
              variant="outline"
              aria-label="Zoom out"
              disabled={!canZoomOut}
              onClick={zoomOut}
            >
              <ZoomOut size={16} />
            </Button>
            <Text minW="3.5rem" textAlign="center" fontSize="sm" fontWeight="medium" color="fg">
              {zoomPercent}%
            </Text>
            <Button
              type="button"
              size="sm"
              variant="outline"
              aria-label="Zoom in"
              disabled={!canZoomIn}
              onClick={zoomIn}
            >
              <ZoomIn size={16} />
            </Button>
            <Flex align="center" gap="1" rounded="md" borderWidth="1px" borderColor="border.subtle" p="0.5">
              <Button
                type="button"
                size="sm"
                variant="ghost"
                h="8"
                px="2.5"
                aria-pressed={zoomMode === 'fit-page'}
                onClick={() => setFitMode('fit-page')}
                {...getFitButtonStyles('fit-page')}
              >
                Fit page
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                h="8"
                px="2.5"
                aria-pressed={zoomMode === 'fit-width'}
                onClick={() => setFitMode('fit-width')}
                {...getFitButtonStyles('fit-width')}
              >
                Fit width
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                h="8"
                px="2.5"
                aria-pressed={zoomMode === 'actual'}
                onClick={() => setFitMode('actual')}
                {...getFitButtonStyles('actual')}
              >
                100%
              </Button>
            </Flex>
          </Flex>

          <Flex align="center" gap="2">
            {!translationsDisabled ? (
              <Button
                type="button"
                size="sm"
                variant={isAreaSelectionMode ? 'solid' : 'outline'}
                aria-pressed={isAreaSelectionMode}
                disabled={!isReady}
                onClick={() => {
                  setIsAreaSelectionMode(value => !value);
                  setTextSelectionMenu(null);
                  setPageContextMenu(null);
                  setVisualSelectionMenu(null);
                  setVisualSelectionRect(null);
                }}
              >
                <ScanText size={16} />
                Area
              </Button>
            ) : null}
            <Button type="button" size="sm" variant="outline" onClick={onPrint}>
              <Printer size={16} />
              Print
            </Button>
          </Flex>
        </Flex>
        {loadError ? (
          <Flex
            position="absolute"
            insetX="0"
            top={`${pdfPreviewToolbarHeight}px`}
            bottom="0"
            zIndex="1"
            align="center"
            justify="center"
            bg="bg.surface"
            px="6"
            textAlign="center"
            aria-live="polite"
          >
            <Text fontSize="sm" fontWeight="semibold" color="fg.error">
              Unable to load preview.
            </Text>
          </Flex>
        ) : null}
        <Flex
          position="absolute"
          insetX="0"
          top={`${pdfPreviewToolbarHeight}px`}
          bottom="0"
          align="center"
          justify="center"
          overflow="auto"
          bg="bg.surface"
          p={`${pdfPreviewPadding}px`}
          opacity={isReady ? 1 : 0}
          pointerEvents={isReady ? 'auto' : 'none'}
          transform={isReady ? 'scale(1)' : 'scale(0.992)'}
          transformOrigin="center"
          transition={`opacity ${pdfPreviewFadeMs}ms ease, transform ${pdfPreviewFadeMs}ms ease`}
          aria-hidden={!isReady}
          willChange="opacity, transform"
        >
          {viewportSize.width > 0 ? (
            <Box
              ref={visiblePageRef}
              position="relative"
              w={`${pageWidth}px`}
              h={pageHeight ? `${pageHeight}px` : undefined}
              minH={pageHeight ? `${pageHeight}px` : undefined}
              flexShrink="0"
              onContextMenu={handlePageContextMenu}
              onMouseUp={handlePageMouseUp}
            >
              <PdfDocument
                file={src}
                loading={null}
                error={null}
                onLoadSuccess={handleDocumentLoadSuccess}
                onLoadError={() => setLoadError(true)}
              >
                <Box
                  opacity={isReady && (!isPageTransitioning || !isPendingPageRendered) ? 1 : 0}
                  transition={`opacity ${pdfPreviewFadeMs}ms ease`}
                  willChange="opacity"
                >
                  <PdfPage
                    key={`${src}-${visiblePageNumber}-${Math.round(pageWidth)}`}
                    pageNumber={visiblePageNumber}
                    width={pageWidth}
                    loading={null}
                    error={null}
                    renderAnnotationLayer={false}
                    renderTextLayer
                    onLoadSuccess={handlePageLoadSuccess}
                    onRenderSuccess={() => handleVisiblePageRenderSuccess(visiblePageNumber)}
                    onRenderError={() => setLoadError(true)}
                  />
                </Box>
                {hasPendingLayer ? (
                  <Box
                    position="absolute"
                    inset="0"
                    opacity={isPendingLayerVisible ? 1 : 0}
                    transition={`opacity ${pdfPreviewFadeMs}ms ease`}
                    willChange="opacity"
                  >
                    <PdfPage
                      key={`${src}-${pendingLayerPageNumber}-${Math.round(pageWidth)}`}
                      pageNumber={pendingLayerPageNumber}
                      width={pageWidth}
                      loading={null}
                      error={null}
                      renderAnnotationLayer={false}
                      renderTextLayer
                      onLoadSuccess={handlePageLoadSuccess}
                      onRenderSuccess={() => handlePendingPageRenderSuccess(pendingLayerPageNumber)}
                      onRenderError={() => setLoadError(true)}
                    />
                  </Box>
                ) : null}
              </PdfDocument>
              {isAreaSelectionMode ? (
                <Box
                  position="absolute"
                  inset="0"
                  zIndex="2"
                  cursor="crosshair"
                  userSelect="none"
                  touchAction="none"
                  onPointerDown={handleAreaPointerDown}
                  onPointerMove={handleAreaPointerMove}
                  onPointerUp={handleAreaPointerUp}
                  onPointerCancel={() => setAreaDrag(null)}
                />
              ) : null}
              {activeAreaRect !== null ? (
                <Box
                  aria-hidden="true"
                  position="absolute"
                  zIndex="3"
                  borderWidth="2px"
                  borderColor="teal.solid"
                  bg="teal.subtle"
                  opacity="0.78"
                  pointerEvents="none"
                  shadow="0 0 0 1px var(--chakra-colors-bg-surface)"
                  {...getRectStyle(activeAreaRect)}
                />
              ) : null}
            </Box>
          ) : null}
        </Flex>
      </Box>
    </Box>
    {translationPane !== null && !translationsDisabled ? (
      <Box
        flex={{ base: '0 0 auto', xl: '0 0 22rem' }}
        h={{ base: '24rem', xl: 'full' }}
        minH="0"
        overflow="hidden"
        rounded="lg"
        borderWidth="1px"
        borderColor="border.subtle"
        bg="bg.surface"
      >
        <Flex
          h="14"
          align="center"
          justify="space-between"
          gap="3"
          borderBottomWidth="1px"
          borderColor="border.subtle"
          px="4"
        >
          <Box minW="0">
            <Text fontSize="sm" fontWeight="semibold" color="fg" truncate>
              {getTranslationSourceLabel(translationPane.sourceType)} translation
            </Text>
            <Text fontSize="xs" color="fg.muted" truncate>
              Page {translationPane.pageNumber} to {getTranslationLanguageLabel(translationPane.targetLanguage)}
            </Text>
          </Box>
          <CloseButton
            size="sm"
            aria-label="Close translation pane"
            onClick={closeTranslationPane}
          />
        </Flex>
        <Box h="calc(100% - 3.5rem)" overflow="auto" px="4" py="4">
          {translationPane.status === 'loading' ? (
            <Flex minH="40" align="center" justify="center" direction="column" gap="3" textAlign="center">
              <Spinner size="sm" color="teal.solid" />
              <Text fontSize="sm" color="fg.muted">
                Translating {getTranslationSourceLabel(translationPane.sourceType).toLowerCase()}...
              </Text>
              <Button type="button" size="sm" variant="outline" onClick={cancelTranslation}>
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
    ) : null}

    <ChakraMenu.Root
      open={!translationsDisabled && (pageContextMenu?.open ?? false)}
      onOpenChange={(event) => setPageContextMenu(current => current === null ? null : { ...current, open: event.open })}
      positioning={{
        placement: 'bottom-start',
        hideWhenDetached: true,
        getAnchorRect: () => getMenuAnchorRect(pageContextMenu?.point),
      }}
    >
      <Portal>
        <ChakraMenu.Positioner>
          <ChakraMenu.Content zIndex="dropdown" minW="13rem" rounded="lg" borderWidth="1px" borderColor="border.subtle" bg="bg.surface" p="1.5" shadow="lg">
            <ChakraMenu.Root positioning={{ placement: 'right-start', gutter: 2 }}>
              <ChakraMenu.TriggerItem display="flex" alignItems="center" gap="2" rounded="md" px="3" py="2" fontSize="sm" fontWeight="medium" color="fg.muted" _highlighted={{ bg: 'bg.subtle', color: 'fg' }}>
                <Languages size={16} />
                <Text flex="1">Translate Page</Text>
                <ChevronRight size={16} />
              </ChakraMenu.TriggerItem>
              <Portal>
                <ChakraMenu.Positioner>
                  <ChakraMenu.Content zIndex="dropdown" minW="10rem" rounded="lg" borderWidth="1px" borderColor="border.subtle" bg="bg.surface" p="1.5" shadow="lg">
                    {availableTranslationLanguages.map(language => (
                      <ChakraMenu.Item
                        key={language.value}
                        value={`translate-page-${language.value}`}
                        disabled={isTranslationPending}
                        display="flex"
                        alignItems="center"
                        gap="2"
                        rounded="md"
                        px="3"
                        py="2"
                        fontSize="sm"
                        fontWeight="medium"
                        color="fg.muted"
                        _highlighted={{ bg: 'bg.subtle', color: 'fg' }}
                        onSelect={() => {
                          void runPageTranslation(language.value);
                        }}
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

    <ChakraMenu.Root
      open={!translationsDisabled && (textSelectionMenu?.open ?? false)}
      onOpenChange={(event) => setTextSelectionMenu(current => current === null ? null : { ...current, open: event.open })}
      positioning={{
        placement: 'bottom-start',
        hideWhenDetached: true,
        getAnchorRect: () => getMenuAnchorRect(textSelectionMenu?.point),
      }}
    >
      <Portal>
        <ChakraMenu.Positioner>
          <ChakraMenu.Content zIndex="dropdown" minW="14rem" rounded="lg" borderWidth="1px" borderColor="border.subtle" bg="bg.surface" p="1.5" shadow="lg">
            <ChakraMenu.Root positioning={{ placement: 'right-start', gutter: 2 }}>
              <ChakraMenu.TriggerItem display="flex" alignItems="center" gap="2" rounded="md" px="3" py="2" fontSize="sm" fontWeight="medium" color="fg.muted" _highlighted={{ bg: 'bg.subtle', color: 'fg' }}>
                <Languages size={16} />
                <Text flex="1">Translate Selection</Text>
                <ChevronRight size={16} />
              </ChakraMenu.TriggerItem>
              <Portal>
                <ChakraMenu.Positioner>
                  <ChakraMenu.Content zIndex="dropdown" minW="10rem" rounded="lg" borderWidth="1px" borderColor="border.subtle" bg="bg.surface" p="1.5" shadow="lg">
                    {availableTranslationLanguages.map(language => (
                      <ChakraMenu.Item
                        key={language.value}
                        value={`translate-text-${language.value}`}
                        disabled={isTranslationPending || textSelectionMenu === null}
                        display="flex"
                        alignItems="center"
                        gap="2"
                        rounded="md"
                        px="3"
                        py="2"
                        fontSize="sm"
                        fontWeight="medium"
                        color="fg.muted"
                        _highlighted={{ bg: 'bg.subtle', color: 'fg' }}
                        onSelect={() => {
                          if (textSelectionMenu !== null) {
                            void runSelectionTranslation({
                              targetLanguage: language.value,
                              source: {
                                type: 'text',
                                pageNumber: textSelectionMenu.pageNumber,
                                text: textSelectionMenu.text,
                              },
                            });
                          }
                        }}
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

    <ChakraMenu.Root
      open={!translationsDisabled && (visualSelectionMenu?.open ?? false)}
      onOpenChange={(event) => setVisualSelectionMenu(current => current === null ? null : { ...current, open: event.open })}
      positioning={{
        placement: 'bottom-start',
        hideWhenDetached: true,
        getAnchorRect: () => getMenuAnchorRect(visualSelectionMenu?.point),
      }}
    >
      <Portal>
        <ChakraMenu.Positioner>
          <ChakraMenu.Content zIndex="dropdown" minW="14rem" rounded="lg" borderWidth="1px" borderColor="border.subtle" bg="bg.surface" p="1.5" shadow="lg">
            <ChakraMenu.Root positioning={{ placement: 'right-start', gutter: 2 }}>
              <ChakraMenu.TriggerItem display="flex" alignItems="center" gap="2" rounded="md" px="3" py="2" fontSize="sm" fontWeight="medium" color="fg.muted" _highlighted={{ bg: 'bg.subtle', color: 'fg' }}>
                <Languages size={16} />
                <Text flex="1">Translate Selection</Text>
                <ChevronRight size={16} />
              </ChakraMenu.TriggerItem>
              <Portal>
                <ChakraMenu.Positioner>
                  <ChakraMenu.Content zIndex="dropdown" minW="10rem" rounded="lg" borderWidth="1px" borderColor="border.subtle" bg="bg.surface" p="1.5" shadow="lg">
                    {availableTranslationLanguages.map(language => (
                      <ChakraMenu.Item
                        key={language.value}
                        value={`translate-area-${language.value}`}
                        disabled={isTranslationPending || visualSelectionMenu === null}
                        display="flex"
                        alignItems="center"
                        gap="2"
                        rounded="md"
                        px="3"
                        py="2"
                        fontSize="sm"
                        fontWeight="medium"
                        color="fg.muted"
                        _highlighted={{ bg: 'bg.subtle', color: 'fg' }}
                        onSelect={() => {
                          if (visualSelectionMenu !== null) {
                            void runVisualSelectionTranslation(language.value, visualSelectionMenu.rect);
                          }
                        }}
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

    </Flex>
  );
}

function getSearchReturnParams(search: Record<string, unknown>) {
  if (search.source !== 'search') {
    return null;
  }

  const params: Record<string, string> = {};

  for (const key of searchReturnParamKeys) {
    const value = search[key];
    if (typeof value === 'string' && value.length > 0) {
      params[key] = value;
    } else if (typeof value === 'number' && Number.isFinite(value)) {
      params[key] = String(value);
    }
  }

  return params;
}

function isMarkdownDocument({ mimeType, name, originalName }: { mimeType: string; name: string; originalName: string }) {
  const normalizedMimeType = mimeType.toLowerCase();
  const normalizedNames = [name, originalName].map(value => value.toLowerCase());

  return (
    normalizedMimeType === 'text/markdown' ||
    normalizedMimeType === 'text/x-markdown' ||
    normalizedMimeType === 'application/markdown' ||
    normalizedMimeType === 'application/x-markdown' ||
    normalizedNames.some(normalizedName =>
      normalizedName.endsWith('.md') ||
      normalizedName.endsWith('.markdown') ||
      normalizedName.endsWith('.mdown') ||
      normalizedName.endsWith('.mkd'),
    )
  );
}

function getPreviewKind(mimeType: string, name: string, originalName: string): PreviewKind {
  if (mimeType === 'application/pdf') {
    return 'pdf';
  }

  if (mimeType.startsWith('image/')) {
    return 'image';
  }

  if (isMarkdownDocument({ mimeType, name, originalName })) {
    return 'markdown';
  }

  if (mimeType.startsWith('text/')) {
    return 'text';
  }

  return 'unsupported';
}

export function DocumentDetailPage() {
  const params = useParams({ strict: false }) as { vaultId?: string; documentId?: string };
  const documentId = params.documentId ?? '';
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const pathParts = location.pathname.split('/').filter(Boolean);
  const isTrashDocumentRoute = pathParts[0] === 'trash';
  const deletedDocumentsQuery = useDeletedDocumentsQuery({ enabled: isTrashDocumentRoute });
  const trashDocumentSummary = useMemo(
    () => deletedDocumentsQuery.data?.documents.find((document) => document.id === documentId) ?? null,
    [deletedDocumentsQuery.data?.documents, documentId],
  );
  const vaultId = params.vaultId ?? trashDocumentSummary?.vaultId ?? '';
  const parentRoute = isTrashDocumentRoute ? ROUTES.trash : ROUTES.vaultRoot(vaultId);

  const documentQuery = useDocumentQuery({ vaultId, documentId });
  const documentTagsQuery = useDocumentTagsQuery({ vaultId, documentId });
  const tagsQuery = useTagsQuery();
  const vaultQuery = useVaultQuery({ vaultId });
  const folderTreeQuery = useFolderTreeQuery({ vaultId, enabled: vaultId.length > 0 });
  const previewKind = getPreviewKind(
    documentQuery.data?.document.mimeType ?? '',
    documentQuery.data?.document.name ?? '',
    documentQuery.data?.document.originalName ?? '',
  );
  const markdownSourceQuery = useDocumentFileTextQuery({
    vaultId,
    documentId,
    includeDeleted: isTrashDocumentRoute,
    enabled: previewKind === 'markdown' && (documentQuery.data?.document.isDeleted === false || isTrashDocumentRoute),
  });

  const [renameValue, setRenameValue] = useState<string | null>(null);
  const [documentDateValue, setDocumentDateValue] = useState<string | null>(null);
  const [languageValue, setLanguageValue] = useState<string | null>(null);
  const [isNameEditing, setIsNameEditing] = useState(false);
  const [isDocumentDateEditing, setIsDocumentDateEditing] = useState(false);
  const [isLanguageEditing, setIsLanguageEditing] = useState(false);
  const [activeTab, setActiveTab] = useState<DetailTab>(
    location.pathname.endsWith('/chat') ? 'chat' : 'preview',
  );
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isTagPickerOpen, setIsTagPickerOpen] = useState(false);
  const [tagSearchValue, setTagSearchValue] = useState('');
  const [isCreateTagDialogOpen, setIsCreateTagDialogOpen] = useState(false);
  const [createTagNameValue, setCreateTagNameValue] = useState('');
  const [createTagColorValue, setCreateTagColorValue] = useState('#D8FF75');
  const [createTagDescriptionValue, setCreateTagDescriptionValue] = useState('');

  const documentBreadcrumbFolders = useMemo(() => {
    const folderId = documentQuery.data?.document.folderId;
    const folders = folderTreeQuery.data?.folders ?? [];

    if (!folderId) {
      return [];
    }

    const foldersById = new Map(folders.map(folder => [folder.id, folder]));
    const path: typeof folders = [];
    let current = foldersById.get(folderId);

    while (current) {
      path.unshift(current);
      current = current.parentId ? foldersById.get(current.parentId) : undefined;
    }

    return path;
  }, [documentQuery.data?.document.folderId, folderTreeQuery.data?.folders]);
  const searchReturnParams = useMemo(
    () => getSearchReturnParams(location.search as Record<string, unknown>),
    [location.search],
  );

  const documentBreadcrumbEntries = useMemo<VaultBreadcrumbEntry[]>(() => {
    if (isTrashDocumentRoute) {
      return [
        {
          key: 'trash',
          label: 'Trash',
          onClick: () => navigate({ to: ROUTES.trash }),
        },
        {
          key: `document-${documentId}`,
          label: documentQuery.data?.document.name ?? trashDocumentSummary?.name ?? 'Document',
        },
      ];
    }

    return [
      ...(searchReturnParams
        ? [{
            key: 'search-results',
            label: 'Search results',
            onClick: () => navigate({ to: ROUTES.search, search: searchReturnParams as any }),
          }]
        : [{ key: 'vaults', label: 'Vaults', to: ROUTES.vaults }]),
      {
        key: `vault-${vaultId}`,
        label: vaultQuery.data?.vault.name ?? 'Vault',
        onClick: () => navigate({ to: ROUTES.vaultRoot(vaultId) }),
      },
      ...documentBreadcrumbFolders.map(folder => ({
        key: `folder-${folder.id}`,
        label: folder.name,
        onClick: () => navigate({
          to: ROUTES.vaultRoot(vaultId),
          search: { folderId: folder.id } as any,
        }),
      })),
      {
        key: `document-${documentId}`,
        label: documentQuery.data?.document.name ?? 'Document',
      },
    ];
  }, [
    documentBreadcrumbFolders,
    documentId,
    documentQuery.data?.document.name,
    isTrashDocumentRoute,
    navigate,
    searchReturnParams,
    trashDocumentSummary?.name,
    vaultId,
    vaultQuery.data?.vault.name,
  ]);

  const documentWorkspaceHeader = useMemo(() => ({
    left: <VaultRouteBreadcrumbs entries={documentBreadcrumbEntries} />,
  }), [documentBreadcrumbEntries]);
  useWorkspaceHeader(documentWorkspaceHeader);

  function returnToSearchResults() {
    if (!searchReturnParams) {
      return;
    }

    navigate({ to: ROUTES.search, search: searchReturnParams as any });
  }

  useEffect(() => {
    if (location.pathname.endsWith('/chat')) {
      setActiveTab('chat');
    }
  }, [location.pathname]);

  useEffect(() => {
    async function handleUploadCompleted(event: Event) {
      const detail = (event as CustomEvent<{ vaultId?: string; documentId?: string }>).detail;

      if (detail?.vaultId !== vaultId || detail?.documentId !== documentId) {
        return;
      }

      await queryClient.invalidateQueries({
        queryKey: documentQueryKeys.detail(vaultId, documentId),
      });
    }

    window.addEventListener('arkivra:uploads-completed', handleUploadCompleted);
    return () => {
      window.removeEventListener('arkivra:uploads-completed', handleUploadCompleted);
    };
  }, [documentId, queryClient, vaultId]);

  const invalidateDocument = async () => {
    await queryClient.invalidateQueries({ queryKey: documentQueryKeys.all });
    await queryClient.invalidateQueries({ queryKey: tagQueryKeys.list() });
  };

  const invalidateDocumentTags = async () => {
    await queryClient.invalidateQueries({
      queryKey: documentQueryKeys.tags(vaultId, documentId),
    });
    await queryClient.invalidateQueries({
      queryKey: [...documentQueryKeys.all, 'list', vaultId],
    });
    await queryClient.invalidateQueries({ queryKey: tagQueryKeys.list() });
  };

  const renameMutation = useMutation({
    mutationFn: renameDocument,
    onSuccess: invalidateDocument,
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Could not rename document.');
    },
  });

  const dateMutation = useMutation({
    mutationFn: updateDocumentDate,
    onSuccess: invalidateDocument,
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Could not update document date.');
    },
  });

  const languageMutation = useMutation({
    mutationFn: updateDocumentLanguage,
    onSuccess: invalidateDocument,
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Could not update document language.');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: softDeleteDocument,
    onSuccess: async () => {
      toast.success('Document moved to trash.');
      setIsDeleteDialogOpen(false);
      await invalidateDocument();
      navigate({ to: parentRoute, replace: true });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Could not delete document.');
    },
  });

  const restoreMutation = useMutation({
    mutationFn: restoreDocument,
    onSuccess: async () => {
      toast.success('Document restored.');
      await invalidateDocument();
      if (isTrashDocumentRoute) {
        navigate({ to: ROUTES.trash, replace: true });
      }
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Could not restore document.');
    },
  });

  const assignTagMutation = useMutation({
    mutationFn: assignTagToDocument,
    onSuccess: async () => {
      await invalidateDocumentTags();
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Could not assign tag.');
    },
  });

  const createTagMutation = useMutation({
    mutationFn: createTag,
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Could not create tag.');
    },
  });

  const removeTagMutation = useMutation({
    mutationFn: removeTagFromDocument,
    onSuccess: async () => {
      await invalidateDocumentTags();
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Could not remove tag.');
    },
  });

  if (!vaultId || !documentId) {
    if (isTrashDocumentRoute && deletedDocumentsQuery.isLoading) {
      return <Text fontSize="sm" color="fg.muted">Loading document...</Text>;
    }

    return <Text fontSize="sm" color="fg.error">Invalid document route.</Text>;
  }

  if (documentQuery.isLoading || (isTrashDocumentRoute && deletedDocumentsQuery.isLoading)) {
    return <Text fontSize="sm" color="fg.muted">Loading document...</Text>;
  }

  if (documentQuery.isError || !documentQuery.data) {
    return <Text fontSize="sm" color="fg.error">Unable to load document.</Text>;
  }

  const document = documentQuery.data.document;
  const assignedTags = documentTagsQuery.data?.tags ?? [];
  const availableTags = (tagsQuery.data?.tags ?? []).filter(
    (tag) => !assignedTags.some((assigned) => assigned.id === tag.id),
  );
  const normalizedTagSearchValue = tagSearchValue.trim().toLowerCase();
  const filteredAvailableTags = availableTags.filter((tag) => {
    if (normalizedTagSearchValue.length === 0) {
      return true;
    }

    return tag.name.toLowerCase().includes(normalizedTagSearchValue);
  });
  const sortedFilteredAvailableTags = [...filteredAvailableTags].sort((a, b) =>
    a.name.localeCompare(b.name),
  );
  const selectedMatchingTags = [...assignedTags]
    .filter((tag) => {
      if (normalizedTagSearchValue.length === 0) {
        return true;
      }

      return tag.name.toLowerCase().includes(normalizedTagSearchValue);
    })
    .sort((a, b) => a.name.localeCompare(b.name));
  const hasExactTagMatch = availableTags.some(
    (tag) => tag.name.trim().toLowerCase() === normalizedTagSearchValue,
  );
  const inlineFileUrl = getDocumentInlineFileUrl({ vaultId, documentId, includeDeleted: isTrashDocumentRoute });
  const canPreview = (!document.isDeleted || isTrashDocumentRoute) && previewKind !== 'unsupported';
  const canPrint = !document.isDeleted && canPreview && previewKind !== 'markdown';
  const currentName = renameValue ?? document.name;
  const currentDocumentDate =
    documentDateValue ?? (document.documentDate ? document.documentDate.slice(0, 10) : '');
  const currentLanguage = languageValue ?? document.language?.code ?? 'unknown';
  const hasNameChanged = currentName.trim() !== document.name;
  const hasDocumentDateChanged =
    currentDocumentDate !== (document.documentDate ? document.documentDate.slice(0, 10) : '');
  const hasLanguageChanged = currentLanguage !== (document.language?.code ?? 'unknown');
  const isMetadataSaving = renameMutation.isPending || dateMutation.isPending || languageMutation.isPending;
  const normalizedCreateTagName = createTagNameValue.trim();
  const createTagDescription = createTagDescriptionValue.trim();
  const isCreateTagSaveDisabled =
    normalizedCreateTagName.length === 0 ||
    createTagMutation.isPending ||
    assignTagMutation.isPending;
  const displayContent = document.displayContent ?? document.content;
  const fallbackMarkdownContent = displayContent;
  const extractionStageLabel = getDocumentProcessingStageLabel(
    document.processingStatus,
    displayContent,
  );
  const extractedTextMessage = getDocumentProcessingStageDescription(
    document.processingStatus,
    displayContent,
  );
  const isExtractionActive = isDocumentProcessingActive(document.processingStatus);
  const detailActiveTab =
    isTrashDocumentRoute && (activeTab === 'chat' || activeTab === 'content')
      ? 'preview'
      : activeTab;

  async function handleMetadataSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const nextName = currentName.trim() || document.name;

    try {
      if (hasNameChanged) {
        await renameMutation.mutateAsync({ vaultId, documentId, name: nextName });
      }

      if (hasDocumentDateChanged) {
        await dateMutation.mutateAsync({
          vaultId,
          documentId,
          documentDate: currentDocumentDate ? new Date(currentDocumentDate).toISOString() : null,
        });
      }

      if (hasLanguageChanged) {
        await languageMutation.mutateAsync({
          vaultId,
          documentId,
          language: currentLanguage === 'unknown' ? null : currentLanguage,
        });
      }

      if (hasNameChanged || hasDocumentDateChanged || hasLanguageChanged) {
        toast.success('Metadata saved.');
        setRenameValue(null);
        setDocumentDateValue(null);
        setLanguageValue(null);
        setIsNameEditing(false);
        setIsDocumentDateEditing(false);
        setIsLanguageEditing(false);
      }
    } catch {}
  }

  function openCreateTagDialog(initialName: string) {
    setIsTagPickerOpen(false);
    setCreateTagNameValue(initialName);
    setCreateTagColorValue('#D8FF75');
    setCreateTagDescriptionValue('');
    setIsCreateTagDialogOpen(true);
  }

  function closeCreateTagDialog() {
    if (createTagMutation.isPending || assignTagMutation.isPending) {
      return;
    }

    setIsCreateTagDialogOpen(false);
  }

  async function handleCreateTagSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (normalizedCreateTagName.length === 0) {
      return;
    }

    try {
      const result = await createTagMutation.mutateAsync({
        name: normalizedCreateTagName,
        color: createTagColorValue,
        description: createTagDescription.length > 0 ? createTagDescription : null,
      });

      await assignTagMutation.mutateAsync({
        vaultId,
        documentId,
        tagId: result.tag.id,
      });
      setIsCreateTagDialogOpen(false);
      setIsTagPickerOpen(false);
      setTagSearchValue('');
    } catch {}
  }

  function handlePrintClick() {
    if (!canPrint) {
      return;
    }

    if (previewKind === 'pdf' || previewKind === 'text') {
      const frame = window.document.createElement('iframe');
      frame.style.position = 'fixed';
      frame.style.right = '0';
      frame.style.bottom = '0';
      frame.style.width = '0';
      frame.style.height = '0';
      frame.style.border = '0';
      frame.src = inlineFileUrl;
      frame.onload = () => {
        frame.contentWindow?.focus();
        frame.contentWindow?.print();
      };
      window.document.body.appendChild(frame);
      window.setTimeout(() => {
        frame.remove();
      }, 60_000);
      return;
    }

    if (previewKind === 'image') {
      const printWindow = window.open('', '_blank', 'noopener,noreferrer');

      if (printWindow === null) {
        toast.error('Could not open print dialog.');
        return;
      }

      printWindow.document.write(`
        <html>
          <head>
            <title>${document.name}</title>
            <style>
              body {
                margin: 0;
                display: flex;
                min-height: 100vh;
                align-items: center;
                justify-content: center;
                background: white;
              }
              img {
                max-width: 100%;
                max-height: 100vh;
                object-fit: contain;
              }
            </style>
          </head>
          <body>
            <img src="${inlineFileUrl}" alt="${document.name}" />
          </body>
        </html>
      `);
      printWindow.document.close();
      printWindow.onload = () => {
        printWindow.focus();
        printWindow.print();
      };
    }
  }

  return (
    <Flex
      as="section"
      direction="column"
      h="full"
      minH="0"
      gap="0"
      px={isTrashDocumentRoute ? { base: '4', lg: '6' } : undefined}
      py={isTrashDocumentRoute ? '4' : undefined}
      pb="0"
    >
      <Flex
        as="header"
        direction="column"
        align="stretch"
        gap="5"
        borderBottomWidth="1px"
        borderColor="border.subtle"
        pb="0"
      >
        <Flex align="center" justify="space-between" gap="4" pt={{ base: '1', md: '0' }}>
          <Flex align="center" gap="3" minW="0">
            <Heading
              as="h1"
              textStyle="xl"
              fontWeight="semibold"
              lineHeight="short"
              truncate
            >
              {document.name}
            </Heading>
            <Box
              as="span"
              flexShrink={0}
              rounded="md"
              bg="teal.subtle"
              px="2"
              py="1"
              fontSize="xs"
              fontWeight="medium"
              color="teal.fg"
            >
              Document
            </Box>
          </Flex>

          <Flex align="center" gap="2">
            {isTrashDocumentRoute ? (
              <Button type="button" size="sm" variant="outline" onClick={() => navigate({ to: ROUTES.trash })}>
                <ArrowLeft size={16} />
                Trash
              </Button>
            ) : null}

            {searchReturnParams ? (
              <Button type="button" size="sm" variant="outline" onClick={returnToSearchResults}>
                <ArrowLeft size={16} />
                Search results
              </Button>
            ) : null}

            <DropdownMenu modal={false}>
              <DropdownMenuTrigger asChild>
                <ActionMenuTriggerButton label={`Open actions for ${document.name}`} />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" minW="56">
                {!isTrashDocumentRoute ? (
                  <DropdownMenuItem asChild>
                    <a href={getDocumentDownloadUrl({ vaultId, documentId })}>
                      <ActionMenuItemIcon icon={Download} />
                      Download original
                    </a>
                  </DropdownMenuItem>
                ) : null}
                {canPrint ? (
                  <DropdownMenuItem onSelect={handlePrintClick}>
                    <ActionMenuItemIcon icon={Printer} />
                    Print
                  </DropdownMenuItem>
                ) : null}
                {!isTrashDocumentRoute || document.isDeleted ? <DropdownMenuSeparator /> : null}
                {document.isDeleted ? (
                  <DropdownMenuItem
                    disabled={restoreMutation.isPending}
                    onSelect={() => {
                      restoreMutation.mutate({ vaultId, documentId });
                    }}
                  >
                    <ActionMenuItemIcon icon={RotateCcw} />
                    {restoreMutation.isPending ? 'Restoring...' : 'Restore document'}
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem
                    color="fg.error"
                    _hover={{ bg: 'bg.error', color: 'fg.error' }}
                    _focus={{ bg: 'bg.error', color: 'fg.error' }}
                    disabled={deleteMutation.isPending}
                    onSelect={() => setIsDeleteDialogOpen(true)}
                  >
                    <ActionMenuItemIcon icon={Trash2} tone="destructive" />
                    Move to trash
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </Flex>
        </Flex>

        <Flex align="center" justify="space-between" gap="3" overflowX="auto">
          <Tabs value={detailActiveTab} onValueChange={(value) => setActiveTab(value as DetailTab)}>
            <TabsList gap="2" rounded="0" bg="transparent" p="0">
              <TabsTrigger
                value="preview"
                {...documentTabTriggerStyles}
              >
                <ImageIcon size={16} />
                Preview
              </TabsTrigger>
              {!isTrashDocumentRoute ? (
                <TabsTrigger
                  value="content"
                  {...documentTabTriggerStyles}
                >
                  <ScanText size={16} />
                  Extracted text
                </TabsTrigger>
              ) : null}
              <TabsTrigger
                value="metadata"
                {...documentTabTriggerStyles}
              >
                <Tags size={16} />
                Metadata
              </TabsTrigger>
              {!isTrashDocumentRoute ? (
                <TabsTrigger
                  value="chat"
                  {...documentTabTriggerStyles}
                >
                  <MessageSquare size={16} />
                  Chat
                </TabsTrigger>
              ) : null}
            </TabsList>
          </Tabs>
        </Flex>
      </Flex>

      <Box
        flex="1"
        h="full"
        minH="0"
        pt={detailActiveTab === 'chat' ? '0' : '5'}
      >
            {detailActiveTab === 'preview' ? (
              <Flex h="full" minH="0" direction="column" gap="4">
                {previewKind === 'pdf' && canPreview ? (
                  <PdfPreviewFrame
                    key={inlineFileUrl}
                    src={inlineFileUrl}
                    vaultId={vaultId}
                    documentId={documentId}
                    onPrint={handlePrintClick}
                    translationsDisabled={isTrashDocumentRoute}
                    sourceLanguage={document.language}
                  />
                ) : null}

                {previewKind === 'image' && canPreview ? (
                  <Box h="full" minH={{ base: '720px', md: '0' }} overflow="hidden" rounded="lg" bg="bg.subtle" p="4">
                    <Flex
                      h="full"
                      align="center"
                      justify="center"
                      rounded="lg"
                      bg="white"
                      p="8"
                    >
                      <chakra.img
                        src={inlineFileUrl}
                        alt={document.name}
                        maxH="full"
                        w="auto"
                        maxW="full"
                        objectFit="contain"
                      />
                    </Flex>
                  </Box>
                ) : null}

                {previewKind === 'text' && canPreview ? (
                  <Box h="full" minH={{ base: '720px', md: '0' }} overflow="hidden" rounded="lg" bg="bg.subtle" p="2">
                    <chakra.iframe
                      title="Text preview"
                      src={inlineFileUrl}
                      h="full"
                      w="full"
                      rounded="lg"
                      bg="white"
                    />
                  </Box>
                ) : null}

                {previewKind === 'markdown' && canPreview ? (
                  <Box h="full" minH={{ base: '720px', md: '0' }} overflow="hidden" rounded="lg" bg="bg.subtle" p="2">
                    <Box
                      h="full"
                      overflow="auto"
                      rounded="lg"
                      borderWidth="1px"
                      borderColor="border.subtle"
                      bg="bg.surface"
                      px={{ base: '4', md: '8' }}
                      py={{ base: '5', md: '7' }}
                    >
                      {markdownSourceQuery.isLoading && markdownSourceQuery.data === undefined ? (
                        <Text fontSize="sm" color="fg.muted">Loading Markdown preview...</Text>
                      ) : markdownSourceQuery.isError && fallbackMarkdownContent.length === 0 ? (
                        <Text fontSize="sm" color="fg.error">Unable to load Markdown preview.</Text>
                      ) : (
                        <DocumentMarkdownPreview markdown={markdownSourceQuery.data ?? fallbackMarkdownContent} />
                      )}
                    </Box>
                  </Box>
                ) : null}

                {previewKind === 'unsupported' || (document.isDeleted && !isTrashDocumentRoute) ? (
                  <Box h="full" minH={{ base: '720px', md: '0' }} rounded="lg" bg="bg.subtle" p="6">
                    <Flex
                      h="full"
                      direction="column"
                      align="center"
                      justify="center"
                      gap="4"
                      rounded="lg"
                      borderWidth="1px"
                      borderStyle="dashed"
                      borderColor="border.subtle"
                      bg="bg.surface"
                      px="6"
                      textAlign="center"
                    >
                      <ImageIcon size={40} />
                      <Box>
                        <Text fontSize="sm" fontWeight="semibold" color="fg">
                          Preview unavailable
                        </Text>
                        <Text maxW="xl" fontSize="sm" lineHeight="6" color="fg.muted">
                          {document.isDeleted
                            ? 'Preview is disabled for documents in trash. Restore the document to preview or print it again.'
                            : 'This file type is supported for storage and extraction, but Arkivra does not render a faithful in-browser preview for it yet.'}
                        </Text>
                      </Box>
                    </Flex>
                  </Box>
                ) : null}
              </Flex>
            ) : null}

            {detailActiveTab === 'content' ? (
              <Flex direction="column" gap="3">
                <Flex flexWrap="wrap" align="center" gap="3">
                  <Box
                    as="span"
                    display="inline-flex"
                    alignItems="center"
                    rounded="full"
                    px="3"
                    py="1"
                    fontSize="xs"
                    fontWeight="semibold"
                    textTransform="uppercase"
                    letterSpacing="wide"
                    bg={
                      document.processingStatus === 'failed'
                        ? 'bg.error'
                        : isExtractionActive
                          ? 'bg.warning'
                          : 'bg.success'
                    }
                    color={
                      document.processingStatus === 'failed'
                        ? 'fg.error'
                        : isExtractionActive
                          ? 'fg.warning'
                          : 'fg.success'
                    }
                  >
                    {extractionStageLabel}
                  </Box>
                  <Text fontSize="sm" lineHeight="6" color="fg.muted">
                    {isExtractionActive
                      ? 'The document detail view polls the backend while processing is in progress.'
                      : 'OCR and extracted text appear here after processing completes.'}
                  </Text>
                </Flex>
                <Box
                  h={{ base: '82vh', md: '820px' }}
                  overflow="auto"
                  rounded="lg"
                  bg="bg.subtle"
                  p="5"
                  fontSize="sm"
                  whiteSpace="pre-wrap"
                  wordBreak="break-word"
                  color="fg"
                >
                  {extractedTextMessage}
                </Box>
              </Flex>
            ) : null}

            {detailActiveTab === 'metadata' ? (
              <chakra.form minH="820px" onSubmit={handleMetadataSave}>
                <Flex
                  direction={{ base: 'column', sm: 'row' }}
                  flexWrap="wrap"
                  gap="4"
                  fontSize="sm"
                >
                  <Box flex="1 1 calc(50% - 0.5rem)" rounded="lg" bg="bg.subtle" p="4">
                    <Text color="fg.muted">Display name</Text>
                    {isNameEditing ? (
                      <Input
                        id="document-name"
                        type="text"
                        value={currentName}
                        mt="2"
                        borderColor="border.subtle"
                        bg="bg.surface"
                        autoFocus
                        onChange={(event) => setRenameValue(event.target.value)}
                      />
                    ) : (
                      <Flex align="center" justify="space-between" gap="3" mt="2">
                        <Text fontWeight="medium" color="fg">
                          {document.name}
                        </Text>
                        {!isTrashDocumentRoute ? (
                          <chakra.button
                            type="button"
                            aria-label="Edit display name"
                            display="inline-flex"
                            boxSize="8"
                            flexShrink={0}
                            alignItems="center"
                            justifyContent="center"
                            rounded="lg"
                            color="fg.muted"
                            transition="colors"
                            _hover={{ bg: 'bg.surface', color: 'fg' }}
                            onClick={() => setIsNameEditing(true)}
                          >
                            <Pencil size={16} />
                          </chakra.button>
                        ) : null}
                      </Flex>
                    )}
                  </Box>
                  <Box flex="1 1 calc(50% - 0.5rem)" rounded="lg" bg="bg.subtle" p="4">
                    <Flex align="center" gap="2" color="fg.muted">
                      <Text>Document date</Text>
                      <InfoTooltip
                        label="More info about document date"
                        contentClassName="max-w-72"
                        content="The date the document was issued for. For example, an invoice dated 21.01.2026 has that document date even if it was uploaded on 24.04.2026."
                      />
                    </Flex>
                    {isDocumentDateEditing ? (
                      <Input
                        id="document-date"
                        type="date"
                        value={currentDocumentDate}
                        mt="2"
                        borderColor="border.subtle"
                        bg="bg.surface"
                        autoFocus
                        onChange={(event) => setDocumentDateValue(event.target.value)}
                      />
                    ) : (
                      <Flex align="center" justify="space-between" gap="3" mt="2">
                        <Text fontWeight="medium" color="fg">
                          {formatDate(document.documentDate)}
                        </Text>
                        {!isTrashDocumentRoute ? (
                          <chakra.button
                            type="button"
                            aria-label="Edit document date"
                            display="inline-flex"
                            boxSize="8"
                            flexShrink={0}
                            alignItems="center"
                            justifyContent="center"
                            rounded="lg"
                            color="fg.muted"
                            transition="colors"
                            _hover={{ bg: 'bg.surface', color: 'fg' }}
                            onClick={() => setIsDocumentDateEditing(true)}
                          >
                            <Pencil size={16} />
                          </chakra.button>
                        ) : null}
                      </Flex>
                    )}
                  </Box>
                  <Box flex="1 1 calc(50% - 0.5rem)" rounded="lg" bg="bg.subtle" p="4">
                    <Text color="fg.muted">Original file</Text>
                    <Text mt="2" fontWeight="medium" color="fg">
                      {document.originalName}
                    </Text>
                  </Box>
                  <Box flex="1 1 calc(50% - 0.5rem)" rounded="lg" bg="bg.subtle" p="4">
                    <Text color="fg.muted">File size</Text>
                    <Text mt="2" fontWeight="medium" color="fg">
                      {formatBytes(document.originalSize)}
                    </Text>
                  </Box>
                  <Box flex="1 1 calc(50% - 0.5rem)" rounded="lg" bg="bg.subtle" p="4">
                    <Text color="fg.muted">Format</Text>
                    <Text mt="2" fontWeight="medium" color="fg">
                      {document.mimeType}
                    </Text>
                  </Box>
                  <Box flex="1 1 calc(50% - 0.5rem)" rounded="lg" bg="bg.subtle" p="4">
                    <Text color="fg.muted">Source language</Text>
                    {isLanguageEditing ? (
                      <Select
                        value={currentLanguage}
                        onValueChange={setLanguageValue}
                        positioning={{ sameWidth: true }}
                      >
                        <SelectTrigger mt="2" borderColor="border.subtle" bg="bg.surface">
                          <SelectValue placeholder="Select source language" />
                        </SelectTrigger>
                        <SelectContent>
                          {editableDocumentLanguages.map(language => (
                            <SelectItem key={language.value} value={language.value}>
                              {language.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Flex align="center" justify="space-between" gap="3" mt="2">
                        <Text fontWeight="medium" color="fg">
                          {getDocumentLanguageLabel(document.language)}
                        </Text>
                        {!isTrashDocumentRoute ? (
                          <chakra.button
                            type="button"
                            aria-label="Edit source language"
                            display="inline-flex"
                            boxSize="8"
                            flexShrink={0}
                            alignItems="center"
                            justifyContent="center"
                            rounded="lg"
                            color="fg.muted"
                            transition="colors"
                            _hover={{ bg: 'bg.surface', color: 'fg' }}
                            onClick={() => setIsLanguageEditing(true)}
                          >
                            <Pencil size={16} />
                          </chakra.button>
                        ) : null}
                      </Flex>
                    )}
                  </Box>
                  <Box flex="1 1 calc(50% - 0.5rem)" rounded="lg" bg="bg.subtle" p="4">
                    <Text color="fg.muted">Uploaded by</Text>
                    <Text mt="2" fontWeight="medium" color="fg">
                      {document.createdBy ?? 'Unknown'}
                    </Text>
                  </Box>
                  <Box flex="1 1 calc(50% - 0.5rem)" rounded="lg" bg="bg.subtle" p="4">
                    <Text color="fg.muted">Uploaded at</Text>
                    <Text mt="2" fontWeight="medium" color="fg">
                      {formatDate(document.createdAt)}
                    </Text>
                  </Box>
                  <Box flex="1 1 calc(50% - 0.5rem)" rounded="lg" bg="bg.subtle" p="4">
                    <Text color="fg.muted">Last updated</Text>
                    <Text mt="2" fontWeight="medium" color="fg">
                      {formatDate(document.updatedAt)}
                    </Text>
                  </Box>
                </Flex>

                <Box rounded="lg" bg="bg.subtle" p="4" mt="4">
                  <Text color="fg.muted" mb="3">Tags</Text>
                  <Flex flexWrap="wrap" align="center" gap="2">
                    {assignedTags.length === 0 ? (
                      <Text fontSize="sm" color="fg.muted">No tags assigned.</Text>
                    ) : null}
                    {assignedTags.map((tag) => (
                      <Flex
                        key={tag.id}
                        display="inline-flex"
                        h="8"
                        align="center"
                        gap="2"
                        rounded="full"
                        bg="bg.surface"
                        px="3"
                        fontSize="sm"
                        lineHeight="none"
                        color="fg"
                      >
                        <Box aria-hidden="true" boxSize="1.5" rounded="full" bg={tag.color ?? '#64748b'} />
                        {tag.name}
                        {!isTrashDocumentRoute ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            aria-label={`Remove ${tag.name}`}
                            rounded="full"
                            color="fg.muted"
                            _hover={{ bg: 'bg.subtle', color: 'fg' }}
                            h="6"
                            w="6"
                            mr="-1"
                            onClick={() => {
                              removeTagMutation.mutate({ vaultId, documentId, tagId: tag.id });
                            }}
                          >
                            <X size={14} />
                          </Button>
                        ) : null}
                      </Flex>
                    ))}
                    {!isTrashDocumentRoute ? (
                      <DropdownMenu
                        modal={false}
                        open={isTagPickerOpen}
                        onOpenChange={(open) => {
                          setIsTagPickerOpen(open);
                          if (!open) {
                            setTagSearchValue('');
                          }
                        }}
                      >
                        <DropdownMenuTrigger asChild>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            aria-label="Add tag"
                            h="8"
                            w="8"
                            rounded="full"
                            bg="bg.surface"
                            color="fg.muted"
                            _hover={{ bg: 'bg.subtle', color: 'fg' }}
                          >
                            <Plus size={16} />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent
                          align="start"
                          minW="80"
                          overflow="hidden"
                          rounded="xl"
                          bg="bg.surface"
                          p="0"
                          onCloseAutoFocus={(event) => {
                            event.preventDefault();
                          }}
                        >
                        <Box borderBottomWidth="1px" borderColor="border.subtle" p="2">
                          <Field>
                            <FieldLabel htmlFor="document-detail-tag-filter" srOnly>
                              Filter tags
                            </FieldLabel>
                            <Input
                              id="document-detail-tag-filter"
                              type="text"
                              value={tagSearchValue}
                              onChange={(event) => setTagSearchValue(event.target.value)}
                              placeholder="Filter tags..."
                              h="10"
                              borderColor="transparent"
                              px="3"
                              focusRing="none"
                              autoFocus
                            />
                          </Field>
                        </Box>
                        <Box maxH="72" overflow="auto" py="1">
                          {selectedMatchingTags.map((tag) => (
                            <DropdownMenuCheckboxItem
                              key={tag.id}
                              checked
                              onSelect={(event) => event.preventDefault()}
                              onCheckedChange={() => {
                                removeTagMutation.mutate({ vaultId, documentId, tagId: tag.id });
                              }}
                            >
                              <Box aria-hidden="true" boxSize="2" rounded="full" bg={tag.color ?? '#64748b'} />
                              <Text flex="1" truncate>{tag.name}</Text>
                            </DropdownMenuCheckboxItem>
                          ))}
                          {selectedMatchingTags.length > 0 && sortedFilteredAvailableTags.length > 0 ? (
                            <DropdownMenuSeparator />
                          ) : null}
                          {sortedFilteredAvailableTags.map((tag) => (
                            <DropdownMenuCheckboxItem
                              key={tag.id}
                              checked={false}
                              onSelect={(event) => event.preventDefault()}
                              onCheckedChange={() => {
                                assignTagMutation.mutate({ vaultId, documentId, tagId: tag.id });
                              }}
                            >
                              <Box aria-hidden="true" boxSize="2" rounded="full" bg={tag.color ?? '#64748b'} />
                              <Text flex="1" truncate>{tag.name}</Text>
                            </DropdownMenuCheckboxItem>
                          ))}
                          {normalizedTagSearchValue.length > 0 && !hasExactTagMatch ? (
                            <DropdownMenuItem onSelect={() => openCreateTagDialog(tagSearchValue.trim())}>
                              <Plus size={16} />
                              <Text flex="1" truncate>{`Create new tag "${tagSearchValue.trim()}"`}</Text>
                            </DropdownMenuItem>
                          ) : null}
                          {selectedMatchingTags.length === 0 && sortedFilteredAvailableTags.length === 0 ? (
                            normalizedTagSearchValue.length === 0 ? (
                              <Text px="4" py="3" fontSize="sm" color="fg.muted">
                                All tags are already assigned.
                              </Text>
                            ) : !hasExactTagMatch ? null : (
                              <Text px="4" py="3" fontSize="sm" color="fg.muted">No matching tags.</Text>
                            )
                          ) : null}
                        </Box>
                      </DropdownMenuContent>
                    </DropdownMenu>
                    ) : null}
                  </Flex>
                </Box>

                {!isTrashDocumentRoute && (isNameEditing || isDocumentDateEditing || isLanguageEditing) ? (
                  <SaveButton
                    type="submit"
                    mt="5"
                    disabled={isMetadataSaving || (!hasNameChanged && !hasDocumentDateChanged && !hasLanguageChanged)}
                  >
                    {isMetadataSaving ? 'Saving...' : 'Save changes'}
                  </SaveButton>
                ) : null}
              </chakra.form>
            ) : null}

            {detailActiveTab === 'chat' ? (
              <ChatWorkspace
                scope={{ vaultId, documentId }}
                documentName={document.name}
                inputPlaceholder="Ask about this document..."
                heightClassName="h-full"
              />
            ) : null}
        </Box>

      <ChakraDialog.Root
        open={isDeleteDialogOpen}
        onOpenChange={(e) => {
          if (!deleteMutation.isPending) {
            setIsDeleteDialogOpen(e.open);
          }
        }}
        size={{ mdDown: 'full', md: 'lg' }}
      >
        <Portal>
          <ChakraDialog.Backdrop />
          <ChakraDialog.Positioner>
            <ChakraDialog.Content>
              <ChakraDialog.Header>
                <ChakraDialog.Title>{`Move "${document.name}" to trash?`}</ChakraDialog.Title>
                <ChakraDialog.CloseTrigger asChild>
                  <CloseButton size="sm" />
                </ChakraDialog.CloseTrigger>
              </ChakraDialog.Header>
              <ChakraDialog.Body>
                <Text color="fg.muted" fontSize="sm">
                  This document will be removed from the active vault, but it is recoverable from Trash
                  until it is permanently removed manually or automatically after 30 days.
                </Text>
              </ChakraDialog.Body>
              <ChakraDialog.Footer>
                <ChakraDialog.ActionTrigger asChild>
                  <Button type="button" variant="outline" disabled={deleteMutation.isPending} onClick={() => setIsDeleteDialogOpen(false)}>
                    Cancel
                  </Button>
                </ChakraDialog.ActionTrigger>
                <DeleteButton type="button" disabled={deleteMutation.isPending} onClick={() => { deleteMutation.mutate({ vaultId, documentId }); }}>
                  {deleteMutation.isPending ? 'Moving...' : 'Move to trash'}
                </DeleteButton>
              </ChakraDialog.Footer>
            </ChakraDialog.Content>
          </ChakraDialog.Positioner>
        </Portal>
      </ChakraDialog.Root>

      <TagDialog
        isOpen={isCreateTagDialogOpen}
        title="Create tag"
        submitLabel="Create tag"
        pendingLabel="Creating..."
        closeLabel="Close create tag dialog"
        isPending={createTagMutation.isPending || assignTagMutation.isPending}
        isSubmitDisabled={isCreateTagSaveDisabled}
        nameValue={createTagNameValue}
        colorValue={createTagColorValue}
        descriptionValue={createTagDescriptionValue}
        onNameChange={setCreateTagNameValue}
        onColorChange={setCreateTagColorValue}
        onDescriptionChange={setCreateTagDescriptionValue}
        onClose={closeCreateTagDialog}
        onSubmit={handleCreateTagSubmit}
      />
    </Flex>
  );
}

import { useEffect, useMemo, useRef, useState } from 'react';
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';
import { Document as PdfDocument, Page as PdfPage, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/TextLayer.css';
import {
  Box,
  CloseButton,
  Flex,
  Input,
  Menu as ChakraMenu,
  Portal,
  Spinner,
  Text,
} from '@chakra-ui/react';
import { ChevronLeft, ChevronRight, Languages, Printer, ZoomIn, ZoomOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { translateDocument } from '@/features/documents/documents.api';
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

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();

const pdfPreviewRevealDelayMs = 120;
const pdfPreviewFadeMs = 420;
const pdfPreviewPadding = 32;
const pdfPreviewToolbarMinHeight = 64;
const pdfPreviewCommitCoverDelayMs = 120;
const pdfPreviewMinZoom = 0.5;
const pdfPreviewMaxZoom = 3;
const pdfPreviewZoomStep = 0.1;

type PdfZoomMode = 'fit-page' | 'fit-width' | 'actual' | 'custom';

function clampPdfZoom(value: number) {
  return Math.min(Math.max(value, pdfPreviewMinZoom), pdfPreviewMaxZoom);
}

const translationLanguages: Array<{
  value: DocumentTranslationLanguage;
  label: string;
  flag: string;
}> = [
  { value: 'de', label: 'German', flag: '🇩🇪' },
  { value: 'en', label: 'English', flag: '🇬🇧' },
];

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
  return (
    translationLanguages.find((item) => item.value === language)?.label ?? language.toUpperCase()
  );
}

function getTranslationTargetLanguages(
  sourceLanguage: DocumentLanguageMetadata | null | undefined,
) {
  const sourceCode = sourceLanguage?.code.toLocaleLowerCase().split('-')[0];

  if (sourceCode === undefined) {
    return translationLanguages;
  }

  return translationLanguages.filter((language) => language.value !== sourceCode);
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

function isPdfTextLayerTarget(target: EventTarget | null) {
  return (
    target instanceof Element &&
    target.closest('.react-pdf__Page__textContent span, .textLayer span') !== null
  );
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
  language: (typeof translationLanguages)[number];
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

export function PdfPreviewFrame({
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
  const toolbarRef = useRef<HTMLDivElement | null>(null);
  const visiblePageRef = useRef<HTMLDivElement | null>(null);
  const activeTranslationControllerRef = useRef<AbortController | null>(null);
  const revealTimeoutRef = useRef<number | null>(null);
  const transitionTimeoutRef = useRef<number | null>(null);
  const commitCoverTimeoutRef = useRef<number | null>(null);
  const requestedPageNumberRef = useRef(1);
  const suppressTextSelectionMenuRef = useRef(false);
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });
  const [toolbarHeight, setToolbarHeight] = useState(pdfPreviewToolbarMinHeight);
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
  const [pageContextMenu, setPageContextMenu] = useState<{
    open: boolean;
    point: PdfMenuPoint;
  } | null>(null);
  const [textSelectionMenu, setTextSelectionMenu] = useState<TextSelectionMenuState | null>(null);
  const [visualSelectionMenu, setVisualSelectionMenu] = useState<VisualSelectionMenuState | null>(
    null,
  );
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

  useEffect(() => {
    const toolbarElement = toolbarRef.current;

    if (!toolbarElement) {
      return undefined;
    }

    function updateToolbarHeight(element: HTMLDivElement) {
      const nextHeight = Math.max(
        Math.ceil(element.getBoundingClientRect().height),
        pdfPreviewToolbarMinHeight,
      );
      setToolbarHeight((currentHeight) =>
        currentHeight === nextHeight ? currentHeight : nextHeight,
      );
    }

    updateToolbarHeight(toolbarElement);
    const observer = new ResizeObserver(() => updateToolbarHeight(toolbarElement));
    observer.observe(toolbarElement);

    return () => {
      observer.disconnect();
    };
  }, []);

  useEffect(
    () => () => {
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
    },
    [],
  );

  requestedPageNumberRef.current = pageNumber;

  useEffect(() => {
    setTextSelectionMenu(null);
    setVisualSelectionMenu(null);
    setVisualSelectionRect(null);
    setAreaDrag(null);
  }, [src, visiblePageNumber]);

  const pageViewportWidth = Math.max(viewportSize.width - pdfPreviewPadding * 2, 0);
  const pageViewportHeight = Math.max(
    viewportSize.height - toolbarHeight - pdfPreviewPadding * 2,
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
        ? (pageNaturalWidth ?? basePageWidth)
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
    updateCustomZoom(pageWidth / basePageWidth - pdfPreviewZoomStep);
  }

  function zoomIn() {
    updateCustomZoom(pageWidth / basePageWidth + pdfPreviewZoomStep);
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

      setTranslationPane((current) =>
        controller.signal.aborted && current === null
          ? null
          : {
              ...pendingState,
              status: 'success',
              text: response.translation.text,
              provider: response.translation.provider,
              model: response.translation.model,
            },
      );
    } catch (error) {
      setTranslationPane((current) =>
        controller.signal.aborted && current === null
          ? null
          : {
              ...pendingState,
              status: 'error',
              error: getAbortAwareError(error),
            },
      );
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

      setTranslationPane((current) =>
        controller.signal.aborted && current === null
          ? null
          : {
              ...pendingState,
              status: 'success',
              text: response.translation.text,
              provider: response.translation.provider,
              model: response.translation.model,
            },
      );
    } catch (error) {
      setTranslationPane((current) =>
        controller.signal.aborted && current === null
          ? null
          : {
              ...pendingState,
              status: 'error',
              error: getAbortAwareError(error),
            },
      );
    } finally {
      finishTranslation(controller);
    }
  }

  async function runVisualSelectionTranslation(
    targetLanguage: DocumentTranslationLanguage,
    rect: NormalizedRect,
  ) {
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
    if (!isReady || translationsDisabled) {
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
    if (suppressTextSelectionMenuRef.current) {
      suppressTextSelectionMenuRef.current = false;
      return;
    }

    if (!isReady || translationsDisabled) {
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
    if (
      event.button !== 0 ||
      !isReady ||
      translationsDisabled ||
      visiblePageRef.current === null ||
      isPdfTextLayerTarget(event.target)
    ) {
      return;
    }

    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    suppressTextSelectionMenuRef.current = true;
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
    if (
      areaDrag === null ||
      visiblePageRef.current === null ||
      areaDrag.pointerId !== event.pointerId
    ) {
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
    if (
      areaDrag === null ||
      visiblePageRef.current === null ||
      areaDrag.pointerId !== event.pointerId
    ) {
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

  const activeAreaRect =
    areaDrag !== null
      ? createNormalizedRect(areaDrag.start, areaDrag.current)
      : visualSelectionRect;

  return (
    <Flex
      h="full"
      minH={{ base: '720px', md: '0' }}
      gap="3"
      direction={{ base: 'column', xl: 'row' }}
      overflow="hidden"
    >
      <Box
        ref={viewportRef}
        flex="1 1 0"
        minW="0"
        position="relative"
        h="full"
        overflow="hidden"
        rounded="lg"
        borderWidth="1px"
        borderColor="border.surface"
        bg="bg.surface"
      >
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
            <Flex
              align="center"
              gap="1"
              rounded="md"
              borderWidth="1px"
              borderColor="border.surface"
              p="0.5"
            >
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
            top={`${toolbarHeight}px`}
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
        <Box
          position="absolute"
          insetX="0"
          top={`${toolbarHeight}px`}
          bottom="0"
          overflow="auto"
          bg="bg.surface"
          opacity={isReady ? 1 : 0}
          pointerEvents={isReady ? 'auto' : 'none'}
          transform={isReady ? 'scale(1)' : 'scale(0.992)'}
          transformOrigin="center"
          transition={`opacity ${pdfPreviewFadeMs}ms ease, transform ${pdfPreviewFadeMs}ms ease`}
          aria-hidden={!isReady}
          willChange="opacity, transform"
        >
          <Flex
            w="max-content"
            minW="full"
            h="max-content"
            minH="full"
            align="center"
            justify="center"
            p={`${pdfPreviewPadding}px`}
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
                onPointerDown={handleAreaPointerDown}
                onPointerMove={handleAreaPointerMove}
                onPointerUp={handleAreaPointerUp}
                onPointerCancel={() => setAreaDrag(null)}
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
                        onRenderSuccess={() =>
                          handlePendingPageRenderSuccess(pendingLayerPageNumber)
                        }
                        onRenderError={() => setLoadError(true)}
                      />
                    </Box>
                  ) : null}
                </PdfDocument>
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
          borderColor="border.surface"
          bg="bg.surface"
        >
          <Flex
            h="14"
            align="center"
            justify="space-between"
            gap="3"
            borderBottomWidth="1px"
            borderColor="border.surface"
            px="4"
          >
            <Box minW="0">
              <Text fontSize="sm" fontWeight="semibold" color="fg" truncate>
                {getTranslationSourceLabel(translationPane.sourceType)} translation
              </Text>
              <Text fontSize="xs" color="fg.muted" truncate>
                Page {translationPane.pageNumber} to{' '}
                {getTranslationLanguageLabel(translationPane.targetLanguage)}
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
              <Flex
                minH="40"
                align="center"
                justify="center"
                direction="column"
                gap="3"
                textAlign="center"
              >
                <Spinner size="sm" color="teal.solid" />
                <Text fontSize="sm" color="fg.muted">
                  Translating {getTranslationSourceLabel(translationPane.sourceType).toLowerCase()}
                  ...
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
        onOpenChange={(event) =>
          setPageContextMenu((current) =>
            current === null ? null : { ...current, open: event.open },
          )
        }
        positioning={{
          placement: 'bottom-start',
          hideWhenDetached: true,
          getAnchorRect: () => getMenuAnchorRect(pageContextMenu?.point),
        }}
      >
        <Portal>
          <ChakraMenu.Positioner>
            <ChakraMenu.Content
              zIndex="dropdown"
              minW="13rem"
              rounded="lg"
              borderWidth="1px"
              borderColor="border.surface"
              bg="bg.surface"
              p="1.5"
              shadow="lg"
            >
              <ChakraMenu.Root positioning={{ placement: 'right-start', gutter: 2 }}>
                <ChakraMenu.TriggerItem
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
                >
                  <Languages size={16} />
                  <Text flex="1">Translate Page</Text>
                  <ChevronRight size={16} />
                </ChakraMenu.TriggerItem>
                <Portal>
                  <ChakraMenu.Positioner>
                    <ChakraMenu.Content
                      zIndex="dropdown"
                      minW="10rem"
                      rounded="lg"
                      borderWidth="1px"
                      borderColor="border.surface"
                      bg="bg.surface"
                      p="1.5"
                      shadow="lg"
                    >
                      {availableTranslationLanguages.map((language) => (
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
        onOpenChange={(event) =>
          setTextSelectionMenu((current) =>
            current === null ? null : { ...current, open: event.open },
          )
        }
        positioning={{
          placement: 'bottom-start',
          hideWhenDetached: true,
          getAnchorRect: () => getMenuAnchorRect(textSelectionMenu?.point),
        }}
      >
        <Portal>
          <ChakraMenu.Positioner>
            <ChakraMenu.Content
              zIndex="dropdown"
              minW="14rem"
              rounded="lg"
              borderWidth="1px"
              borderColor="border.surface"
              bg="bg.surface"
              p="1.5"
              shadow="lg"
            >
              <ChakraMenu.Root positioning={{ placement: 'right-start', gutter: 2 }}>
                <ChakraMenu.TriggerItem
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
                >
                  <Languages size={16} />
                  <Text flex="1">Translate Selection</Text>
                  <ChevronRight size={16} />
                </ChakraMenu.TriggerItem>
                <Portal>
                  <ChakraMenu.Positioner>
                    <ChakraMenu.Content
                      zIndex="dropdown"
                      minW="10rem"
                      rounded="lg"
                      borderWidth="1px"
                      borderColor="border.surface"
                      bg="bg.surface"
                      p="1.5"
                      shadow="lg"
                    >
                      {availableTranslationLanguages.map((language) => (
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
        onOpenChange={(event) =>
          setVisualSelectionMenu((current) =>
            current === null ? null : { ...current, open: event.open },
          )
        }
        positioning={{
          placement: 'bottom-start',
          hideWhenDetached: true,
          getAnchorRect: () => getMenuAnchorRect(visualSelectionMenu?.point),
        }}
      >
        <Portal>
          <ChakraMenu.Positioner>
            <ChakraMenu.Content
              zIndex="dropdown"
              minW="14rem"
              rounded="lg"
              borderWidth="1px"
              borderColor="border.surface"
              bg="bg.surface"
              p="1.5"
              shadow="lg"
            >
              <ChakraMenu.Root positioning={{ placement: 'right-start', gutter: 2 }}>
                <ChakraMenu.TriggerItem
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
                >
                  <Languages size={16} />
                  <Text flex="1">Translate Selection</Text>
                  <ChevronRight size={16} />
                </ChakraMenu.TriggerItem>
                <Portal>
                  <ChakraMenu.Positioner>
                    <ChakraMenu.Content
                      zIndex="dropdown"
                      minW="10rem"
                      rounded="lg"
                      borderWidth="1px"
                      borderColor="border.surface"
                      bg="bg.surface"
                      p="1.5"
                      shadow="lg"
                    >
                      {availableTranslationLanguages.map((language) => (
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
                              void runVisualSelectionTranslation(
                                language.value,
                                visualSelectionMenu.rect,
                              );
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

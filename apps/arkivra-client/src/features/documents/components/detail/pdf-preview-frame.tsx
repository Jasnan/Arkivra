import { useEffect, useMemo, useRef, useState } from 'react';
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';
import { Document as PdfDocument, Page as PdfPage, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/TextLayer.css';
import { Box, Flex, Text } from '@chakra-ui/react';
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
import type { NormalizedRect } from '@/features/documents/pdf-translation-capture';
import { PdfPreviewToolbar, PdfTranslationMenus, PdfTranslationPane } from './pdf-preview-frame-ui';
import {
  clampPdfZoom,
  getAbortAwareError,
  getRectStyle,
  getRenderedPdfCanvas,
  getSelectionTextWithin,
  getTranslationTargetLanguages,
  isMeaningfulSelectionRect,
  isPdfTextLayerTarget,
  pdfPreviewCommitCoverDelayMs,
  pdfPreviewFadeMs,
  pdfPreviewMaxZoom,
  pdfPreviewMinZoom,
  pdfPreviewPadding,
  pdfPreviewRevealDelayMs,
  pdfPreviewToolbarMinHeight,
  pdfPreviewZoomStep,
} from './pdf-preview-frame.helpers';
import type {
  AreaDragState,
  PdfMenuPoint,
  PdfZoomMode,
  TextSelectionMenuState,
  TranslationPaneState,
  VisualSelectionMenuState,
} from './pdf-preview-frame.helpers';

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();
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
        <PdfPreviewToolbar
          toolbarRef={toolbarRef}
          pageNumber={pageNumber}
          numPages={numPages}
          hasPreviousPage={hasPreviousPage}
          hasNextPage={hasNextPage}
          canZoomOut={canZoomOut}
          canZoomIn={canZoomIn}
          zoomPercent={zoomPercent}
          zoomMode={zoomMode}
          getFitButtonStyles={getFitButtonStyles}
          onPreviousPage={goToPreviousPage}
          onNextPage={goToNextPage}
          onPageInputBlur={goToPage}
          onPageInputKeyDown={handlePageInputKeyDown}
          onZoomOut={zoomOut}
          onZoomIn={zoomIn}
          onFitModeChange={setFitMode}
          onPrint={onPrint}
        />
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
        <PdfTranslationPane
          translationPane={translationPane}
          onCancel={cancelTranslation}
          onClose={closeTranslationPane}
        />
      ) : null}

      <PdfTranslationMenus
        availableTranslationLanguages={availableTranslationLanguages}
        isTranslationPending={isTranslationPending}
        pageContextMenu={pageContextMenu}
        textSelectionMenu={textSelectionMenu}
        translationsDisabled={translationsDisabled}
        visualSelectionMenu={visualSelectionMenu}
        onPageMenuOpenChange={(open) =>
          setPageContextMenu((current) => (current === null ? null : { ...current, open }))
        }
        onTextMenuOpenChange={(open) =>
          setTextSelectionMenu((current) => (current === null ? null : { ...current, open }))
        }
        onTranslatePage={(language) => {
          void runPageTranslation(language);
        }}
        onTranslateTextSelection={(language, menu) => {
          void runSelectionTranslation({
            targetLanguage: language,
            source: {
              type: 'text',
              pageNumber: menu.pageNumber,
              text: menu.text,
            },
          });
        }}
        onTranslateVisualSelection={(language, menu) => {
          void runVisualSelectionTranslation(language, menu.rect);
        }}
        onVisualMenuOpenChange={(open) =>
          setVisualSelectionMenu((current) => (current === null ? null : { ...current, open }))
        }
      />
    </Flex>
  );
}

/* eslint-disable react-refresh/only-export-components */
import { Text } from '@chakra-ui/react';
import type {
  DocumentTranslationLanguage,
  DocumentTranslationSource,
} from '@/features/documents/documents.api';
import type { DocumentLanguageMetadata } from '@/features/documents/documents.types';
import type { NormalizedPoint, NormalizedRect } from '@/features/documents/pdf-translation-capture';

export const pdfPreviewRevealDelayMs = 120;
export const pdfPreviewFadeMs = 420;
export const pdfPreviewPadding = 32;
export const pdfPreviewToolbarMinHeight = 64;
export const pdfPreviewCommitCoverDelayMs = 120;
export const pdfPreviewMinZoom = 0.5;
export const pdfPreviewMaxZoom = 3;
export const pdfPreviewZoomStep = 0.1;

export type PdfZoomMode = 'fit-page' | 'fit-width' | 'actual' | 'custom';

export function clampPdfZoom(value: number) {
  return Math.min(Math.max(value, pdfPreviewMinZoom), pdfPreviewMaxZoom);
}

export const translationLanguages: Array<{
  value: DocumentTranslationLanguage;
  label: string;
  flag: string;
}> = [
  { value: 'de', label: 'German', flag: '🇩🇪' },
  { value: 'en', label: 'English', flag: '🇬🇧' },
];

export interface TranslationPaneState {
  status: 'loading' | 'success' | 'error';
  targetLanguage: DocumentTranslationLanguage;
  sourceType: DocumentTranslationSource['type'];
  pageNumber: number;
  text: string;
  error: string | null;
  provider: string | null;
  model: string | null;
}

export interface PdfMenuPoint {
  x: number;
  y: number;
}

export interface TextSelectionMenuState {
  open: boolean;
  point: PdfMenuPoint;
  text: string;
  pageNumber: number;
}

export interface VisualSelectionMenuState {
  open: boolean;
  point: PdfMenuPoint;
  rect: NormalizedRect;
  pageNumber: number;
}

export interface AreaDragState {
  pointerId: number;
  start: NormalizedPoint;
  current: NormalizedPoint;
}

export function getTranslationLanguageLabel(language: DocumentTranslationLanguage) {
  return (
    translationLanguages.find((item) => item.value === language)?.label ?? language.toUpperCase()
  );
}

export function getTranslationTargetLanguages(
  sourceLanguage: DocumentLanguageMetadata | null | undefined,
) {
  const sourceCode = sourceLanguage?.code.toLocaleLowerCase().split('-')[0];

  if (sourceCode === undefined) {
    return translationLanguages;
  }

  return translationLanguages.filter((language) => language.value !== sourceCode);
}

export function getTranslationSourceLabel(sourceType: DocumentTranslationSource['type']) {
  if (sourceType === 'page-image') {
    return 'Page';
  }

  return sourceType === 'area-image' ? 'Selected area' : 'Selected text';
}

export function getAbortAwareError(error: unknown) {
  if (error instanceof DOMException && error.name === 'AbortError') {
    return 'Translation cancelled.';
  }

  if (error instanceof Error) {
    return error.message;
  }

  return 'Translation failed.';
}

export function getRenderedPdfCanvas(pageElement: HTMLElement | null) {
  return pageElement?.querySelector('canvas') ?? null;
}

export function getRectStyle(rect: NormalizedRect) {
  return {
    left: `${rect.x * 100}%`,
    top: `${rect.y * 100}%`,
    width: `${rect.width * 100}%`,
    height: `${rect.height * 100}%`,
  };
}

export function isMeaningfulSelectionRect(rect: NormalizedRect) {
  return rect.width >= 0.01 && rect.height >= 0.01;
}

export function getSelectionTextWithin(element: HTMLElement | null) {
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

export function isPdfTextLayerTarget(target: EventTarget | null) {
  return (
    target instanceof Element &&
    target.closest('.react-pdf__Page__textContent span, .textLayer span') !== null
  );
}

export function getMenuAnchorRect(point: PdfMenuPoint | undefined) {
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

export function TranslationLanguageMenuLabel({
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

export function TranslationResultText({ text }: { text: string }) {
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

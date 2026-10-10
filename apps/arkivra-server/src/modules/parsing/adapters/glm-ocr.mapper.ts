import { z } from 'zod';
import type { ParsedChunk, ParserOutput, StructuredElement } from '../parsed-document.schema.js';
import { serializeTableHtmlForRetrieval } from '../table-formatting.js';
import { markdownToPlainText } from '../markdown-text.js';

const box = z.tuple([
  z.number().finite(),
  z.number().finite(),
  z.number().finite(),
  z.number().finite(),
]);
const region = z
  .object({
    index: z.number().int().nonnegative(),
    label: z.string(),
    content: z.string().nullable(),
    bbox_2d: box.nullable().optional(),
  })
  .superRefine((item, context) => {
    if (item.content === null && !/image|figure|picture/i.test(item.label)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['content'],
        message: 'Only image regions may have null OCR content',
      });
    }
  })
  .transform((item) => ({ ...item, content: item.content ?? '' }));
export const glmOcrResponseSchema = z.object({
  json_result: z.array(z.array(region)).min(1),
  markdown_result: z.string().optional(),
});
export type GlmOcrResponse = z.infer<typeof glmOcrResponseSchema>;

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

// Store safe table HTML for the existing table viewer; never trust OCR HTML.
function tableHtml(content: string) {
  const rows = content.split('\n').filter((line) => line.includes('|') && !/^[\s:|-]+$/.test(line));
  if (rows.length === 0)
    return `<table><tbody><tr><td>${escapeHtml(serializeTableHtmlForRetrieval(content))}</td></tr></tbody></table>`;
  return `<table><tbody>${rows
    .map(
      (line) =>
        `<tr>${line
          .trim()
          .replace(/^\||\|$/g, '')
          .split('|')
          .map((cell) => `<td>${escapeHtml(cell.trim())}</td>`)
          .join('')}</tr>`,
    )
    .join('')}</tbody></table>`;
}

export function mapGlmOcrOutput({
  response,
  documentId,
  engineVersion = 'sdk',
  maxChunkCharacters = 4000,
  plainText = false,
}: {
  response: GlmOcrResponse;
  documentId: string;
  engineVersion?: string;
  maxChunkCharacters?: number;
  plainText?: boolean;
}): ParserOutput {
  if (!Number.isInteger(maxChunkCharacters) || maxChunkCharacters < 1)
    throw new Error('Invalid GLM chunk size');
  const elements: StructuredElement[] = [];
  const chunks: ParsedChunk[] = [];
  let section: string | null = null;
  for (const [pageIndex, regions] of response.json_result.entries()) {
    const seen = new Set<number>();
    for (const item of [...regions].sort((a, b) => a.index - b.index)) {
      if (seen.has(item.index)) throw new Error('Duplicate GLM region index on a page');
      seen.add(item.index);
      const label = item.label.toLowerCase();
      const type = /title|heading/.test(label)
        ? 'title'
        : label.includes('table')
          ? 'table'
          : /image|figure|picture/.test(label)
            ? 'image'
            : label.includes('list')
              ? 'list'
              : 'narrative';
      const text =
        type === 'image'
          ? ''
          : plainText
            ? item.content
            : type === 'table' && /<table\b/i.test(item.content)
              ? serializeTableHtmlForRetrieval(item.content)
              : markdownToPlainText(item.content);
      if (type === 'title') section = text;
      const coords = item.bbox_2d;
      if (
        coords &&
        (coords.some((v) => v < 0 || v > 1000) || coords[0] >= coords[2] || coords[1] >= coords[3])
      ) {
        throw new Error('GLM SDK must return valid normalized 0–1000 bounding boxes');
      }
      const bbox = coords
        ? {
            x0: coords[0],
            y0: coords[1],
            x1: coords[2],
            y1: coords[3],
            layoutWidth: 1000,
            layoutHeight: 1000,
            system: 'GlmNormalizedSpace',
          }
        : null;
      const elementId = `glm:p${pageIndex + 1}:r${item.index}`;
      const element: StructuredElement = {
        elementId,
        parentId: null,
        type,
        text,
        tableHtml: type === 'table' ? tableHtml(item.content) : null,
        image: null,
        pageNumber: pageIndex + 1,
        bbox,
        section,
        sectionPath: section ? [section] : [],
      };
      elements.push(element);
      // Images receive a provenance-only chunk; the parser attaches local crops/captions.
      const parts =
        text.length === 0
          ? ['']
          : Array.from({ length: Math.ceil(text.length / maxChunkCharacters) }, (_, i) =>
              text.slice(i * maxChunkCharacters, (i + 1) * maxChunkCharacters),
            );
      for (const [partIndex, part] of parts.entries()) {
        if (!part && type !== 'image') continue;
        chunks.push({
          id: `${documentId}:${elementId}:${partIndex}`,
          text: part,
          originalText: part,
          section,
          sectionPath: element.sectionPath,
          pageNumber: pageIndex + 1,
          pageStart: pageIndex + 1,
          pageEnd: pageIndex + 1,
          boundingBoxes: bbox ? [{ ...bbox, pageNumber: pageIndex + 1 }] : [],
          sourceElementIds: [elementId],
          parentElementId: null,
          tablesHtml: element.tableHtml ? [element.tableHtml] : [],
          images: [],
          citationPrecision: bbox ? 'box' : 'page',
          enhancedContent: null,
          type:
            type === 'title'
              ? 'heading'
              : type === 'table'
                ? 'table'
                : type === 'list'
                  ? 'list'
                  : 'paragraph',
          metadata: {
            retrievalRepresentation: 'glm_block',
            glmLabel: item.label,
            glmRegionIndex: item.index,
            glmSplitPart: partIndex,
            ...(type === 'table' ? { tableProvenance: [elementId] } : {}),
            ...(type === 'image'
              ? {
                  imageProvenance: [
                    {
                      elementId,
                      pageNumber: pageIndex + 1,
                      bbox: bbox ? { ...bbox, pageNumber: pageIndex + 1 } : null,
                    },
                  ],
                }
              : {}),
          },
        });
      }
    }
  }
  return {
    engine: 'glm-ocr',
    engineVersion,
    text: elements
      .map((e) => e.text)
      .filter(Boolean)
      .join('\n\n'),
    markdown: response.markdown_result ?? elements.map((e) => e.text).join('\n\n'),
    rawStructuredOutput: { ...response, schema_name: 'GlmOcrDocument' },
    structuredElements: elements,
    chunks,
    warnings: [],
  };
}

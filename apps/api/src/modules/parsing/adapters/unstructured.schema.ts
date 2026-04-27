import { z } from 'zod';

const nullishString = z.preprocess(
  value => value ?? '',
  z.string(),
);

const elementType = z.preprocess(
  value => value ?? 'UncategorizedText',
  z.string().min(1),
);

/**
 * Subset of `metadata.coordinates` that Phase 1 of the multimodal RAG
 * ingestion plan needs to map an Unstructured element back onto its
 * source page. Other coordinate fields (e.g. `system`-specific
 * extensions) are tolerated via `passthrough`.
 *
 * Unstructured returns the bounding polygon as
 * `points: [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]`, so the parser
 * adapter is responsible for collapsing that to `(x0, y0, x1, y1)`.
 */
export const unstructuredCoordinatesSchema = z
  .object({
    points: z.array(z.tuple([z.number(), z.number()])).optional(),
    system: z.string().optional(),
    layout_width: z.number().optional(),
    layout_height: z.number().optional(),
  })
  .passthrough();

export type UnstructuredCoordinates = z.infer<typeof unstructuredCoordinatesSchema>;

/**
 * Whitelist of metadata fields the parser reads off elements. Anything
 * else is preserved via `passthrough` so future Unstructured releases
 * don't break ingestion. Both `parent_id` and `image_*` are optional
 * because not every element carries them.
 */
export const unstructuredElementMetadataSchema = z
  .object({
    page_number: z.number().int().optional(),
    parent_id: z.string().nullish(),
    text_as_html: z.string().nullish(),
    coordinates: unstructuredCoordinatesSchema.nullish(),
    image_base64: z.string().nullish(),
    image_mime_type: z.string().nullish(),
  })
  .passthrough();

export type UnstructuredElementMetadata = z.infer<typeof unstructuredElementMetadataSchema>;

export const unstructuredElementSchema = z.object({
  type: elementType,
  element_id: nullishString.optional(),
  text: nullishString,
  metadata: z.preprocess(
    value => value ?? {},
    unstructuredElementMetadataSchema,
  ).default({}),
}).passthrough();

export const unstructuredPartitionResponseSchema = z.array(unstructuredElementSchema);

export type UnstructuredElement = z.infer<typeof unstructuredElementSchema>;

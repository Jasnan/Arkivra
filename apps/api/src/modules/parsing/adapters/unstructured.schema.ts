import { z } from 'zod';

const nullishString = z.preprocess(
  value => value ?? '',
  z.string(),
);

const elementType = z.preprocess(
  value => value ?? 'UncategorizedText',
  z.string().min(1),
);

export const unstructuredElementSchema = z.object({
  type: elementType,
  element_id: nullishString.optional(),
  text: nullishString,
  metadata: z.record(z.string(), z.unknown()).default({}),
}).passthrough();

export const unstructuredPartitionResponseSchema = z.array(unstructuredElementSchema);

export type UnstructuredElement = z.infer<typeof unstructuredElementSchema>;

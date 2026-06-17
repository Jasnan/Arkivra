import type { DoclingChunkResponse, DoclingClient } from '../../docling/docling.client.js';
import { describe, expect, test, vi } from 'vitest';
import { createDoclingParser } from './docling.parser.js';
import {
  DOCILING_JSON_FIXTURE,
  SCANNED_TEXT_JSON_FIXTURE,
  createPdfBuffer,
  makeChunkResponse,
  makeDoclingClient,
} from './docling.parser.test-fixtures.js';

describe('docling parser routing', () => {
  test('uses OCR for Docling chunking when the PDF needs it', async () => {
    const doclingClient = makeDoclingClient(makeChunkResponse());
    const parser = createDoclingParser({
      doclingClient,
    });

    await parser.parse({
      documentId: 'doc_ocr_choice',
      fileName: 'f.pdf',
      mimeType: 'application/pdf',
      fileData: Buffer.from('x'),
    });

    expect(doclingClient.chunkFile).toHaveBeenCalledWith(
      expect.objectContaining({
        convertOptions: {
          doOcr: true,
        },
      }),
    );
  });

  test('uses digital PDF path with Docling OCR disabled when sampled pages contain substantial text', async () => {
    const doclingClient = makeDoclingClient(makeChunkResponse());
    const parser = createDoclingParser({
      doclingClient,
      scanClassifier: {
        maxSampledPages: 3,
        scanHeavyScannedPageRatio: 0.7,
        mixedScannedPageRatio: 0.2,
      },
    });

    const output = await parser.parse({
      documentId: 'doc_digital_pdf',
      fileName: 'digital.pdf',
      mimeType: 'application/pdf',
      fileData: await createPdfBuffer(3, [1, 2, 3]),
    });

    expect(doclingClient.chunkFile).toHaveBeenCalledWith(
      expect.objectContaining({
        convertOptions: {
          doOcr: false,
        },
      }),
    );
    expect(output.rawStructuredOutput?.arkivra_processing).toMatchObject({
      processing_path: 'digital',
      canonical_text_source: 'docling',
      docling_ocr_enabled: false,
    });
    expect(
      output.chunks?.every((chunk) => chunk.metadata.retrievalRepresentation === 'docling_hybrid'),
    ).toBe(true);
  });

  test('does not route digital PDFs through VLM when VLM is enabled', async () => {
    const doclingClient = makeDoclingClient(makeChunkResponse());
    const parser = createDoclingParser({
      doclingClient,
      vlmEnabled: true,
      vlmPipelinePreset: 'glm_ocr',
      scanClassifier: {
        maxSampledPages: 3,
        scanHeavyScannedPageRatio: 0.7,
        mixedScannedPageRatio: 0.2,
      },
    });

    const output = await parser.parse({
      documentId: 'doc_digital_pdf_vlm_enabled',
      fileName: 'digital.pdf',
      mimeType: 'application/pdf',
      fileData: await createPdfBuffer(3, [1, 2, 3]),
    });

    expect(doclingClient.chunkFile).toHaveBeenCalledWith(
      expect.objectContaining({
        convertOptions: {
          doOcr: false,
        },
      }),
    );
    expect(output.warnings).not.toContain('docling.pipeline:vlm');
    expect(output.rawStructuredOutput?.arkivra_processing).toMatchObject({
      processing_path: 'digital',
      docling_ocr_enabled: false,
    });
    expect(output.rawStructuredOutput?.arkivra_processing).not.toHaveProperty('docling_pipeline');
  });

  test('routes image files through VLM when VLM is enabled', async () => {
    const doclingClient = makeDoclingClient(
      makeChunkResponse({
        chunks: [
          {
            filename: 'passport.webp',
            chunk_index: 0,
            text: 'Passport No. H5536221',
            raw_text: 'Passport No. H5536221',
            doc_items: ['#/texts/0'],
            page_numbers: [1],
          },
        ],
        documents: [
          {
            kind: 'ExportResult' as const,
            content: {
              md_content: '# VLM Image',
              text_content: 'Passport No. H5536221',
              json_content: SCANNED_TEXT_JSON_FIXTURE,
              html_content: '',
              doctags_content: '',
            },
            status: 'success',
            errors: [],
          },
        ],
      }),
    );
    const parser = createDoclingParser({
      doclingClient,
      vlmEnabled: true,
    });

    const output = await parser.parse({
      documentId: 'doc_image_vlm',
      fileName: 'passport.webp',
      mimeType: 'image/webp',
      fileData: Buffer.from('bytes'),
    });

    expect(doclingClient.chunkFile).toHaveBeenCalledWith(
      expect.objectContaining({
        convertOptions: {
          doOcr: false,
          pipeline: 'vlm',
          vlmPipelinePreset: 'default',
        },
      }),
    );
    expect(output.warnings).toContain('docling.pipeline:vlm');
    expect(output.rawStructuredOutput?.arkivra_processing).toMatchObject({
      processing_path: 'digital',
      docling_pipeline: 'vlm',
    });
  });

  test('uses mixed PDF path with Docling OCR enabled', async () => {
    const doclingClient = makeDoclingClient(makeChunkResponse());
    const parser = createDoclingParser({
      doclingClient,
      scanClassifier: {
        maxSampledPages: 4,
        scanHeavyScannedPageRatio: 0.7,
        mixedScannedPageRatio: 0.2,
      },
    });

    const output = await parser.parse({
      documentId: 'doc_mixed_pdf',
      fileName: 'mixed.pdf',
      mimeType: 'application/pdf',
      fileData: await createPdfBuffer(4, [1, 2, 3]),
    });

    expect(doclingClient.chunkFile).toHaveBeenCalledWith(
      expect.objectContaining({
        convertOptions: {
          doOcr: true,
        },
      }),
    );
    expect(output.rawStructuredOutput?.arkivra_processing).toMatchObject({
      processing_path: 'mixed',
      canonical_text_source: 'docling',
      docling_ocr_enabled: true,
    });
  });

  test('uses Docling auto OCR for scan-heavy PDFs', async () => {
    const doclingClient = makeDoclingClient(
      makeChunkResponse({
        documents: [
          {
            kind: 'ExportResult' as const,
            content: {
              md_content: '# Docling Layout',
              text_content: 'Page one OCR text\n\nPage two OCR text',
              json_content: DOCILING_JSON_FIXTURE,
              html_content: '',
              doctags_content: '',
            },
            status: 'success',
            errors: [],
          },
        ],
      }),
    );
    const parser = createDoclingParser({
      doclingClient,
      scanClassifier: {
        maxSampledPages: 2,
        scanHeavyScannedPageRatio: 0.7,
        mixedScannedPageRatio: 0.2,
      },
    });

    const output = await parser.parse({
      documentId: 'doc_scan_pdf',
      fileName: 'scan.pdf',
      mimeType: 'application/pdf',
      fileData: await createPdfBuffer(2),
    });

    expect(doclingClient.chunkFile).toHaveBeenCalledWith(
      expect.objectContaining({
        convertOptions: {
          doOcr: true,
          ocrPreset: 'auto',
        },
      }),
    );
    expect(output.text).toBe('Page one OCR text\n\nPage two OCR text');
    expect(output.markdown).toContain('Docling Layout');
    expect(output.warnings).toContain('docling.ocr_preset:auto');
    expect(output.rawStructuredOutput?.arkivra_processing).toMatchObject({
      processing_path: 'scan-heavy',
      canonical_text_source: 'docling',
      docling_ocr_enabled: true,
      docling_ocr_preset: 'auto',
    });
    expect(output.rawStructuredOutput?.arkivra_processing).not.toHaveProperty('docling_pipeline');
    expect(
      output.chunks?.every((chunk) => chunk.metadata.retrievalRepresentation === 'docling_hybrid'),
    ).toBe(true);
    expect(output.structuredElements?.length ?? 0).toBeGreaterThan(0);
    expect(output.chunks?.every((chunk) => chunk.metadata.canonicalTextSource === 'docling')).toBe(
      true,
    );
    expect(output.chunks?.every((chunk) => chunk.metadata.doclingOcrPreset === 'auto')).toBe(true);
    expect(output.chunks?.every((chunk) => !('doclingPipeline' in chunk.metadata))).toBe(true);
  });

  test('routes scan-heavy PDFs through Docling VLM when enabled', async () => {
    const doclingClient = makeDoclingClient(
      makeChunkResponse({
        documents: [
          {
            kind: 'ExportResult' as const,
            content: {
              md_content: '# VLM Layout',
              text_content: 'Page one VLM text\n\nPage two VLM text',
              json_content: DOCILING_JSON_FIXTURE,
              html_content: '',
              doctags_content: '',
            },
            status: 'success',
            errors: [],
          },
        ],
      }),
    );
    const parser = createDoclingParser({
      doclingClient,
      vlmEnabled: true,
      scanClassifier: {
        maxSampledPages: 2,
        scanHeavyScannedPageRatio: 0.7,
        mixedScannedPageRatio: 0.2,
      },
    });

    const output = await parser.parse({
      documentId: 'doc_scan_pdf_vlm',
      fileName: 'scan.pdf',
      mimeType: 'application/pdf',
      fileData: await createPdfBuffer(2),
    });

    expect(doclingClient.chunkFile).toHaveBeenCalledWith(
      expect.objectContaining({
        convertOptions: {
          doOcr: false,
          pipeline: 'vlm',
          vlmPipelinePreset: 'default',
        },
      }),
    );
    expect(output.text).toBe('Page one VLM text\n\nPage two VLM text');
    expect(output.markdown).toContain('VLM Layout');
    expect(output.warnings).toContain('docling.pipeline:vlm');
    expect(output.warnings).toContain('docling.vlm_pipeline_preset:default');
    expect(output.rawStructuredOutput?.arkivra_processing).toMatchObject({
      processing_path: 'scan-heavy',
      canonical_text_source: 'docling',
      docling_ocr_enabled: false,
      docling_ocr_preset: null,
      docling_pipeline: 'vlm',
      docling_vlm_pipeline_preset: 'default',
    });
    expect(
      output.chunks?.every((chunk) => chunk.metadata.retrievalRepresentation === 'docling_hybrid'),
    ).toBe(true);
    expect(output.structuredElements?.length ?? 0).toBeGreaterThan(0);
    expect(output.chunks?.every((chunk) => chunk.metadata.canonicalTextSource === 'docling')).toBe(
      true,
    );
    expect(output.chunks?.every((chunk) => chunk.metadata.doclingOcrEnabled === false)).toBe(true);
    expect(output.chunks?.every((chunk) => chunk.metadata.doclingOcrPreset === null)).toBe(true);
    expect(output.chunks?.every((chunk) => chunk.metadata.doclingPipeline === 'vlm')).toBe(true);
    expect(
      output.chunks?.every((chunk) => chunk.metadata.doclingVlmPipelinePreset === 'default'),
    ).toBe(true);
  });

  test('passes configured Docling VLM preset only on VLM-routed files', async () => {
    const doclingClient = makeDoclingClient(makeChunkResponse());
    const parser = createDoclingParser({
      doclingClient,
      vlmEnabled: true,
      vlmPipelinePreset: 'glm_ocr',
      scanClassifier: {
        maxSampledPages: 2,
        scanHeavyScannedPageRatio: 0.7,
        mixedScannedPageRatio: 0.2,
      },
    });

    const output = await parser.parse({
      documentId: 'doc_scan_pdf_vlm_custom_preset',
      fileName: 'scan.pdf',
      mimeType: 'application/pdf',
      fileData: await createPdfBuffer(2),
    });

    expect(doclingClient.chunkFile).toHaveBeenCalledWith(
      expect.objectContaining({
        convertOptions: {
          doOcr: false,
          pipeline: 'vlm',
          vlmPipelinePreset: 'glm_ocr',
        },
      }),
    );
    expect(output.warnings).toContain('docling.vlm_pipeline_preset:glm_ocr');
    expect(output.rawStructuredOutput?.arkivra_processing).toMatchObject({
      docling_pipeline: 'vlm',
      docling_vlm_pipeline_preset: 'glm_ocr',
    });
    expect(
      output.chunks?.every((chunk) => chunk.metadata.doclingVlmPipelinePreset === 'glm_ocr'),
    ).toBe(true);
  });

  test('does not retry scan-heavy PDFs through a second Docling path', async () => {
    const standardOcrResponse = makeChunkResponse({
      chunks: [
        {
          filename: 'scan.pdf',
          chunk_index: 0,
          text: 'Passport OCR text',
          raw_text: 'Passport OCR text',
          doc_items: ['#/texts/0'],
          page_numbers: [1],
        },
      ],
      documents: [
        {
          kind: 'ExportResult' as const,
          content: {
            md_content: '',
            text_content: 'Passport OCR text',
            json_content: SCANNED_TEXT_JSON_FIXTURE,
            html_content: '',
            doctags_content: '',
          },
          status: 'success',
          errors: [],
        },
      ],
    });
    const chunkFile = vi.fn().mockResolvedValueOnce(standardOcrResponse);
    const parser = createDoclingParser({
      doclingClient: {
        convertFile: vi.fn(),
        chunkFile,
      } as unknown as DoclingClient,
      scanClassifier: {
        maxSampledPages: 1,
        scanHeavyScannedPageRatio: 0.7,
        mixedScannedPageRatio: 0.2,
      },
    });

    const output = await parser.parse({
      documentId: 'doc_scan_retry',
      fileName: 'scan.pdf',
      mimeType: 'application/pdf',
      fileData: await createPdfBuffer(1),
    });

    expect(chunkFile).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        convertOptions: {
          doOcr: true,
          ocrPreset: 'auto',
        },
      }),
    );
    expect(chunkFile).toHaveBeenCalledTimes(1);
    expect(output.text).toBe('Passport OCR text');
    expect(output.warnings).toContain('docling.ocr_preset:auto');
    expect(output.rawStructuredOutput?.arkivra_processing).toMatchObject({
      processing_path: 'scan-heavy',
      docling_ocr_enabled: true,
      docling_ocr_preset: 'auto',
      fallback_reason: null,
    });
    expect(output.rawStructuredOutput?.arkivra_processing).not.toHaveProperty('docling_pipeline');
    const hybridChunks =
      output.chunks?.filter(
        (chunk) => chunk.metadata.retrievalRepresentation === 'docling_hybrid',
      ) ?? [];
    const elementChunks =
      output.chunks?.filter(
        (chunk) => chunk.metadata.retrievalRepresentation === 'docling_element',
      ) ?? [];
    const elementPairChunks =
      output.chunks?.filter(
        (chunk) => chunk.metadata.retrievalRepresentation === 'docling_element_pair',
      ) ?? [];

    expect(hybridChunks).toHaveLength(1);
    expect(elementChunks).toHaveLength(0);
    expect(elementPairChunks).toHaveLength(0);
    expect(output.chunks?.[0]?.metadata).not.toHaveProperty('doclingPipeline');
    expect(output.chunks?.every((chunk) => chunk.metadata.doclingOcrEnabled === true)).toBe(true);
    expect(output.chunks?.every((chunk) => chunk.metadata.doclingOcrPreset === 'auto')).toBe(true);
  });

  test('splits large PDFs before Docling and offsets merged page citations', async () => {
    const chunkFile = vi.fn(async ({ fileName }: { fileName: string }) => {
      const isLastPart = fileName.includes('part-003');
      const chunks: DoclingChunkResponse['chunks'] = [
        {
          filename: fileName,
          chunk_index: 0,
          text: `First page chunk from ${fileName}`,
          headings: ['Part'],
          page_numbers: [1],
          doc_items: ['#/texts/0', '#/tables/0'],
        },
      ];
      if (!isLastPart) {
        chunks.push({
          filename: fileName,
          chunk_index: 1,
          text: `Second page chunk from ${fileName}`,
          headings: ['Part'],
          page_numbers: [2],
          doc_items: ['#/texts/1'],
        });
      }

      return makeChunkResponse({
        chunks,
        documents: [
          {
            kind: 'ExportResult' as const,
            content: {
              md_content: `# ${fileName}`,
              text_content: fileName,
              json_content: DOCILING_JSON_FIXTURE,
              html_content: '',
              doctags_content: '',
            },
            status: 'success',
            errors: [],
          },
        ],
      });
    });
    const doclingClient = {
      convertFile: vi.fn(),
      chunkFile,
    } as unknown as DoclingClient;
    const parser = createDoclingParser({
      doclingClient,
      splitPdfPageThreshold: 2,
      splitPdfChunkPages: 2,
    });

    const output = await parser.parse({
      documentId: 'doc_large_pdf',
      fileName: 'large.pdf',
      mimeType: 'application/pdf',
      fileData: await createPdfBuffer(5),
    });

    expect(chunkFile).toHaveBeenCalledTimes(3);
    expect(chunkFile).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        fileName: 'large.part-001-of-003.pdf',
      }),
    );
    expect(chunkFile).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        fileName: 'large.part-002-of-003.pdf',
      }),
    );
    expect(chunkFile).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        fileName: 'large.part-003-of-003.pdf',
      }),
    );

    const hybridChunks =
      output.chunks?.filter(
        (chunk) => chunk.metadata.retrievalRepresentation === 'docling_hybrid',
      ) ?? [];

    expect(new Set(output.chunks?.map((chunk) => chunk.id)).size).toBe(output.chunks?.length);
    expect(hybridChunks).toHaveLength(5);
    expect(hybridChunks.map((chunk) => chunk.metadata.index)).toEqual([0, 1, 2, 3, 4]);
    expect(hybridChunks.map((chunk) => chunk.pageStart)).toEqual([1, 2, 3, 4, 5]);
    expect(hybridChunks[2]?.boundingBoxes[0]?.pageNumber).toBe(3);
    expect(hybridChunks[0]?.sourceElementIds).toEqual(['part-1:#/texts/0', 'part-1:#/tables/0']);
    expect(hybridChunks[2]?.sourceElementIds).toEqual(['part-2:#/texts/0', 'part-2:#/tables/0']);
    expect(hybridChunks[4]?.sourceElementIds).toEqual(['part-3:#/texts/0', 'part-3:#/tables/0']);
    expect(hybridChunks[2]?.metadata.tableProvenance).toEqual([
      expect.objectContaining({
        elementId: 'part-2:#/tables/0',
        pageNumber: 3,
        bbox: expect.objectContaining({ pageNumber: 3 }),
      }),
    ]);
    expect(
      output.chunks?.every((chunk) => chunk.metadata.retrievalRepresentation === 'docling_hybrid'),
    ).toBe(true);
    expect(output.chunks?.every((chunk) => chunk.metadata.canonicalTextSource === 'docling')).toBe(
      true,
    );
    expect(output.rawStructuredOutput?.schema_name).toBe('ArkivraDoclingSplitDocument');
  });

  test('uses the default policy of splitting PDFs above 10 pages into 10-page parts', async () => {
    const doclingClient = makeDoclingClient(makeChunkResponse());
    const parser = createDoclingParser({
      doclingClient,
    });

    await parser.parse({
      documentId: 'doc_default_split',
      fileName: 'default-split.pdf',
      mimeType: 'application/pdf',
      fileData: await createPdfBuffer(21),
    });

    expect(doclingClient.chunkFile).toHaveBeenCalledTimes(3);
    expect(doclingClient.chunkFile).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        fileName: 'default-split.part-001-of-003.pdf',
      }),
    );
    expect(doclingClient.chunkFile).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        fileName: 'default-split.part-002-of-003.pdf',
      }),
    );
    expect(doclingClient.chunkFile).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        fileName: 'default-split.part-003-of-003.pdf',
      }),
    );
  });

});

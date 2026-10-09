import process from 'node:process';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { basename, extname, resolve, join } from 'node:path';
import { createGlmOcrParser } from '../modules/parsing/adapters/glm-ocr.parser.js';
import { createParsePipeline } from '../modules/parsing/parse-pipeline.js';
import { createParserRegistry } from '../modules/parsing/parser.registry.js';
import { createNoopTextCleaner } from '../modules/parsing/text-cleaner.js';

// An explicit artifact export for review. No document text is printed to logs.
async function main() {
  const [source, destination] = process.argv.slice(2);
  const baseUrl = process.env.ARKIVRA_GLM_OCR_URL;
  if (!source || !destination || !baseUrl)
    throw new Error(
      'Usage: ARKIVRA_GLM_OCR_URL=http://localhost:5002 pnpm eval:glm <file> <output-directory>',
    );
  const mimeTypes: Record<string, string> = {
    '.pdf': 'application/pdf',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.tif': 'image/tiff',
    '.tiff': 'image/tiff',
    '.txt': 'text/plain',
    '.md': 'text/markdown',
  };
  const mimeType = mimeTypes[extname(source).toLowerCase()];
  if (!mimeType) throw new Error('Unsupported evaluation file type');
  const parser = createGlmOcrParser({ baseUrl });
  const pipeline = createParsePipeline({
    parserRegistry: createParserRegistry({ parsers: [parser], defaultEngine: 'glm-ocr' }),
    cleaner: createNoopTextCleaner(),
  });
  const parsed = await pipeline.run({
    documentId: 'glm-evaluation',
    fileName: basename(source),
    mimeType,
    fileData: await readFile(resolve(source)),
  });
  const directory = resolve(destination);
  await mkdir(directory, { recursive: true });
  // Preserve image bytes as separate assets rather than enormous JSON byte arrays.
  let imageIndex = 0;
  for (const chunk of parsed.chunks) {
    for (const image of chunk.images)
      await writeFile(join(directory, `image-${imageIndex++}.png`), image.data);
  }
  await writeFile(
    join(directory, 'parsed.json'),
    JSON.stringify(parsed, (key, value) => (key === 'data' ? undefined : value), 2),
  );
  await writeFile(
    join(directory, 'raw-sdk.json'),
    JSON.stringify(parsed.rawStructuredOutput, null, 2),
  );
  await writeFile(join(directory, 'document.md'), parsed.markdown);
  console.info(
    `Exported ${parsed.chunks.length} chunks, ${parsed.structuredElements?.length ?? 0} regions and ${imageIndex} images to ${directory}`,
  );
}

main().catch(() => {
  console.error('GLM evaluation failed; check the input, SDK endpoint and output directory.');
  process.exitCode = 1;
});

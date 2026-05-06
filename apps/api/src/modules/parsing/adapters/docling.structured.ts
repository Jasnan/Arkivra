import type {
  ParserOutput,
  StructuredElement,
  StructuredElementBbox,
} from '../parsed-document.schema.js';

type JsonObject = Record<string, unknown>;
type EmbeddedImage = NonNullable<ParserOutput['embeddedImages']>[number];

type DoclingContext = {
  body: JsonObject | null;
  itemByRef: Map<string, JsonObject>;
  pageByNumber: Map<number, JsonObject>;
};

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export function normalizeDoclingJsonContent(value: unknown): JsonObject {
  if (typeof value === 'string') {
    const parsed = JSON.parse(value) as unknown;
    if (!isObject(parsed)) {
      throw new Error('Docling json_content string did not decode to an object');
    }
    return parsed;
  }

  if (!isObject(value)) {
    throw new Error('Docling json_content was not an object');
  }

  return value;
}

function refFromUnknown(value: unknown): string | null {
  if (typeof value === 'string' && value.startsWith('#')) {
    return value;
  }

  if (!isObject(value)) {
    return null;
  }

  return asString(value.cref) ?? asString(value.$ref) ?? asString(value.self_ref);
}

function readChildrenRefs(value: unknown): string[] {
  return asArray(value)
    .map(refFromUnknown)
    .filter((ref): ref is string => ref !== null);
}

function buildContext(document: JsonObject): DoclingContext {
  const itemByRef = new Map<string, JsonObject>();

  const body = isObject(document.body)
    ? {
        self_ref: '#/body',
        ...document.body,
      }
    : null;

  if (body !== null) {
    itemByRef.set('#/body', body);
  }

  for (const key of ['texts', 'tables', 'pictures', 'groups'] as const) {
    for (const item of asArray(document[key])) {
      if (!isObject(item)) {
        continue;
      }

      const selfRef = asString(item.self_ref);
      if (selfRef === null) {
        continue;
      }

      itemByRef.set(selfRef, item);
    }
  }

  const pageByNumber = new Map<number, JsonObject>();
  if (isObject(document.pages)) {
    for (const [pageKey, pageValue] of Object.entries(document.pages)) {
      if (!isObject(pageValue)) {
        continue;
      }

      const pageNumber = Number(pageKey);
      if (Number.isInteger(pageNumber) && pageNumber >= 1) {
        pageByNumber.set(pageNumber, pageValue);
      }
    }
  }

  return { body, itemByRef, pageByNumber };
}

function getPageLayoutSize(context: DoclingContext, pageNumber: number) {
  const page = context.pageByNumber.get(pageNumber);
  if (page === undefined) {
    return { width: null, height: null };
  }

  const size = isObject(page.size) ? page.size : null;
  return {
    width: size === null ? null : asNumber(size.width),
    height: size === null ? null : asNumber(size.height),
  };
}

function bboxFromProv(value: unknown, context: DoclingContext): {
  pageNumber: number | null;
  bbox: StructuredElementBbox | null;
} {
  if (!isObject(value)) {
    return { pageNumber: null, bbox: null };
  }

  const pageNumber = asNumber(value.page_no);
  const bbox = isObject(value.bbox) ? value.bbox : null;
  if (pageNumber === null || bbox === null) {
    return { pageNumber, bbox: null };
  }

  const left = asNumber(bbox.l);
  const top = asNumber(bbox.t);
  const right = asNumber(bbox.r);
  const bottom = asNumber(bbox.b);
  if (left === null || top === null || right === null || bottom === null) {
    return { pageNumber, bbox: null };
  }

  const layout = getPageLayoutSize(context, pageNumber);
  const layoutWidth = layout.width ?? Math.max(left, right);
  const layoutHeight = layout.height ?? Math.max(top, bottom);
  const origin = (asString(bbox.coord_origin) ?? 'TOPLEFT').toUpperCase();

  if (layoutWidth <= 0 || layoutHeight <= 0) {
    return { pageNumber, bbox: null };
  }

  const x0 = Math.min(left, right);
  const x1 = Math.max(left, right);
  const y0 = origin === 'BOTTOMLEFT' ? layoutHeight - Math.max(top, bottom) : Math.min(top, bottom);
  const y1 = origin === 'BOTTOMLEFT' ? layoutHeight - Math.min(top, bottom) : Math.max(top, bottom);

  return {
    pageNumber,
    bbox: {
      x0,
      y0,
      x1,
      y1,
      layoutWidth,
      layoutHeight,
      system: 'PixelSpace',
    },
  };
}

function firstAvailableProvenance(item: JsonObject, context: DoclingContext) {
  for (const prov of asArray(item.prov)) {
    const normalized = bboxFromProv(prov, context);
    if (normalized.pageNumber !== null || normalized.bbox !== null) {
      return normalized;
    }
  }

  return { pageNumber: null, bbox: null };
}

function classifyTextLabel(label: string): StructuredElement['type'] {
  if (label === 'title' || label === 'document_title' || label === 'section_header') {
    return 'title';
  }

  if (label.includes('list')) {
    return 'list';
  }

  return 'narrative';
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

type NormalizedTableCell = {
  text: string;
  startRow: number;
  endRow: number;
  startCol: number;
  endCol: number;
  rowSpan: number;
  colSpan: number;
  columnHeader: boolean;
  rowHeader: boolean;
  rowSection: boolean;
};

function normalizeTableCells(value: unknown): NormalizedTableCell[] {
  return asArray(value)
    .map((cell) => {
      if (!isObject(cell)) {
        return null;
      }

      const startRow = asNumber(cell.start_row_offset_idx);
      const endRow = asNumber(cell.end_row_offset_idx);
      const startCol = asNumber(cell.start_col_offset_idx);
      const endCol = asNumber(cell.end_col_offset_idx);
      const text = typeof cell.text === 'string' ? cell.text.trim() : '';

      if (
        startRow === null
        || endRow === null
        || startCol === null
        || endCol === null
      ) {
        return null;
      }

      const rowSpan = Math.max(1, endRow - startRow);
      const colSpan = Math.max(1, endCol - startCol);

      return {
        text,
        startRow,
        endRow,
        startCol,
        endCol,
        rowSpan,
        colSpan,
        columnHeader: cell.column_header === true,
        rowHeader: cell.row_header === true,
        rowSection: cell.row_section === true,
      };
    })
    .filter((cell): cell is NormalizedTableCell => cell !== null);
}

function buildTableGrid(cells: NormalizedTableCell[]) {
  const rowCount = cells.reduce((max, cell) => Math.max(max, cell.endRow), 0);
  const colCount = cells.reduce((max, cell) => Math.max(max, cell.endCol), 0);

  const rows = Array.from({ length: rowCount }, () =>
    Array.from({ length: colCount }, () => null as NormalizedTableCell | null));

  for (const cell of cells) {
    if (cell.startRow < 0 || cell.startCol < 0) {
      continue;
    }

    if (cell.startRow >= rows.length || cell.startCol >= colCount) {
      continue;
    }

    rows[cell.startRow]![cell.startCol] = cell;
  }

  return { rows, rowCount, colCount };
}

function buildTableHtml(value: unknown): string | null {
  const data = isObject(value) ? value : null;
  if (data === null) {
    return null;
  }

  const cells = normalizeTableCells(data.table_cells);
  if (cells.length === 0) {
    return null;
  }

  const { rows } = buildTableGrid(cells);
  const headerRows = new Set(
    cells.filter(cell => cell.columnHeader).map(cell => cell.startRow),
  );

  const renderRow = (row: Array<NormalizedTableCell | null>) => {
    const renderedCells: string[] = [];
    row.forEach((cell) => {
      if (cell === null) {
        return;
      }

      const tag = cell.columnHeader || cell.rowHeader || cell.rowSection ? 'th' : 'td';
      const rowspan = cell.rowSpan > 1 ? ` rowspan="${cell.rowSpan}"` : '';
      const colspan = cell.colSpan > 1 ? ` colspan="${cell.colSpan}"` : '';
      renderedCells.push(
        `<${tag}${rowspan}${colspan}>${escapeHtml(cell.text)}</${tag}>`,
      );
    });

    return renderedCells.length > 0 ? `<tr>${renderedCells.join('')}</tr>` : '';
  };

  const theadRows: string[] = [];
  const tbodyRows: string[] = [];
  rows.forEach((row, rowIndex) => {
    const html = renderRow(row);
    if (html.length === 0) {
      return;
    }

    if (headerRows.has(rowIndex)) {
      theadRows.push(html);
      return;
    }

    tbodyRows.push(html);
  });

  const thead = theadRows.length > 0 ? `<thead>${theadRows.join('')}</thead>` : '';
  const tbody = tbodyRows.length > 0 ? `<tbody>${tbodyRows.join('')}</tbody>` : '';
  return `<table>${thead}${tbody}</table>`;
}

function buildTableText(value: unknown): string {
  const data = isObject(value) ? value : null;
  if (data === null) {
    return '';
  }

  const cells = normalizeTableCells(data.table_cells);
  if (cells.length === 0) {
    return '';
  }

  const { rows } = buildTableGrid(cells);
  return rows
    .map((row) =>
      row
        .map(cell => cell?.text.trim() ?? '')
        .filter(cellText => cellText.length > 0)
        .join(' | ')
        .trim(),
    )
    .filter(line => line.length > 0)
    .join('\n');
}

function extractEmbeddedImage(value: unknown): EmbeddedImage | null {
  if (!isObject(value)) {
    return null;
  }

  const uri = asString(value.uri);
  if (uri === null) {
    return null;
  }

  const match = uri.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,([A-Za-z0-9+/=]+)$/);
  if (match === null) {
    return null;
  }

  const mimeType = match[1] ?? asString(value.mimetype) ?? 'image/png';
  const base64 = match[2] ?? '';
  if (base64.length === 0) {
    return null;
  }

  const data = Buffer.from(base64, 'base64');
  return data.length > 0 ? { mimeType, data } : null;
}

function resolveCaptionText(item: JsonObject, context: DoclingContext, activeRefs = new Set<string>()): string {
  const captions = readChildrenRefs(item.captions);
  const parts: string[] = [];

  for (const captionRef of captions) {
    if (activeRefs.has(captionRef)) {
      continue;
    }

    activeRefs.add(captionRef);
    const captionItem = context.itemByRef.get(captionRef);
    if (captionItem === undefined) {
      continue;
    }

    const text = asString(captionItem.text);
    if (text !== null && text.trim().length > 0) {
      parts.push(text.trim());
      continue;
    }

    const nestedText = resolveCaptionText(captionItem, context, activeRefs);
    if (nestedText.length > 0) {
      parts.push(nestedText);
    }
  }

  return parts.join('\n').trim();
}

function dedupeEmbeddedImages(images: EmbeddedImage[]): EmbeddedImage[] {
  const seen = new Set<string>();
  const deduped: EmbeddedImage[] = [];

  for (const image of images) {
    const key = `${image.mimeType}:${image.data.toString('base64')}`;
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    deduped.push(image);
  }

  return deduped;
}

function createStructuredElement({
  item,
  context,
  type,
  text,
  tableHtml,
  image,
  section,
  sectionPath,
}: {
  item: JsonObject;
  context: DoclingContext;
  type: StructuredElement['type'];
  text: string;
  tableHtml: string | null;
  image: EmbeddedImage | null;
  section: string | null;
  sectionPath: string[];
}): StructuredElement | null {
  const elementId = asString(item.self_ref);
  if (elementId === null) {
    return null;
  }

  if (type === 'title' && text.trim().length === 0) {
    return null;
  }

  if (type !== 'title' && text.trim().length === 0 && tableHtml === null && image === null) {
    return null;
  }

  const parentId = refFromUnknown(item.parent);
  const prov = firstAvailableProvenance(item, context);

  return {
    elementId,
    parentId,
    type,
    text: text.trim(),
    tableHtml,
    image,
    pageNumber: prov.pageNumber,
    bbox: prov.bbox,
    section,
    sectionPath,
  };
}

function buildElementFromItem(
  item: JsonObject,
  context: DoclingContext,
  sectionPath: string[],
): StructuredElement | null {
  const selfRef = asString(item.self_ref) ?? '';
  const section = sectionPath.length > 0 ? sectionPath.join(' > ') : null;

  if (selfRef.startsWith('#/texts/')) {
    const label = (asString(item.label) ?? 'text').toLowerCase();
    return createStructuredElement({
      item,
      context,
      type: classifyTextLabel(label),
      text: asString(item.text) ?? asString(item.orig) ?? '',
      tableHtml: null,
      image: null,
      section,
      sectionPath,
    });
  }

  if (selfRef.startsWith('#/tables/')) {
    const caption = resolveCaptionText(item, context);
    const tableText = buildTableText(item.data);
    const content = [caption, tableText].filter(part => part.length > 0).join('\n\n');
    return createStructuredElement({
      item,
      context,
      type: 'table',
      text: content,
      tableHtml: buildTableHtml(item.data),
      image: null,
      section,
      sectionPath,
    });
  }

  if (selfRef.startsWith('#/pictures/')) {
    const caption = resolveCaptionText(item, context);
    return createStructuredElement({
      item,
      context,
      type: 'image',
      text: caption,
      tableHtml: null,
      image: extractEmbeddedImage(item.image),
      section,
      sectionPath,
    });
  }

  return null;
}

function walkNodeRef({
  ref,
  context,
  sectionPath,
  activeRefs,
}: {
  ref: string;
  context: DoclingContext;
  sectionPath: string[];
  activeRefs: Set<string>;
}): StructuredElement[] {
  if (activeRefs.has(ref)) {
    return [];
  }

  const item = context.itemByRef.get(ref);
  if (item === undefined) {
    return [];
  }

  activeRefs.add(ref);

  const text = asString(item.text)?.trim() ?? '';
  const currentElement = buildElementFromItem(item, context, sectionPath);
  const nextSectionPath = currentElement?.type === 'title' && text.length > 0
    ? [...sectionPath, text]
    : sectionPath;

  const output: StructuredElement[] = [];
  if (currentElement !== null) {
    if (currentElement.type === 'title') {
      currentElement.section = nextSectionPath.join(' > ');
      currentElement.sectionPath = nextSectionPath;
    }
    output.push(currentElement);
  }

  for (const childRef of readChildrenRefs(item.children)) {
    output.push(...walkNodeRef({
      ref: childRef,
      context,
      sectionPath: nextSectionPath,
      activeRefs,
    }));
  }

  activeRefs.delete(ref);
  return output;
}

function walkBodyTree(context: DoclingContext): StructuredElement[] {
  if (context.body === null) {
    return [];
  }

  const output: StructuredElement[] = [];
  for (const childRef of readChildrenRefs(context.body.children)) {
    output.push(...walkNodeRef({
      ref: childRef,
      context,
      sectionPath: [],
      activeRefs: new Set<string>(),
    }));
  }

  return output;
}

function walkTopLevelFallback(context: DoclingContext): StructuredElement[] {
  return [...context.itemByRef.entries()]
    .filter(([ref]) =>
      ref.startsWith('#/texts/')
      || ref.startsWith('#/tables/')
      || ref.startsWith('#/pictures/'))
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([, item]) => buildElementFromItem(item, context, []))
    .filter((item): item is StructuredElement => item !== null);
}

export function extractDoclingStructuredContent(jsonContent: unknown): {
  rawStructuredOutput: Record<string, unknown>;
  structuredElements: StructuredElement[];
  embeddedImages: EmbeddedImage[];
} {
  const document = normalizeDoclingJsonContent(jsonContent);
  const context = buildContext(document);
  const structuredElements = walkBodyTree(context);
  const fallbackElements = structuredElements.length > 0
    ? structuredElements
    : walkTopLevelFallback(context);

  const embeddedImages = dedupeEmbeddedImages(
    fallbackElements
      .map(element => element.image)
      .filter((image): image is EmbeddedImage => image !== null),
  );

  return {
    rawStructuredOutput: document,
    structuredElements: fallbackElements,
    embeddedImages,
  };
}

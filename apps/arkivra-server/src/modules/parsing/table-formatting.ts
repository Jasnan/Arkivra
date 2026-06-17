type TableCell = {
  tag: 'th' | 'td';
  text: string;
  rowSpan: number;
  colSpan: number;
};

function decodeHtmlEntities(value: string) {
  return value
    .replaceAll('&amp;', '&')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'");
}

function stripTags(value: string) {
  return decodeHtmlEntities(value.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
}

function parseSpanAttribute(attributes: string, name: 'rowspan' | 'colspan') {
  const match = attributes.match(new RegExp(`${name}="(\\d+)"`, 'i'));
  const value = match?.[1] ? Number.parseInt(match[1], 10) : 1;
  return Number.isInteger(value) && value > 0 ? value : 1;
}

function parseRowHtml(rowHtml: string): TableCell[] {
  const cells: TableCell[] = [];
  const cellPattern = /<(th|td)\b([^>]*)>([\s\S]*?)<\/\1>/gi;

  for (const match of rowHtml.matchAll(cellPattern)) {
    const tag = match[1] === 'th' ? 'th' : 'td';
    const attributes = match[2] ?? '';
    const content = match[3] ?? '';
    cells.push({
      tag,
      text: stripTags(content),
      rowSpan: parseSpanAttribute(attributes, 'rowspan'),
      colSpan: parseSpanAttribute(attributes, 'colspan'),
    });
  }

  return cells;
}

function parseRows(sectionHtml: string) {
  const rows: TableCell[][] = [];
  const rowPattern = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;

  for (const match of sectionHtml.matchAll(rowPattern)) {
    const row = parseRowHtml(match[1] ?? '');
    if (row.length > 0) {
      rows.push(row);
    }
  }

  return rows;
}

function extractSection(tableHtml: string, tag: 'thead' | 'tbody') {
  const match = tableHtml.match(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'));
  return match?.[1] ?? '';
}

function buildGrid(rows: TableCell[][]) {
  const grid: string[][] = [];
  const spans = new Map<number, { text: string; remainingRows: number }>();

  for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex] ?? [];
    const gridRow: string[] = [];
    let columnIndex = 0;

    const fillSpans = () => {
      while (spans.has(columnIndex)) {
        const span = spans.get(columnIndex)!;
        gridRow[columnIndex] = span.text;
        if (span.remainingRows <= 1) {
          spans.delete(columnIndex);
        } else {
          spans.set(columnIndex, {
            text: span.text,
            remainingRows: span.remainingRows - 1,
          });
        }
        columnIndex += 1;
      }
    };

    fillSpans();

    for (const cell of row) {
      fillSpans();

      for (let offset = 0; offset < cell.colSpan; offset += 1) {
        gridRow[columnIndex + offset] = cell.text;
        if (cell.rowSpan > 1) {
          spans.set(columnIndex + offset, {
            text: cell.text,
            remainingRows: cell.rowSpan - 1,
          });
        }
      }

      columnIndex += cell.colSpan;
    }

    fillSpans();
    grid.push(gridRow);
  }

  return grid;
}

function deriveHeaderLabels(headerGrid: string[][]) {
  if (headerGrid.length === 0) {
    return [];
  }

  const columnCount = Math.max(...headerGrid.map(row => row.length));
  return Array.from({ length: columnCount }, (_, columnIndex) => {
    const parts = headerGrid
      .map(row => row[columnIndex]?.trim() ?? '')
      .filter(part => part.length > 0)
      .filter((part, index, values) => index === 0 || values[index - 1] !== part);

    return parts.join(' / ');
  });
}

export function serializeTableHtmlForRetrieval(tableHtml: string) {
  const headerRows = parseRows(extractSection(tableHtml, 'thead'));
  const bodyRows = parseRows(extractSection(tableHtml, 'tbody'));
  const fallbackRows = headerRows.length === 0 && bodyRows.length === 0
    ? parseRows(tableHtml)
    : [];

  const resolvedHeaderRows = headerRows.length > 0
    ? headerRows
    : fallbackRows.length > 0 && fallbackRows[0]?.every(cell => cell.tag === 'th')
      ? [fallbackRows[0]!]
      : [];
  const resolvedBodyRows = bodyRows.length > 0
    ? bodyRows
    : fallbackRows.slice(resolvedHeaderRows.length);

  if (resolvedHeaderRows.length === 0 && resolvedBodyRows.length === 0) {
    const fallback = stripTags(tableHtml);
    return fallback.length > 0 ? fallback : tableHtml;
  }

  const headerLabels = deriveHeaderLabels(buildGrid(resolvedHeaderRows));
  const bodyGrid = buildGrid(resolvedBodyRows);
  const lines: string[] = [];

  if (headerLabels.length > 0) {
    lines.push(`Headers: ${headerLabels.join(' | ')}`);
  }

  bodyGrid.forEach((row, rowIndex) => {
    const normalizedCells = row.map((cell, index) => ({
      value: cell?.trim() ?? '',
      header: headerLabels[index] ?? '',
    }));

    if (normalizedCells.every(cell => cell.value.length === 0 && cell.header.length === 0)) {
      return;
    }

    if (headerLabels.length > 0) {
      const pairs = normalizedCells.flatMap((cell) => {
        const header = cell.header.trim();
        if (!header || cell.value.length === 0) {
          return [];
        }

        return [`${header}=${cell.value}`];
      });

      if (pairs.length > 0) {
        lines.push(`Row ${rowIndex + 1}: ${pairs.join('; ')}`);
        return;
      }
    }

    lines.push(`Row ${rowIndex + 1}: ${normalizedCells.map(cell => cell.value).filter(Boolean).join(' | ')}`);
  });

  return lines.join('\n');
}

import { describe, expect, test } from 'vitest';
import { serializeTableHtmlForRetrieval } from './table-formatting.js';

describe('table retrieval formatting', () => {
  test('repeats column headers on each row for row lookup', () => {
    const html = [
      '<table>',
      '<thead><tr><th>Asset</th><th>Amount</th></tr></thead>',
      '<tbody>',
      '<tr><td>Cash</td><td>120</td></tr>',
      '<tr><td>Liabilities</td><td>30</td></tr>',
      '</tbody>',
      '</table>',
    ].join('');

    expect(serializeTableHtmlForRetrieval(html)).toBe([
      'Headers: Asset | Amount',
      'Row 1: Asset=Cash; Amount=120',
      'Row 2: Asset=Liabilities; Amount=30',
    ].join('\n'));
  });

  test('combines multi-row headers into stable column labels', () => {
    const html = [
      '<table>',
      '<thead>',
      '<tr><th colspan="2">Quarterly results</th><th>Amount</th></tr>',
      '<tr><th>Year</th><th>Quarter</th><th>Amount</th></tr>',
      '</thead>',
      '<tbody>',
      '<tr><td>2026</td><td>Q1</td><td>120</td></tr>',
      '</tbody>',
      '</table>',
    ].join('');

    expect(serializeTableHtmlForRetrieval(html)).toBe([
      'Headers: Quarterly results / Year | Quarterly results / Quarter | Amount',
      'Row 1: Quarterly results / Year=2026; Quarterly results / Quarter=Q1; Amount=120',
    ].join('\n'));
  });

  test('falls back to row text when headers are absent', () => {
    const html = '<table><tr><td>Cash</td><td>120</td></tr></table>';

    expect(serializeTableHtmlForRetrieval(html)).toBe('Row 1: Cash | 120');
  });
});

import { describe, expect, test } from 'vitest';
import { sanitizeAuditJson, sanitizeAuditMetadata } from './audit.redaction.js';

describe('audit redaction', () => {
  test('redacts dangerous keys recursively', () => {
    expect(sanitizeAuditJson({
      safe: 'ok',
      password: 'secret',
      nested: {
        access_token: 'token',
        value: 1,
      },
      items: [{ raw_text: 'document contents' }],
    })).toEqual({
      safe: 'ok',
      password: '[redacted]',
      nested: {
        access_token: '[redacted]',
        value: 1,
      },
      items: [{ raw_text: '[redacted]' }],
    });
  });

  test('allowlists safe document upload metadata', () => {
    expect(sanitizeAuditMetadata('document.uploaded', {
      file_name: 'contract.pdf',
      file_size: 1200,
      mime_type: 'application/pdf',
      token: 'secret',
      content: 'raw document text',
      storage_key: 'vlt/doc',
    })).toEqual({
      file_name: 'contract.pdf',
      file_size: 1200,
      mime_type: 'application/pdf',
    });
  });
});

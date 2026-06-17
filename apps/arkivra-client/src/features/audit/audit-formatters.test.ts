import { describe, expect, it } from 'vitest';
import {
  formatAuditAdvancedEntries,
  formatAuditEventTitle,
  formatAuditMetadataEntries,
  getAuditResourceLabel,
} from './audit-formatters';
import type { AuditLogItem } from './audit.types';

function auditEvent(overrides: Partial<AuditLogItem> = {}): AuditLogItem {
  return {
    id: 'aud_1',
    occurredAt: '2026-01-01T00:00:00.000Z',
    eventType: 'document.uploaded',
    eventCategory: 'document',
    severity: 'info',
    outcome: 'success',
    actorDisplayName: 'Anna',
    summary: 'Anna uploaded file',
    metadata: {},
    actorId: 'usr_1',
    actorType: 'user',
    vaultId: 'vlt_1',
    documentId: 'doc_1',
    targetType: 'document',
    targetId: 'doc_1',
    targetDisplayName: 'contract.pdf',
    source: 'web',
    ...overrides,
  };
}

describe('audit formatters', () => {
  it('formats card titles without actor names', () => {
    expect(formatAuditEventTitle(auditEvent({
      eventType: 'document.uploaded',
      summary: 'Anna uploaded file',
    }))).toBe('File uploaded');
  });

  it('keeps technical identifiers out of default metadata', () => {
    const entries = formatAuditMetadataEntries({
      file_name: 'contract.pdf',
      folder_id: 'fld_1',
      document_version_id: 'dvr_1',
      original_sha256_hash: 'abc123',
    });

    expect(entries).toEqual([
      { key: 'file_name', label: 'File Name', value: 'contract.pdf' },
    ]);
  });

  it('formats human resource labels from enriched audit context', () => {
    const event = auditEvent({
      resource: {
        vaultName: 'Legal',
        documentName: 'contract.pdf',
        documentPath: 'Legal / Agreements / contract.pdf',
        targetName: 'contract.pdf',
      },
    });

    expect(getAuditResourceLabel(event)).toBe('Legal / Agreements / contract.pdf');
  });

  it('includes names and ids in advanced details', () => {
    const event = auditEvent({
      metadata: {
        document_version_id: 'dvr_1',
        original_sha256_hash: 'abc123',
      },
      resource: {
        vaultName: 'Legal',
        documentName: 'contract.pdf',
        documentPath: 'Legal / contract.pdf',
        targetName: 'contract.pdf',
      },
    });

    const entries = formatAuditAdvancedEntries(event);

    expect(entries).toEqual(
      expect.arrayContaining([
        { key: 'resource_path', label: 'Resource Path', value: 'Legal / contract.pdf' },
        { key: 'vault_name', label: 'Vault Name', value: 'Legal' },
        { key: 'vault_id', label: 'Vault ID', value: 'vlt_1' },
        { key: 'document_name', label: 'File Name', value: 'contract.pdf' },
        { key: 'document_id', label: 'Document ID', value: 'doc_1' },
        { key: 'metadata.document_version_id', label: 'Document Version ID', value: 'dvr_1' },
        { key: 'metadata.original_sha256_hash', label: 'Original Sha256 Hash', value: 'abc123' },
      ]),
    );
  });
});

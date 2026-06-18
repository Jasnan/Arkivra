import type { SearchResultItem } from '@/features/search/search.types';
import type { VaultSummary } from '@/features/vaults/vaults.types';
import type {
  ChatContextDocumentRef,
  ChatContextSnapshot,
  ChatContextVaultRef,
} from '../chat.types';

export interface DraftChatVault {
  vaultId: string;
  name?: string;
}

export interface DraftChatDocument {
  vaultId: string;
  documentId: string;
  name?: string;
  vaultName?: string;
  path?: string;
  mimeType?: string;
}

export interface DraftChatContext {
  vaults: DraftChatVault[];
  documents: DraftChatDocument[];
}

export interface VaultListboxOption {
  label: string;
  value: string;
  description: string;
}

export interface DocumentListboxOption {
  label: string;
  value: string;
  description: string;
  disabled?: boolean;
  disabledReason?: string;
  document: SearchResultItem;
}

export interface ScrollToIndexDetails {
  index: number;
  getElement: () => HTMLElement | null;
  immediate?: boolean;
}

const EMPTY_DRAFT_CONTEXT: DraftChatContext = { vaults: [], documents: [] };

function optionalLabel(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : undefined;
}

export function vaultKey(vault: Pick<DraftChatVault, 'vaultId'>) {
  return vault.vaultId;
}

export function documentKey(document: Pick<DraftChatDocument, 'vaultId' | 'documentId'>) {
  return `${document.vaultId}:${document.documentId}`;
}

function dedupeVaults(vaults: DraftChatVault[]) {
  const seen = new Set<string>();
  const result: DraftChatVault[] = [];

  for (const vault of vaults) {
    const vaultId = vault.vaultId.trim();
    if (vaultId.length === 0 || seen.has(vaultId)) continue;
    seen.add(vaultId);
    result.push({
      vaultId,
      ...(optionalLabel(vault.name) ? { name: optionalLabel(vault.name) } : {}),
    });
  }

  return result;
}

function dedupeDocuments(documents: DraftChatDocument[], selectedVaultIds: Set<string>) {
  const seen = new Set<string>();
  const result: DraftChatDocument[] = [];

  for (const document of documents) {
    const vaultId = document.vaultId.trim();
    const documentId = document.documentId.trim();
    const key = `${vaultId}:${documentId}`;
    if (
      vaultId.length === 0 ||
      documentId.length === 0 ||
      selectedVaultIds.has(vaultId) ||
      seen.has(key)
    )
      continue;
    seen.add(key);
    result.push({
      vaultId,
      documentId,
      ...(optionalLabel(document.name) ? { name: optionalLabel(document.name) } : {}),
      ...(optionalLabel(document.vaultName)
        ? { vaultName: optionalLabel(document.vaultName) }
        : {}),
      ...(optionalLabel(document.path) ? { path: optionalLabel(document.path) } : {}),
      ...(optionalLabel(document.mimeType) ? { mimeType: optionalLabel(document.mimeType) } : {}),
    });
  }

  return result;
}

export function normalizeDraftContext(context: DraftChatContext): DraftChatContext {
  const vaults = dedupeVaults(context.vaults);
  const selectedVaultIds = new Set(vaults.map((vault) => vault.vaultId));

  return {
    vaults,
    documents: dedupeDocuments(context.documents, selectedVaultIds),
  };
}

export function isDocumentCoveredByVault(
  context: DraftChatContext,
  document: Pick<DraftChatDocument, 'vaultId'>,
) {
  const selectedVaultIds = new Set(
    normalizeDraftContext(context).vaults.map((vault) => vault.vaultId),
  );
  return selectedVaultIds.has(document.vaultId);
}

export function getEffectiveDraftDocuments(context: DraftChatContext) {
  return normalizeDraftContext(context).documents;
}

function pluralize(count: number, singular: string, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

export function getDraftContextSummary(context: DraftChatContext) {
  const normalized = normalizeDraftContext(context);
  const vaultCount = normalized.vaults.length;
  const individualFileCount = normalized.documents.length;
  const itemCount = vaultCount + individualFileCount;

  let label = 'All accessible vaults';

  if (vaultCount > 0 && individualFileCount > 0) {
    label = `${pluralize(vaultCount, 'vault')} and ${pluralize(individualFileCount, 'individual file')} attached`;
  } else if (vaultCount > 0) {
    label = `${pluralize(vaultCount, 'vault')} attached`;
  } else if (individualFileCount > 0) {
    label = `${pluralize(individualFileCount, 'file')} attached`;
  }

  return {
    vaultCount,
    individualFileCount,
    itemCount,
    hasContext: itemCount > 0,
    label,
  };
}

export type DocumentSelectionListItem =
  | { type: 'vault'; vaultId: string; vaultName: string; documentCount: number }
  | { type: 'document'; document: SearchResultItem };

export function groupDocumentSelectionItems(
  documents: SearchResultItem[],
): DocumentSelectionListItem[] {
  const groups = new Map<
    string,
    { vaultId: string; vaultName: string; documents: SearchResultItem[] }
  >();

  for (const document of documents) {
    const group = groups.get(document.vaultId) ?? {
      vaultId: document.vaultId,
      vaultName: document.vaultName,
      documents: [],
    };

    group.documents.push(document);
    groups.set(document.vaultId, group);
  }

  return Array.from(groups.values()).flatMap((group) => [
    {
      type: 'vault' as const,
      vaultId: group.vaultId,
      vaultName: group.vaultName,
      documentCount: group.documents.length,
    },
    ...group.documents.map((document) => ({ type: 'document' as const, document })),
  ]);
}

export function createEmptyDraftContext(): DraftChatContext {
  return EMPTY_DRAFT_CONTEXT;
}

export function getDraftContextFromScope({
  vaultId,
  documentId,
  documentName,
}: {
  vaultId?: string;
  documentId?: string;
  documentName?: string;
}): DraftChatContext {
  if (vaultId && documentId) {
    return {
      vaults: [],
      documents: [
        {
          vaultId,
          documentId,
          ...(optionalLabel(documentName) ? { name: optionalLabel(documentName) } : {}),
        },
      ],
    };
  }

  if (vaultId) {
    return { vaults: [{ vaultId }], documents: [] };
  }

  return createEmptyDraftContext();
}

export function draftContextFromSnapshot(snapshot: ChatContextSnapshot): DraftChatContext {
  if (snapshot.type === 'selection') {
    return normalizeDraftContext({
      vaults: snapshot.vaults.map((vault) => ({
        vaultId: vault.vaultId,
        name: vault.name,
      })),
      documents: snapshot.documents.map((document) => ({
        vaultId: document.vaultId,
        documentId: document.documentId,
        name: document.name,
        vaultName: document.vaultName,
        path: document.path,
      })),
    });
  }

  if (snapshot.type === 'document') {
    return {
      vaults: [],
      documents: [
        {
          vaultId: snapshot.vaultId,
          documentId: snapshot.documentId,
          name: snapshot.documentName,
          vaultName: snapshot.vaultName,
        },
      ],
    };
  }

  if (snapshot.type === 'vault') {
    return {
      vaults: [{ vaultId: snapshot.vaultId, name: snapshot.vaultName }],
      documents: [],
    };
  }

  return {
    vaults: snapshot.vaultIds.map((vaultId) => ({ vaultId })),
    documents: [],
  };
}

export function hydrateDraftContextLabels({
  context,
  vaults,
}: {
  context: DraftChatContext;
  vaults: VaultSummary[];
}): DraftChatContext {
  const vaultNameById = new Map(vaults.map((vault) => [vault.id, vault.name]));

  return normalizeDraftContext({
    vaults: context.vaults.map((vault) => ({
      ...vault,
      name: vault.name ?? vaultNameById.get(vault.vaultId),
    })),
    documents: context.documents.map((document) => ({
      ...document,
      vaultName: document.vaultName ?? vaultNameById.get(document.vaultId),
    })),
  });
}

export function contextSnapshotFromDraft(context: DraftChatContext): ChatContextSnapshot {
  const normalized = normalizeDraftContext(context);

  if (normalized.vaults.length === 0 && normalized.documents.length === 0) {
    return { type: 'global', vaultIds: [] };
  }

  if (normalized.vaults.length === 1 && normalized.documents.length === 0) {
    const [vault] = normalized.vaults;
    return {
      type: 'vault',
      vaultId: vault.vaultId,
      ...(vault.name ? { vaultName: vault.name } : {}),
    };
  }

  if (normalized.vaults.length === 0 && normalized.documents.length === 1) {
    const [document] = normalized.documents;
    return {
      type: 'document',
      vaultId: document.vaultId,
      documentId: document.documentId,
      ...(document.vaultName ? { vaultName: document.vaultName } : {}),
      ...(document.name ? { documentName: document.name } : {}),
    };
  }

  return {
    type: 'selection',
    vaults: normalized.vaults.map(
      (vault): ChatContextVaultRef => ({
        vaultId: vault.vaultId,
        ...(vault.name ? { name: vault.name } : {}),
      }),
    ),
    documents: normalized.documents.map(
      (document): ChatContextDocumentRef => ({
        vaultId: document.vaultId,
        documentId: document.documentId,
        ...(document.name ? { name: document.name } : {}),
        ...(document.vaultName ? { vaultName: document.vaultName } : {}),
        ...(document.path ? { path: document.path } : {}),
      }),
    ),
  };
}

export function addVaultsToDraftContext(
  context: DraftChatContext,
  vaults: DraftChatVault[],
): DraftChatContext {
  return normalizeDraftContext({
    vaults: [...context.vaults, ...vaults],
    documents: context.documents,
  });
}

export function addDocumentsToDraftContext(
  context: DraftChatContext,
  documents: DraftChatDocument[],
): DraftChatContext {
  return normalizeDraftContext({
    vaults: context.vaults,
    documents: [...context.documents, ...documents],
  });
}

export function removeVaultFromDraftContext(
  context: DraftChatContext,
  vaultId: string,
): DraftChatContext {
  return normalizeDraftContext({
    vaults: context.vaults.filter((vault) => vault.vaultId !== vaultId),
    documents: context.documents,
  });
}

export function removeDocumentFromDraftContext(
  context: DraftChatContext,
  document: Pick<DraftChatDocument, 'vaultId' | 'documentId'>,
): DraftChatContext {
  const key = documentKey(document);
  return normalizeDraftContext({
    vaults: context.vaults,
    documents: context.documents.filter((item) => documentKey(item) !== key),
  });
}

export function isDraftContextEmpty(context: DraftChatContext) {
  return context.vaults.length === 0 && context.documents.length === 0;
}

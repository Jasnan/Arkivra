export type Tag = {
  id: string;
  vaultId: string;
  name: string;
  color: string | null;
  createdAt: string | Date;
  updatedAt: string | Date;
};

export type AssignTagResult =
  | { success: true; tag: Tag }
  | { success: false; reason: 'document_not_found' | 'tag_not_found' };

export type TagsServices = {
  listTags: (args: { vaultId: string }) => Promise<Tag[]>;
  createTag: (args: { vaultId: string; name: string; color: string | null }) => Promise<Tag | null>;
  updateTag: (args: {
    tagId: string;
    vaultId: string;
    name: string;
    color: string | null;
  }) => Promise<Tag | null>;
  deleteTag: (args: { tagId: string; vaultId: string }) => Promise<{ id: string } | null>;
  listDocumentTags: (args: { vaultId: string; documentId: string }) => Promise<Tag[]>;
  assignTagToDocument: (args: {
    vaultId: string;
    documentId: string;
    tagId: string;
  }) => Promise<AssignTagResult>;
  removeTagFromDocument: (args: {
    vaultId: string;
    documentId: string;
    tagId: string;
  }) => Promise<{ documentId: string } | null>;
};

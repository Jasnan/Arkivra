export type ProcessDocumentJobData = {
  documentId: string;
  documentVersionId: string;
  vaultId: string;
  processingRunId?: string;
  replaceExisting?: boolean;
};

export type ProcessDocumentJobData = {
  documentId: string;
  vaultId: string;
  replaceExisting?: boolean;
  reprocessFromStoredArtifacts?: boolean;
};

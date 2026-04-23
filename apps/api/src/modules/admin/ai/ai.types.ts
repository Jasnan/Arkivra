export type AdminAiSettings = {
  enabled: boolean;
  ollamaHost: string;
  model: string;
  minTokenLength: number;
  maxCandidates: number;
  batchSize: number;
  logRequests: boolean;
};

export type AdminAiModel = {
  name: string;
  size: number | null;
  modifiedAt: string | null;
};

export type AdminAiModelAvailability = {
  host: string;
  model: string;
  reachable: boolean;
  modelAvailable: boolean;
  models: AdminAiModel[];
  error: string | null;
};

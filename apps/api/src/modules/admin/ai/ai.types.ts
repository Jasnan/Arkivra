export type AdminAiSettings = {
  ollamaHost: string;
  model: string;
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

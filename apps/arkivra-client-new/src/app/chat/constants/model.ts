export const MODELS = [
  {
    name: "Arkivra Assistant",
    value: "arkivra-assistant",
    disabled: false,
  },
  {
    name: "Document Q&A",
    value: "document-qa",
    disabled: true,
  },
  {
    name: "Vault Search",
    value: "vault-search",
    disabled: true,
  },
] as const

export type Model = (typeof MODELS)[number]
export type KnownModelId = Model["value"]

export const DEFAULT_MODEL_ID: KnownModelId = MODELS[0].value

export function docsModelOptions() {
  return MODELS.map((model) => ({
    id: model.value,
    name: model.name,
    ...(model.disabled ? { disabled: true as const } : undefined),
  }))
}

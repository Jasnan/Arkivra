---
title: AI Providers
description: Configure optional AI features and understand provider data exposure.
---

AI features are optional. Upload, parsing, vaults, document versions, full-text search, preview, download, trash, restore, and backups do not require an AI provider.

## Supported Runtime Paths

Arkivra currently supports these first-class runtime paths:

- Chat: Ollama-compatible chat endpoints or Google Gemini through the Gemini OpenAI-compatible endpoint.
- Translation: Ollama-compatible chat endpoints.
- Semantic indexing: Ollama-compatible embedding endpoints.

Provider settings are configured from the admin AI settings page. The default local provider endpoint comes from `ARKIVRA_OLLAMA_HOST`.

Ollama model selection is discovered from the configured Ollama endpoint. Arkivra reads the models available in Ollama and inspects their reported capabilities before showing them in chat, translation, and embedding pickers. Gemini model selection remains catalog-based.

## Ollama-Compatible Providers

Use an Ollama-compatible endpoint for local chat, translation, and embeddings:

```dotenv
ARKIVRA_OLLAMA_HOST=http://127.0.0.1:11434
```

Install or pull the Ollama models you want Arkivra to use, then choose chat, translation, and embedding models from the admin AI settings page. Semantic search also needs an embedding model and dimensions. Arkivra builds an embedding index from parsed document chunks before semantic search is available.

## Extending The Model Catalog

Admins can append custom non-Ollama catalog entries with `ARKIVRA_AI_MODEL_CATALOG_EXTENSIONS`. Ollama entries are discovered from the Ollama API instead of this environment variable. The value must be a JSON array:

```ts
{
  provider: 'gemini',
  model: string,
  label?: string,
  capabilities: Array<'chat' | 'vision' | 'embedding'>,
  embeddingDimensions?: number
}
```

`provider`, `model`, and at least one valid capability are required. `embeddingDimensions` is required for embedding models and must be a positive integer. Entries with the same `provider` and `model` as a built-in entry replace that built-in entry.

Add a custom Gemini model:

```dotenv
ARKIVRA_AI_MODEL_CATALOG_EXTENSIONS='[{"provider":"gemini","model":"gemini-custom-chat","label":"Custom Gemini Chat","capabilities":["chat","vision"]}]'
```

To add multiple models, put all entries in the same JSON array.

## Google Gemini Chat

Gemini can be selected for chat in the admin AI settings. Arkivra resolves the Gemini API key from an environment variable reference. By default, it looks for:

```dotenv
GEMINI_API_KEY=<gemini-api-key>
```

Admin settings store secret references, not raw API keys. Do not paste raw provider keys into fields meant for environment variable names.

## Data Exposure

With a local Ollama server, model context can remain inside the operator's infrastructure.

If an operator points Arkivra at a remote or hosted model endpoint, Arkivra sends selected or retrieved document context required for the request to that endpoint. That context may include portions of extracted document text or rendered image input for translation. Remote providers may log, retain, or process submitted data according to their own terms and configuration.

Do not enable remote AI endpoints for sensitive documents until the operator has reviewed the provider's data handling.

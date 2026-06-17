---
title: AI Providers
description: Configure optional AI features and understand provider data exposure.
---

# AI Providers

AI features are optional. Upload, parsing, vaults, document versions, full-text search, preview, download, trash, restore, and backups do not require an AI provider.

## Supported Runtime Paths

Arkivra currently supports these first-class runtime paths:

- Chat: Ollama-compatible chat endpoints or Google Gemini through the Gemini OpenAI-compatible endpoint.
- Translation: Ollama-compatible chat endpoints.
- Semantic indexing: Ollama-compatible embedding endpoints.

Provider settings are configured from the admin AI settings page. The default local provider values come from the `ARKIVRA_OLLAMA_*` environment variables.

## Ollama-Compatible Providers

Use an Ollama-compatible endpoint for local chat, translation, and embeddings:

```dotenv
ARKIVRA_OLLAMA_HOST=http://127.0.0.1:11434
ARKIVRA_OLLAMA_MODEL=gemma4:e4b
```

Semantic search also needs an embedding model and dimensions. Arkivra builds an embedding index from parsed document chunks before semantic search is available.

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

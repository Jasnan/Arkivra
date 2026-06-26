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

Provider settings are configured from environment variables and selected from the admin AI settings page. Set `ARKIVRA_OLLAMA_HOST` to make an Ollama-compatible provider available. Set `GEMINI_API_KEY` to make Gemini discovery and chat available.

Model selection is discovered from each provider. Arkivra reads Ollama models from the configured Ollama endpoint. For Gemini, Arkivra reads Google's native Models API metadata, intersects it with Google's OpenAI-compatible model listing, and exposes only models that report native methods Arkivra can use through the Gemini OpenAI-compatible chat or embeddings endpoints.

## Ollama-Compatible Providers

Use an Ollama-compatible endpoint for local chat, translation, and embeddings:

```dotenv
ARKIVRA_OLLAMA_HOST=http://127.0.0.1:11434
```

Install or pull the Ollama models you want Arkivra to use, then choose chat, translation, and embedding models from the admin AI settings page. Semantic search also needs an embedding model and dimensions. Arkivra builds an embedding index from parsed document chunks before semantic search is available.

## Google Gemini Chat

Gemini can be selected for chat in the admin AI settings. Arkivra resolves the Gemini API key from an environment variable reference. By default, it looks for:

```dotenv
GEMINI_API_KEY=<gemini-api-key>
```

Admin settings store secret references, not raw API keys. Do not paste raw provider keys into fields meant for environment variable names.

Gemini inference uses Google AI Studio's OpenAI-compatible endpoint. Gemini model discovery uses Google's native Models API for metadata and Google's OpenAI-compatible model listing for endpoint compatibility. Arkivra does not use a static Gemini catalog or fallback list. If discovery cannot query either endpoint, Arkivra treats Gemini as unavailable until discovery succeeds.

## Data Exposure

With a local Ollama server, model context can remain inside the operator's infrastructure.

If an operator points Arkivra at a remote or hosted model endpoint, Arkivra sends selected or retrieved document context required for the request to that endpoint. That context may include portions of extracted document text or rendered image input for translation. Remote providers may log, retain, or process submitted data according to their own terms and configuration.

Do not enable remote AI endpoints for sensitive documents until the operator has reviewed the provider's data handling.

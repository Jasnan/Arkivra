---
title: Providers and models
description: Configure optional AI features with Ollama, Google Gemini, or Privatemode.
---

Arkivra keeps AI disabled until a platform administrator configures providers, selects models, and enables the instance-wide AI switch. Uploads, Docling processing, previews, versions, tags, trash, and keyword search continue to work without AI.

## Supported provider paths

Arkivra currently discovers and uses models from:

- **Ollama-compatible endpoints** for chat, translation, embeddings, and optional ingestion-time image captioning;
- **Google Gemini** through Google's OpenAI-compatible inference endpoints for chat, translation, and embeddings, with the native Models API used during discovery.

These are the implemented first-class providers. Do not assume that an arbitrary OpenAI-compatible service will work merely because one inference path uses an OpenAI-compatible protocol.

## Configure Ollama

1. Run an Ollama-compatible service and pull the models you intend to use.
2. Set its base URL in the Arkivra environment:

   ```dotenv
   ARKIVRA_OLLAMA_HOST=http://127.0.0.1:11434
   ```

   From the repository Docker container to Ollama on the host, use:

   ```dotenv
   ARKIVRA_OLLAMA_HOST=http://host.docker.internal:11434
   ```

3. Restart Arkivra.
4. Open **Administration** → **AI Settings** and confirm Ollama is healthy and its models are discovered.

The Ollama base URL does not use an OpenAI `/v1` suffix in Arkivra's configuration. Arkivra calls the Ollama-compatible model and embedding routes it implements.

## Configure Gemini

1. Put the API key in the Arkivra process environment:

   ```dotenv
   GEMINI_API_KEY=<api-key>
   ```

2. Restart Arkivra.
3. Open **AI Settings** and confirm Google Gemini is healthy.

AI Settings stores the name of an environment variable containing the secret, not the raw key. The default reference is `GEMINI_API_KEY`. If you use another environment-variable name, configure that reference in the admin UI and make the variable available to both API and worker processes.

Arkivra checks Google's native model metadata against the OpenAI-compatible model listing and exposes models with capabilities usable by Arkivra. There is no static fallback catalog; discovery failure makes Gemini unavailable until it succeeds.

## Configure Privatemode

Privatemode is an additional provider for chat, embeddings, and translation. Document parsing still uses the existing parser. Arkivra connects through the official [Privatemode encryption proxy](https://docs.privatemode.ai/api/proxy-configuration/), which verifies the remote deployment, encrypts requests, and decrypts responses.

1. Obtain a Privatemode API key and run its proxy on a trusted network reachable by both the API and worker.
2. Configure both Arkivra processes:

   ```dotenv
   ARKIVRA_PRIVATEMODE_PROXY_URL=http://privatemode-proxy:8080/v1
   PRIVATEMODE_API_KEY=<api-key>
   ```

3. Restart Arkivra and open **Administration** → **AI Settings**. Refresh Privatemode to discover its live models.
4. Select chat models, a vision-capable translation model, and an embedding model independently of Ollama and Gemini.

For the production Docker stack, set `PRIVATEMODE_API_KEY` in `.env`, then use the optional overlay:

```bash
docker compose -f compose.production.yaml -f compose.privatemode.yaml up -d
```

The overlay does not publish a proxy port. The API key stays in the Arkivra process environment; Arkivra forwards it to the proxy. For production, set `PRIVATEMODE_PROXY_IMAGE` to a reviewed image digest. Keep request dumping disabled. If the proxy runs on another machine, enable TLS between Arkivra and the proxy.

The proxy URL must point to a trusted encryption proxy, not `api.privatemode.ai`. A plain OpenAI-compatible HTTP client cannot perform Privatemode's encryption and attestation on its own. The local Arkivra-to-proxy connection carries plaintext unless TLS is configured; encryption begins at the proxy. Provider protection does not add encryption to Arkivra's PostgreSQL text, chunks, embeddings, metadata, or chat history.

Models are discovered through `/v1/models`; there is no fallback model catalog. OCR models are excluded from chat selection. This integration supports 1,024-dimensional embeddings and uses the Qwen3 retrieval instruction for search queries while embedding document chunks without that prefix. Changing providers rebuilds the semantic index.

Translation uses general-purpose generation models, not a dedicated translation service. Choose a model reporting both chat and vision capability, such as GLM Flash when available, to support text, full-page, and selected-area translation. Translation quality should be evaluated for your documents. Models and capabilities can change; consult the [Privatemode model documentation](https://docs.privatemode.ai/models/overview/).

## Select models

AI Settings separates three choices:

- **Chat models** — choose the default and the additional models users may select.
- **Translation model** — choose the provider and model used for PDF translation.
- **Search engine** — choose the embedding provider, model, and dimensions used for semantic indexing.

Arkivra currently requires a complete embedding selection before the overall AI switch can be enabled. Chat and translation health are also reported as unavailable when the configured embedding platform is unhealthy, because the current AI configuration treats that search engine as a shared dependency.

Changing the embedding model or dimensions creates a new index rather than mixing incompatible vectors. Read [Semantic indexing](/ai/semantic-indexing/) before confirming that change.

## Enable AI for users

After providers and model choices are healthy, enable AI from the top of AI Settings. Then grant regular users the **Use AI** platform privilege under **Administration** → **Users**. Administrators receive platform capabilities implicitly.

AI privileges do not bypass vault permissions for regular users. Chat and semantic search restrict their source documents to readable vaults. Platform administrators have implemented instance-wide vault access; see [Users and permissions](/administration/users-and-permissions/).

## Optional image captioning

Arkivra can caption images extracted during document processing using an Ollama vision model:

```dotenv
ARKIVRA_OLLAMA_IMAGE_CAPTIONING_ENABLED=true
ARKIVRA_OLLAMA_IMAGE_CAPTIONING_MODEL=<vision-capable-model>
```

Captions become derived document text for search and embeddings. This runs during ingestion and is separate from the chat and translation model choices. It is disabled by default.

## Remote-provider data exposure

Arkivra sends the content needed for a request to the selected endpoint:

- retrieved document chunks, prompts, and conversation history for chat;
- query text for embeddings and semantic search;
- chunk text when building an embedding index;
- selected text or rendered page images for translation;
- extracted images for captioning when enabled.

A provider outside the operator's infrastructure may log, retain, or process this data under its own policies. Review [Privacy and security](/operations/privacy-and-security/) before enabling it.

## Diagnose provider problems

- Confirm the endpoint is reachable from both API and worker networks.
- For Gemini, confirm the referenced environment variable exists in both processes.
- For Privatemode, confirm the proxy URL and `PRIVATEMODE_API_KEY` are configured in both processes, and check the proxy’s attestation and connectivity logs.
- For Ollama, confirm the model is pulled and appears in model discovery.
- Reopen AI Settings and refresh health after changing environment configuration.
- Do not enable `ARKIVRA_OLLAMA_LOG_REQUESTS` with sensitive documents unless logs are deliberately protected and reviewed; it can expose provider payloads.

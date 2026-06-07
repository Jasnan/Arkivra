# Search And Optional AI

## Full-Text Search

Full-text search works without AI. After documents are uploaded and parsed, Arkivra stores extracted text and search data in PostgreSQL. Users can search by title, content, tags, dates, vaults, and other filters depending on the dashboard surface.

Full-text search remains the fallback when AI features are disabled or no active embedding index exists.

## Semantic Search

Semantic search requires all of the following:

- AI features enabled by an admin
- an Ollama-compatible embedding configuration
- an embedding model and dimensions
- a built and active embedding index
- vault-level AI access for the requesting user when using AI-enhanced retrieval

Changing the embedding model or dimensions requires building a new embedding index. Existing search can continue using the current active index until the new one is ready.

## Chat And Translation

AI chat and translation are optional. The current first-class provider path is Ollama-backed configuration from the admin AI settings. Arkivra can use an Ollama-compatible chat endpoint for document chat and translation. The available models depend on the configured endpoint.

## Data Exposure

With a local Ollama server, model context can remain inside the operator's infrastructure.

If an operator points Arkivra at a remote or hosted model endpoint, Arkivra sends selected or retrieved document context required for the request to that endpoint. That context may include portions of extracted document text or rendered image input for translation. Remote providers may log, retain, or process submitted data according to their own terms and configuration.

Do not enable remote AI endpoints for sensitive documents until the operator has reviewed the provider's data handling.

## Permissions

Vault membership and AI access are separate. A user may be able to read a vault without being allowed to use AI-assisted retrieval for that vault. Chat and semantic retrieval must stay within the user's authorized vault and document context.

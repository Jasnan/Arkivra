---
title: Chat and document context
description: Ask questions over accessible vaults, folders, and documents and verify answers with citations.
---

Chat is an optional retrieval-assisted feature. Arkivra finds relevant chunks from selected document context, sends that context and the conversation prompt to the configured chat model, and stores the resulting conversation and citations.

## Prerequisites

- An administrator has enabled AI and selected healthy chat and embedding models.
- A ready semantic index covers the documents you want to use.
- Your account has the **Use AI** platform privilege, unless you are an administrator.
- You can read every selected source through vault membership or administrator access.

## Start a chat

1. Open **Chat**.
2. Select the attachment control in the composer.
3. Choose any combination of accessible vaults, folders, or completed documents.
4. Enter a focused question and send it.

Selecting a vault covers its documents, so child folder and document selections in that vault are redundant and are removed from the effective selection. Selecting a folder likewise covers documents below it.

If you attach nothing, the composer labels the scope **All accessible vaults**. Use an explicit selection for questions that should not search across all of your available collections.

You can also begin from a document's **Chat about document** action or pass selected search results into a chat draft.

## Understand frozen context

Arkivra freezes the document-version manifest when the first user message is accepted. Later uploads, version restores, folder moves, or metadata changes do not silently switch that conversation to newer source content.

The context picker can display a previously selected item as unavailable after its source is deleted. Remove unavailable context to start a usable new scope. If a frozen source version is permanently removed, the existing conversation remains readable but rejects new generation requests that require that source.

## Review citations

Answers can include citations to retrieved chunks. Open a citation to review its source, page, and available preview. Treat citations as the path for checking the model's answer against the document; model output can still be incomplete or wrong.

A citation row is not a retention lock. Deleting a historical version or permanently deleting a document can remove the cited source while leaving the conversation and citation metadata as read-only history.

## Choose a model

The model selector shows only chat models an administrator enabled in AI Settings. One model is the instance default, and the user may select another allowed model for the request when multiple choices are available.

Changing the selected chat model does not change the embedding model used to retrieve source chunks. Retrieval and answer generation are separate parts of the request.

## Data sent to providers

Arkivra sends the prompt, relevant conversation history, and retrieved document context required for generation to the selected chat endpoint. With an operator-controlled local Ollama endpoint, this can remain on that infrastructure. With Gemini or a remote Ollama-compatible endpoint, it leaves the Arkivra process and is governed by that provider's configuration and terms.

See [Privacy and security](/operations/privacy-and-security/) before using remote providers for sensitive documents.

## Improve an answer

- Narrow the context to the smallest useful vault, folder, or set of documents.
- Ask for a specific fact, comparison, or summary rather than a vague topic.
- Open citations and compare them with the source.
- If retrieval misses obvious text, verify processing and semantic-index coverage.
- Start a new conversation when you need the newest document version.

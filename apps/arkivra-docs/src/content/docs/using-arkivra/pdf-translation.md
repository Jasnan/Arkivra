---
title: PDF translation
description: Translate text, a page, or a selected region between English and German.
---

PDF translation is an optional AI feature in the document preview. It translates a text selection, rendered page, or selected page region and returns text; it does not create a translated document version or modify the stored PDF.

## Prerequisites

- AI is enabled for the instance.
- Your account may use AI and can read the PDF's vault.
- An administrator selected a healthy translation model.
- The source is an active PDF that Arkivra can render.

The current implementation supports English (`en`) and German (`de`) as target languages. It assumes the other language as the source for the translation prompt; it is not a general multi-language translation system.

## Translate content

1. Open a PDF document and remain on **Preview**.
2. Open the translation control.
3. Choose the English or German target.
4. Select text, the current page, or a rectangular page region when the relevant control is available.
5. Submit and wait for the translated text.

Page and region requests send a PNG rendering to the model. Image payloads are limited to 8 MiB. Text requests are limited to 100,000 characters.

The result records which provider and model produced it, but Arkivra does not save it as a new source document. Copy the result into another workflow if it must be retained independently.

## Provider requirements

Arkivra can use either a selected Ollama or Gemini translation model. Image-based page and region translation needs a model capable of understanding the submitted image. A model that works for text-only translation may fail on image input.

An administrator configures the translation model separately from the default chat model. The feature also depends on the overall AI configuration being healthy; use [Providers and models](/ai/providers-and-models/) to review the setup.

## Privacy considerations

For text translation, Arkivra sends the selected extracted text and translation prompt. For page or region translation, it sends the rendered PNG and prompt. A remote provider can therefore receive document content even though the original PDF remains stored in Arkivra.

Do not use remote translation for sensitive material until the operator has reviewed the provider's logging, retention, region, and access policies.

## Troubleshooting

- **The translation control is absent:** confirm the document is a PDF, AI is enabled, and the account has the Use AI privilege.
- **Text works but a page fails:** select a vision-capable translation model and check the image-size limit.
- **The language pair is wrong:** current translation is limited to English and German; select the opposite target.
- **The provider returns an error:** check AI Settings, provider reachability, credentials, and the selected model's current availability.

Translation is experimental behavior in the current pre-1.0 project. Verify important translations against the source.

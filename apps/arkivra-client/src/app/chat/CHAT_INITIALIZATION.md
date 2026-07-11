# Chat page initialization

The composer is deliberately interactive while chat capability and model metadata are being checked. It is disabled only after the server reports that AI is disabled, the user lacks access, or no chat model is configured.

Model options use a stale-while-revalidate cache:

- Metadata up to 30 days old is read synchronously from memory or `localStorage`, so the selector has data on its first render.
- Every chat mount starts one shared `/api/chats/options` request in the background. Its response updates the selector without blocking the composer.
- Concurrent chat-page and model-picker reads share the same request.
- A failed refresh leaves cached options usable.
- Saving admin AI settings invalidates the cache and immediately starts a replacement refresh. Responses from refreshes started before that save are ignored for caching.

## Timing verification

Use DevTools with network throttling enabled, clear `arkivra.chat.model-options.v1` for a cold-cache run, and navigate to `/chat`. Measure from navigation start until the composer textarea accepts input; separately record completion of `/api/me` and `/api/chats/options`.

| Path | Before | After |
| --- | --- | --- |
| Cold cache | Composer waited for `/api/me` and then `/api/chats/options` | Composer accepts input on its first render; both requests are off the interaction-critical path |
| Warm cache | Composer still repeated and waited for both requests | Selector renders cached metadata on its first render and updates after one background request |
| Admin changes models | Existing chat cache could remain stale until expiry | Saving invalidates and refreshes the cache; the next chat mount also revalidates |

The eliminated network-dependent initialization time is therefore the full sequential latency of `/api/me` plus `/api/chats/options`. The remaining time-to-interactive is only the client render time; it no longer scales with API latency.

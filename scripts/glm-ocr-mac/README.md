# Native Apple Silicon SDK experiment

The isolated checkout is `~/glm-ocr-arkivra`, branch
`experiment/arkivra-mps-ollama`, based on SDK commit
`cef4d0ea120d1741f5cefe8985eee45f6c8eff1d` (0.1.5).
The original `~/glm-ocr` checkout and environment are not modified.

This reuses native Ollama at `127.0.0.1:11434` and its existing
`glm-ocr:q8_0` weights, copied into a repaired `glm-ocr-arkivra:q8_0` model.
Dependencies are isolated and pinned, including the
Transformers source revision from the original environment. Hugging Face model
caches are shared. The repaired GGUF uses about 1.6 GB additional persistent
disk space and a temporary copy during creation; the original model is preserved.

## Set up or reproduce

From the Arkivra root, with native ARM64 Python 3.12 and `uv` available:

```sh
bash scripts/glm-ocr-mac/setup.sh
```

Setup repairs missing `tokenizer.ggml.eot_token_id` metadata by registering
`<|user|>` as end-of-turn in a separate GGUF. This follows the workaround in
[Ollama PR #17195](https://github.com/ollama/ollama/pull/17195). Without it, our
installed model repeated text until its context filled, taking about 40 seconds
even for small regions. Textual stop sequences do not fix this control-token bug.
For an existing SDK environment, repair and regenerate configs with:

```sh
uv pip install --python ~/glm-ocr-arkivra/.venv/bin/python gguf==0.19.0
~/glm-ocr-arkivra/.venv/bin/python scripts/glm-ocr-mac/repair_model.py
~/glm-ocr-arkivra/.venv/bin/python scripts/glm-ocr-mac/configure.py ~/glm-ocr-arkivra
```

Stop and restart the SDK after changing configs. `configure.py --model NAME`
can select another tested model. Reapply the repair when replacing source weights.

The patch accepts explicit `mps` layout placement and fails before downloading a
model if MPS is unavailable. Automatic placement retains the SDK's original
CPU/CUDA behavior. The positional embedding calculation uses float64 on CPU,
then transfers its result to MPS; the detector's model and inference tensors use
MPS. PDF rasterization, image preparation, and portions of post-processing remain
on CPU. This does not use Apple's Neural Engine.

The same patch adds PDF data-URI decoding for Arkivra's HTTP requests and removes
source payloads from loader warning/error messages.

Complete CPU and MPS configs are generated from the SDK's bundled defaults,
preserving model IDs, label mappings, thresholds, and box formatting. Both use
one OCR worker and small queues. MaaS is disabled.

## Start and stop

Keep the Ollama app running. Start the SDK in a terminal:

```sh
bash scripts/glm-ocr-mac/run.sh
```

It listens on `http://127.0.0.1:5002`; stop it with Ctrl+C. To use CPU layout:

```sh
ARKIVRA_GLM_LAYOUT_DEVICE=cpu bash scripts/glm-ocr-mac/run.sh
```

`ARKIVRA_GLM_SDK_DIRECTORY` can override the checkout path. Do not run both SDK
servers simultaneously on the same port. CPU fallback for unsupported MPS
operations is not enabled by these scripts.

The launcher wraps the SDK with a local `/status` endpoint and serializes
document requests. Status includes elapsed time, loaded pages, queue sizes, OCR
call counts, and the last call's duration/status; it excludes document contents
and filenames. Queue sizes may include completion markers and skip regions, so
they are not a percentage or a reliable total region count.

```sh
curl -s http://127.0.0.1:5002/status | python3 -m json.tool
```

Arkivra sends a heartbeat every 30 seconds while extraction is in flight. A
missing heartbeat for 90 seconds requests cancellation after a worker restart.
Cancellation also occurs when Arkivra's HTTP request fails/times out. It stops
later regions; an already-running OCR call can take up to its 180-second timeout
to finish. The SDK retains its request gate until that call ends. A failed OCR
call fails the document instead of silently accepting incomplete extraction.
The local configuration disables automatic per-region HTTP retries.
The wrapper makes one exception: Ollama's specific repeated-token abort gets
one region retry with temperature 0.2, top-p 0.9, top-k 40, and repetition penalty
1.2. All other regions retain the SDK's original greedy settings. The retry can
change transcription, so review recovered regions on representative documents.
Status reports `ocr_region_retries` and a fixed `last_ocr_error_code`, never the
provider response body. Recognition failures return HTTP 502; cancellation and
timeout return 504. OCR client logs are redacted to prevent response-body leaks.

The complete document timeout defaults to 30 minutes. Set
`ARKIVRA_GLM_OCR_TIMEOUT_MS` on the API/worker to change it (maximum two hours).
The monitored service has an independent two-hour maximum. The dashboard's 30%
partitioning marker remains a stage indicator, not live OCR progress. Ollama
may be slow per region, so measure `/status` counts before declaring a stall.

## Evaluate

Chat uses persisted document-version/page membership as parent relationships.
Fine-grained GLM (and Docling element) hits expand to one ordered page context
when its text fits 3,600 characters. Larger pages use bounded reading-order and
geometric neighbors. Overlapping contexts merge when they fit; source regions,
boxes, and retrieved table/image assets remain available for citations. The
answer prompt retains region boundaries instead of truncating every region to
a short independent excerpt. Candidate loading prioritizes retrieved locations
and is capped at 256 chunks; the overall answer context remains bounded at
9,000 characters. These are context limits, not guarantees of complete pages.

This requires no re-upload, re-embedding, or additional graph database. Qdrant
still retrieves candidate regions, and PostgreSQL validates document/vault/version
visibility before assembling their parent context. A new chat question uses
this path; old answers are not regenerated. If OCR missed or misread characters,
context expansion cannot restore them. Test exact answers and citation highlights
on representative documents before merging the experiment.

```sh
curl http://127.0.0.1:5002/health
ARKIVRA_GLM_OCR_URL=http://127.0.0.1:5002 \
  pnpm --dir apps/arkivra-server eval:glm \
  /absolute/path/sample.pdf /tmp/arkivra-glm-review
ollama ps
```

Check Ollama's `PROCESSOR` column for GPU placement. This verifies the OCR model,
not the layout detector. The following benchmark verifies the layout model's
actual parameter device and synchronizes MPS before taking timings:

```sh
~/glm-ocr-arkivra/.venv/bin/python scripts/glm-ocr-mac/benchmark.py \
  ~/glm-ocr-arkivra/examples/source/page.png /tmp/arkivra-layout-benchmark \
  --config ~/glm-ocr-arkivra/arkivra-ollama-mps.yaml
```

It saves CPU/MPS region JSON, warm median timings, ordered-label agreement, and
box deltas in normalized 0–1000 coordinates. Matching labels/boxes on sample
images is a smoke test, not an accuracy guarantee for other documents. Measure
full extraction separately: Ollama OCR and layout share GPU/memory resources.

The native SDK setup alone does not start PostgreSQL, Qdrant, or Arkivra. For
host-run Arkivra, use `ARKIVRA_INGESTION_ENGINE=glm-ocr` and
`ARKIVRA_GLM_OCR_URL=http://127.0.0.1:5002`. The existing Docker SDK configuration
targets a different model server and is not used by this native experiment.

## Validation on this Mac

SDK unit tests, MPS smoke tests, PDF data-URI and redaction tests: **162 passed**.
The M2 layout model actually
ran on `mps:0` without general CPU fallback. On the public `page.png` sample,
warm median layout inference was 0.662 seconds on CPU and 0.371 seconds on MPS
(1.78×). Both produced the same 34 labels and boxes as an unordered set, but two
formula/formula-number pairs changed reading order. That is a known output
difference requiring evaluation on representative documents.

The public table sample produced the same single table region and identical
box on both backends. Arkivra's adapter successfully exported its live SDK/Ollama
result for both the image and a one-page PDF made from that image. That early
contract smoke test did not catch repeated OCR output. After the metadata repair,
a generated known-text image returned the exact text, stopped after 11 tokens,
and took 1.97 seconds including loading. A three-page uploaded PDF completed
SDK extraction in 16.67 seconds, persisted 26 chunks with bounding boxes across
all three pages, and reached completed/100% in Arkivra. This checks processing
and provenance persistence, not transcription accuracy. All 26 embeddings were
ready in PostgreSQL and all 26 points were present in Qdrant. The isolated live
PostgreSQL/Qdrant integration test also passed. Service tests cover
serialization, matching cancellation, expired leases, and rejecting partial
results after an OCR failure.
The next uploaded one-page PDF exposed a repeated-token abort and SDK image
regions with null text. After a bounded retry and accepting null only for image
regions, it completed with 42 boxed chunks. Image regions retain their crops and
provenance; text regions still reject null content. Six wrapper tests cover the
recovery path, exhausted retry, and failure isolation.
These are sample results, not a guarantee of end-to-end speed or OCR accuracy.

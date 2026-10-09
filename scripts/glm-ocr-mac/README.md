# Native Apple Silicon SDK experiment

The isolated checkout is `~/glm-ocr-arkivra`, branch
`experiment/arkivra-mps-ollama`, based on SDK commit
`cef4d0ea120d1741f5cefe8985eee45f6c8eff1d` (0.1.5).
The original `~/glm-ocr` checkout and environment are not modified.

This reuses native Ollama at `127.0.0.1:11434` and its existing
`glm-ocr:q8_0` weights. Dependencies are isolated and pinned, including the
Transformers source revision from the original environment. Hugging Face model
caches are shared; no copies of the OCR model are needed.

## Set up or reproduce

From the Arkivra root, with native ARM64 Python 3.12 and `uv` available:

```sh
bash scripts/glm-ocr-mac/setup.sh
```

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

## Evaluate

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
result for both the image and a one-page PDF made from that image. Ollama reported
`glm-ocr:q8_0` at `100% GPU` with a 4096-token context.
These are sample results, not a guarantee of end-to-end speed or OCR accuracy.

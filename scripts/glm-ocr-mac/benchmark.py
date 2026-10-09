"""Compare actual CPU/MPS layout inference; export regions without logging text."""
import argparse
import gc
import json
import statistics
import time
from pathlib import Path

import torch
from PIL import Image
from glmocr.config import load_config
from glmocr.layout.layout_detector import PPDocLayoutDetector

parser = argparse.ArgumentParser()
parser.add_argument("image", type=Path)
parser.add_argument("output", type=Path)
parser.add_argument("--config", required=True)
parser.add_argument("--runs", type=int, default=3)
args = parser.parse_args()
assert args.runs > 0
image = Image.open(args.image).convert("RGB")
args.output.mkdir(parents=True, exist_ok=True)
summary = {}
outputs = {}

for device in ("cpu", "mps"):
    config = load_config(args.config)
    config.pipeline.layout.device = device
    detector = PPDocLayoutDetector(config.pipeline.layout)
    detector.start()
    try:
        actual = str(next(detector._model.parameters()).device)
        assert actual.startswith(device), (device, actual)
        detector.process([image])  # Warm up both backends before timing.
        times = []
        for _ in range(args.runs):
            if device == "mps":
                torch.mps.synchronize()
            started = time.perf_counter()
            regions, _ = detector.process([image])
            if device == "mps":
                torch.mps.synchronize()
            times.append(time.perf_counter() - started)
        outputs[device] = regions[0]
        (args.output / f"layout-{device}.json").write_text(json.dumps(regions, indent=2))
        summary[device] = dict(device=actual, regions=len(regions[0]),
                               seconds=times, median_seconds=statistics.median(times))
        print(device, summary[device], flush=True)
    finally:
        detector.stop()
        gc.collect()
        if device == "mps":
            torch.mps.empty_cache()

cpu, mps = outputs["cpu"], outputs["mps"]
summary["comparison"] = dict(
    same_region_count=len(cpu) == len(mps),
    same_ordered_labels=[r["label"] for r in cpu] == [r["label"] for r in mps],
    same_regions_and_boxes_unordered=sorted(
        (r["label"], tuple(r["bbox_2d"])) for r in cpu
    ) == sorted((r["label"], tuple(r["bbox_2d"])) for r in mps),
    speedup=summary["cpu"]["median_seconds"] / summary["mps"]["median_seconds"],
)
if summary["comparison"]["same_ordered_labels"]:
    summary["comparison"]["max_bbox_delta_1000"] = max(
        (abs(a-b) for c,m in zip(cpu,mps) for a,b in zip(c["bbox_2d"],m["bbox_2d"])),
        default=0,
    )
(args.output / "benchmark.json").write_text(json.dumps(summary, indent=2))
print(summary["comparison"])

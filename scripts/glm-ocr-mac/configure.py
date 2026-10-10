"""Generate complete local configs from the SDK's packaged layout defaults."""
import argparse
from pathlib import Path

import yaml
import glmocr

parser = argparse.ArgumentParser()
parser.add_argument("directory", type=Path)
parser.add_argument("--model", default="glm-ocr-arkivra:q8_0")
args = parser.parse_args()
baseline = Path(glmocr.__file__).parent / "config.yaml"
for device in ("cpu", "mps"):
    config = yaml.safe_load(baseline.read_text())
    config["server"].update(host="127.0.0.1", port=5002, debug=False)
    config["logging"]["level"] = "WARNING"
    pipeline = config["pipeline"]
    pipeline["maas"]["enabled"] = False
    pipeline.update(max_workers=1, page_maxsize=2, region_maxsize=64)
    pipeline["ocr_api"].update(
        api_host="127.0.0.1", api_port=11434, api_path="/api/generate",
        api_mode="ollama_generate", model=args.model, api_url=None,
        api_key=None, request_timeout=180, retry_max_attempts=0,
    )
    pipeline["layout"].update(device=device, batch_size=1, workers=1)
    pipeline["result_formatter"]["output_format"] = "both"
    args.directory.mkdir(parents=True, exist_ok=True)
    target = args.directory / f"arkivra-ollama-{device}.yaml"
    target.write_text(yaml.safe_dump(config, sort_keys=False))
    print(target)

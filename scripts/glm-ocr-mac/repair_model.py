"""Copy a legacy local GLM-OCR GGUF with its missing EOT metadata restored."""
import argparse
import subprocess
import sys
import tempfile
from pathlib import Path

from gguf import GGUFReader


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", default="glm-ocr:q8_0")
    parser.add_argument("--target", default="glm-ocr-arkivra:q8_0")
    args = parser.parse_args()
    if args.source == args.target:
        parser.error("Use a separate target to preserve the original model")
    modelfile = subprocess.check_output(
        ["ollama", "show", "--modelfile", args.source], text=True
    )
    source = next((line[5:].strip() for line in modelfile.splitlines()
                   if line.startswith("FROM ")), None)
    if not source or not Path(source).is_file():
        parser.error("The source must be a locally installed GGUF model")
    reader = GGUFReader(source)
    architecture = reader.fields.get("general.architecture")
    if architecture is None or architecture.contents() != "glmocr":
        parser.error("The source is not a GLM-OCR GGUF")
    needs_repair = "tokenizer.ggml.eot_token_id" not in reader.fields
    del reader
    with tempfile.TemporaryDirectory(prefix="arkivra-glm-eot-") as directory:
        repaired = Path(directory) / "model.gguf"
        if needs_repair:
            subprocess.run([
                str(Path(sys.executable).with_name("gguf-new-metadata")),
                "--special-token", "eot", "<|user|>", source, str(repaired), "--force",
            ], check=True)
            reader = GGUFReader(str(repaired))
            assert "tokenizer.ggml.eot_token_id" in reader.fields
            del reader
        else:
            repaired = Path(source)
        recipe = Path(directory) / "Modelfile"
        recipe.write_text("\n".join(
            f"FROM {repaired}" if line.startswith("FROM ") else line
            for line in modelfile.splitlines()
        ) + "\n")
        subprocess.run(["ollama", "create", args.target, "-f", str(recipe)], check=True)
    print(f"Local OCR model ready: {args.target}")


if __name__ == "__main__":
    main()

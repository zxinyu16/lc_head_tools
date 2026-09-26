"""Local macOS PDF OCR for development samples. Never uploads source files."""

import argparse
import subprocess
import tempfile
from pathlib import Path

import fitz


def main():
    parser = argparse.ArgumentParser(description="Recognize PDF pages locally with macOS Vision")
    parser.add_argument("pdf", type=Path)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    source = fitz.open(args.pdf)
    if not source.page_count:
        raise SystemExit("PDF has no pages")
    output = []
    with tempfile.TemporaryDirectory(prefix="lc-ocr-") as folder:
        for index, page in enumerate(source):
            image = Path(folder) / f"page-{index + 1}.png"
            page.get_pixmap(matrix=fitz.Matrix(2, 2)).save(image)
            result = subprocess.run(
                ["swift", str(Path(__file__).with_name("ocr-image.swift")), str(image)],
                check=True, capture_output=True, text=True,
            )
            output.append(result.stdout.strip())
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text("\n".join(output) + "\n", encoding="utf-8")
    print(f"Recognized {len(output)} page(s): {args.output}")


if __name__ == "__main__":
    main()

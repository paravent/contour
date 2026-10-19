"""TEMPORARY (removed before merge): post contact sheets as base64 annotations, so they can be read back through the API."""
import base64
import sys
from pathlib import Path

folder, first, last, size = Path(sys.argv[1]), int(sys.argv[2]), int(sys.argv[3]), int(sys.argv[4])
for path in sorted(folder.glob("sheet*.png"))[first:last]:
    data = base64.b64encode(path.read_bytes()).decode()
    parts = [data[i:i + size] for i in range(0, len(data), size)]
    for k, part in enumerate(parts):
        print(f"::notice title={path.stem} {k + 1}/{len(parts)}::{part}", flush=True)

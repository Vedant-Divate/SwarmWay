"""Export the FastAPI OpenAPI schema to docs/contracts/openapi-v1.json.

Run:  uv run python scripts/export_openapi.py

This is the committed, diffable contract copy referenced by Section 7.6.
"""

from __future__ import annotations

import json
import os

from swarmway.api.app import app

OUT = os.path.join('docs', 'contracts', 'openapi-v1.json')


def main() -> int:
    schema = app.openapi()
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, 'w', encoding='utf-8') as fh:
        json.dump(schema, fh, indent=2, sort_keys=True)
        fh.write('\n')
    print(f'wrote {OUT}')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())

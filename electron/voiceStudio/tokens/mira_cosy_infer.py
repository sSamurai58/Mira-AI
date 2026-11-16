#!/usr/bin/env python3
"""
Optional CosyVoice infer entrypoint for Mira.

Set:
  COSYVOICE_HOME=/path/to/this/dir/or/cosy/checkout
  COSYVOICE_PYTHON=python3

Install CosyVoice per upstream, then replace the body of `main()` with a real
call. Until then this script exits 2 so Mira falls back to neural+speaker pack.
"""
from __future__ import annotations

import argparse
import sys


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--text", required=True)
    p.add_argument("--out", required=True)
    p.add_argument("--speaker", default="")
    p.add_argument("--ref", default="")
    p.add_argument("--instruct", default="")
    p.add_argument("--speed", type=float, default=1.0)
    args = p.parse_args()

    print(
        "mira_cosy_infer: stub only — wire CosyVoice 2/3 here, then re-run.",
        file=sys.stderr,
    )
    print(f"text={args.text[:80]!r} out={args.out}", file=sys.stderr)
    return 2


if __name__ == "__main__":
    raise SystemExit(main())

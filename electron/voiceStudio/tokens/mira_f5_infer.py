#!/usr/bin/env python3
"""
Mira ↔ F5-TTS infer entrypoint.

Env:
  F5_HOME          — optional (weights cache / working dir)
  F5_PYTHON        — python with `f5-tts` installed
  F5_CKPT          — optional hf:// or local safetensors path
  F5_VOCAB         — optional vocab.txt
  F5_DEVICE        — cuda|cpu|mps (default: auto)

Install:  pip install f5-tts
Docs:     https://github.com/SWivid/F5-TTS
RU ckpt:  see src/f5_tts/infer/SHARED.md (community HotDro4illa etc.)

Exit 2 on missing deps so Mira falls back to stitch / neural.
"""
from __future__ import annotations

import argparse
import os
import sys


def _device() -> str:
    forced = (os.environ.get("F5_DEVICE") or "").strip().lower()
    if forced:
        return forced
    try:
        import torch

        if torch.cuda.is_available():
            return "cuda"
        if getattr(torch.backends, "mps", None) and torch.backends.mps.is_available():
            return "mps"
    except Exception:
        pass
    return "cpu"


def main() -> int:
    p = argparse.ArgumentParser(description="Mira F5-TTS sidecar")
    p.add_argument("--text", required=True)
    p.add_argument("--out", required=True)
    p.add_argument("--ref", default="", help="Reference speaker WAV")
    p.add_argument("--speed", type=float, default=1.0)
    p.add_argument("--language", default="ru")
    args = p.parse_args()

    if not args.ref or not os.path.isfile(args.ref):
        print("mira_f5_infer: --ref WAV required for zero-shot clone", file=sys.stderr)
        return 2

    try:
        from f5_tts.api import F5TTS  # type: ignore
    except Exception as err:
        print(
            "mira_f5_infer: install f5-tts first (`pip install f5-tts`): "
            f"{err}",
            file=sys.stderr,
        )
        return 2

    device = _device()
    ckpt = (os.environ.get("F5_CKPT") or "").strip() or None
    vocab = (os.environ.get("F5_VOCAB") or "").strip() or None

    try:
        # F5TTS() loads v1 base by default; pass ckpt/vocab when set.
        kwargs = {"device": device}
        if ckpt:
            kwargs["ckpt_file"] = ckpt
        if vocab:
            kwargs["vocab_file"] = vocab
        tts = F5TTS(**kwargs)

        # API variants across f5-tts versions:
        #   infer(ref_file, ref_text, gen_text, ...)
        #   infer(..., file_wave=out)
        ref_text = (os.environ.get("F5_REF_TEXT") or "").strip() or " "
        gen = args.text
        out = args.out
        os.makedirs(os.path.dirname(out) or ".", exist_ok=True)

        if hasattr(tts, "infer"):
            # Prefer writing wave via file_wave when supported
            try:
                tts.infer(
                    ref_file=args.ref,
                    ref_text=ref_text,
                    gen_text=gen,
                    file_wave=out,
                    speed=float(args.speed) if args.speed else 1.0,
                )
            except TypeError:
                wav, sr, _ = tts.infer(
                    ref_file=args.ref,
                    ref_text=ref_text,
                    gen_text=gen,
                    speed=float(args.speed) if args.speed else 1.0,
                )
                import soundfile as sf

                sf.write(out, wav, sr)
        else:
            print("mira_f5_infer: F5TTS has no infer()", file=sys.stderr)
            return 2
    except Exception as err:
        print(f"mira_f5_infer: failed: {err}", file=sys.stderr)
        return 2

    if not os.path.isfile(args.out):
        print("mira_f5_infer: no output wav", file=sys.stderr)
        return 2
    print(f"mira_f5_infer: ok device={device} out={args.out}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

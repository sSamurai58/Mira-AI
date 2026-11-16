#!/usr/bin/env python3
"""
Mira ↔ Chatterbox (Resemble) infer entrypoint.

Env:
  CHATTERBOX_HOME
  CHATTERBOX_PYTHON
  CHATTERBOX_MODEL = multilingual | turbo | nano  (default multilingual)
  CHATTERBOX_DEVICE = cuda | cpu | mps

Install:  pip install chatterbox-tts
Note:    upstream retired Aug 2026 — archive MIT, no support.

Every Chatterbox WAV may embed PerTh watermark (Resemble).
"""
from __future__ import annotations

import argparse
import os
import sys


def _device() -> str:
    forced = (os.environ.get("CHATTERBOX_DEVICE") or "").strip().lower()
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
    p = argparse.ArgumentParser(description="Mira Chatterbox sidecar")
    p.add_argument("--text", required=True)
    p.add_argument("--out", required=True)
    p.add_argument("--ref", default="")
    p.add_argument("--speed", type=float, default=1.0)
    p.add_argument("--language", default="ru")
    p.add_argument(
        "--model",
        default=os.environ.get("CHATTERBOX_MODEL", "multilingual"),
        choices=("multilingual", "turbo", "nano"),
    )
    args = p.parse_args()
    device = _device()
    os.makedirs(os.path.dirname(args.out) or ".", exist_ok=True)

    try:
        import torch
        import torchaudio as ta
    except Exception as err:
        print(f"mira_chatterbox_infer: need torch/torchaudio: {err}", file=sys.stderr)
        return 2

    try:
        if args.model in ("turbo", "nano"):
            from chatterbox.tts_turbo import ChatterboxTurboTTS  # type: ignore

            model = ChatterboxTurboTTS.from_pretrained(
                device=device, nano=(args.model == "nano")
            )
            if not args.ref or not os.path.isfile(args.ref):
                print(
                    "mira_chatterbox_infer: turbo/nano require --ref WAV",
                    file=sys.stderr,
                )
                return 2
            wav = model.generate(args.text, audio_prompt_path=args.ref)
            sr = model.sr
        else:
            from chatterbox.mtl_tts import ChatterboxMultilingualTTS  # type: ignore

            model = ChatterboxMultilingualTTS.from_pretrained(
                device=device, t3_model="v3"
            )
            gen_kwargs = {"language_id": (args.language or "ru")[:2]}
            if args.ref and os.path.isfile(args.ref):
                gen_kwargs["audio_prompt_path"] = args.ref
            wav = model.generate(args.text, **gen_kwargs)
            sr = model.sr
    except Exception as err:
        print(
            "mira_chatterbox_infer: install chatterbox-tts / load failed: "
            f"{err}",
            file=sys.stderr,
        )
        return 2

    try:
        # Optional crude speed via resample (Chatterbox has no universal speed kw)
        speed = float(args.speed) if args.speed else 1.0
        if abs(speed - 1.0) > 0.05 and wav is not None:
            new_sr = max(8000, int(sr * speed))
            wav = ta.functional.resample(wav, sr, new_sr)
            # write at original sr by resampling back for stable Mira 16k join
            wav = ta.functional.resample(wav, new_sr, sr)
        if wav.dim() == 1:
            wav = wav.unsqueeze(0)
        ta.save(args.out, wav.cpu(), sr)
    except Exception as err:
        print(f"mira_chatterbox_infer: write failed: {err}", file=sys.stderr)
        return 2

    if not os.path.isfile(args.out):
        print("mira_chatterbox_infer: no output wav", file=sys.stderr)
        return 2
    print(
        f"mira_chatterbox_infer: ok model={args.model} device={device} out={args.out}",
        file=sys.stderr,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

"""Синтез речи твоими весами (Griffin-Lim как учебный вокодер)."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

import torch
import torchaudio
import yaml

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "src"))

from mira_tts.audio import griffin_lim
from mira_tts.model import MiniTTS
from mira_tts.text import encode


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--checkpoint", default=str(ROOT / "checkpoints" / "latest.pt"))
    parser.add_argument("--text", required=True, help="русский текст")
    parser.add_argument("--out", default="out.wav")
    parser.add_argument("--max-frames", type=int, default=400)
    args = parser.parse_args()

    blob = torch.load(args.checkpoint, map_location="cpu")
    cfg = blob["cfg"]
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")

    model = MiniTTS(cfg).to(device)
    model.load_state_dict(blob["model"])
    model.eval()

    ids = torch.tensor(encode(args.text), dtype=torch.long, device=device).unsqueeze(0)
    lens = torch.tensor([ids.size(1)], dtype=torch.long, device=device)

    with torch.no_grad():
        out = model(
            ids,
            lens,
            mel=None,
            teacher_forcing=0.0,
            max_frames=args.max_frames,
        )
        mel = out["mel_post"][0].transpose(0, 1).cpu()  # [n_mels, T]

    wav = griffin_lim(
        mel,
        sample_rate=cfg["sample_rate"],
        n_fft=cfg["n_fft"],
        hop_length=cfg["hop_length"],
        win_length=cfg["win_length"],
        n_mels=cfg["n_mels"],
        fmin=cfg["fmin"],
        fmax=cfg["fmax"],
    )
    torchaudio.save(args.out, wav.unsqueeze(0), cfg["sample_rate"])
    print(f"saved {args.out}")


if __name__ == "__main__":
    main()
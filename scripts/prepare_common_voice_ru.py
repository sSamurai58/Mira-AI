"""
Подготовка русского Common Voice → формат Mira (WAV + metadata.csv).

1) Скачай Russian на https://commonvoice.mozilla.org/ru/datasets и распакуй.
2) python scripts/prepare_common_voice_ru.py --cv-dir путь/к/cv-corpus-*/ru --out data/ru --max-hours 1
"""

from __future__ import annotations

import argparse
import csv
from pathlib import Path

import torch
import torchaudio


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--cv-dir", required=True, help="папка ru из Common Voice")
    parser.add_argument("--out", default="data/ru")
    parser.add_argument(
        "--split", default="validated", choices=["validated", "train", "dev"]
    )
    parser.add_argument("--max-hours", type=float, default=1.0)
    parser.add_argument("--max-chars", type=int, default=100)
    parser.add_argument("--sample-rate", type=int, default=22050)
    args = parser.parse_args()

    cv = Path(args.cv_dir)
    tsv = cv / f"{args.split}.tsv"
    clips = cv / "clips"
    if not tsv.exists():
        raise SystemExit(f"Не найден {tsv}")
    if not clips.exists():
        raise SystemExit(f"Не найдена {clips}")

    out = Path(args.out)
    wavs = out / "wavs"
    wavs.mkdir(parents=True, exist_ok=True)

    selected_sec = 0.0
    meta_lines: list[str] = []
    idx = 0

    with tsv.open(encoding="utf-8") as f:
        reader = csv.DictReader(f, delimiter="\t")
        for row in reader:
            if selected_sec / 3600.0 >= args.max_hours:
                break
            text = (row.get("sentence") or "").strip().replace("|", " ")
            path = (row.get("path") or "").strip()
            if not text or not path or len(text) > args.max_chars:
                continue
            low = text.lower()
            if not any("а" <= ch <= "я" or ch == "ё" for ch in low):
                continue
            src = clips / path
            if not src.exists():
                continue

            try:
                wav, sr = torchaudio.load(str(src))
            except Exception as exc:  # noqa: BLE001
                print(f"пропуск {src.name}: {exc}")
                continue

            if wav.size(0) > 1:
                wav = wav.mean(dim=0, keepdim=True)
            if sr != args.sample_rate:
                wav = torchaudio.functional.resample(wav, sr, args.sample_rate)

            dur = wav.size(1) / float(args.sample_rate)
            if dur < 0.4 or dur > 12.0:
                continue

            dst_name = f"{idx:06d}.wav"
            torchaudio.save(str(wavs / dst_name), wav, args.sample_rate)
            meta_lines.append(f"wavs/{dst_name}|{text}")
            selected_sec += dur
            idx += 1
            if idx % 50 == 0:
                print(f"... {idx} файлов, ~{selected_sec / 3600:.2f} ч")

    (out / "metadata.csv").write_text("\n".join(meta_lines) + "\n", encoding="utf-8")
    print(f"готово: {len(meta_lines)} фраз, ~{selected_sec / 3600:.2f} ч → {out}")


if __name__ == "__main__":
    main()
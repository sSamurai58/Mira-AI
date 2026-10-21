"""
Свой русский голос без Common Voice.

Положи файлы так:
  raw_recordings/
    0001.wav
    0001.txt   ← тот же текст, что произнесён
    0002.wav
    0002.txt
    ...

Запуск:
  python scripts/prepare_own_voice.py --src raw_recordings --out data/ru
"""

from __future__ import annotations

import argparse
import shutil
from pathlib import Path


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--src", required=True)
    parser.add_argument("--out", default="data/ru")
    args = parser.parse_args()

    src = Path(args.src)
    out = Path(args.out)
    wavs = out / "wavs"
    wavs.mkdir(parents=True, exist_ok=True)

    lines: list[str] = []
    wav_files = sorted(
        list(src.glob("*.wav")) + list(src.glob("*.flac")) + list(src.glob("*.mp3"))
    )
    if not wav_files:
        raise SystemExit(f"В {src} нет аудиофайлов")

    for i, wav in enumerate(wav_files):
        txt = wav.with_suffix(".txt")
        if not txt.exists():
            print(f"пропуск {wav.name}: нет {txt.name}")
            continue
        text = txt.read_text(encoding="utf-8").strip().replace("|", " ")
        if not text:
            continue
        dst_name = f"{i:06d}{wav.suffix.lower()}"
        shutil.copy2(wav, wavs / dst_name)
        lines.append(f"wavs/{dst_name}|{text}")

    (out / "metadata.csv").write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"готово: {len(lines)} пар → {out}")


if __name__ == "__main__":
    main()
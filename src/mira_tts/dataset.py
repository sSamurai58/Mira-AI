"""Датасет пар (текст, mel) в простом формате Mira."""

from __future__ import annotations

from pathlib import Path

import torch
from torch.nn.utils.rnn import pad_sequence
from torch.utils.data import Dataset

from .audio import load_wav, mel_spectrogram
from .text import PAD_ID, encode


class RuTTSDataset(Dataset):
    """
    Ожидает:
      data_dir/metadata.csv   — строки: relative_wav_path|текст
      data_dir/wavs/...       — wav-файлы
    """

    def __init__(self, data_dir: str | Path, cfg: dict):
        self.data_dir = Path(data_dir)
        self.cfg = cfg
        meta_path = self.data_dir / "metadata.csv"
        if not meta_path.exists():
            raise FileNotFoundError(
                f"Нет {meta_path}. Сначала подготовь данные "
                f"(scripts/prepare_common_voice_ru.py или свой metadata.csv)."
            )

        self.items: list[tuple[Path, str]] = []
        for line in meta_path.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line or "|" not in line:
                continue
            rel, text = line.split("|", 1)
            wav_path = self.data_dir / rel.strip()
            text = text.strip()
            if wav_path.exists() and text:
                self.items.append((wav_path, text))

        if not self.items:
            raise RuntimeError(f"В {meta_path} нет валидных строк.")

    def __len__(self) -> int:
        return len(self.items)

    def __getitem__(self, idx: int) -> dict:
        wav_path, text = self.items[idx]
        wav = load_wav(str(wav_path), self.cfg["sample_rate"])
        mel = mel_spectrogram(
            wav,
            sample_rate=self.cfg["sample_rate"],
            n_fft=self.cfg["n_fft"],
            hop_length=self.cfg["hop_length"],
            win_length=self.cfg["win_length"],
            n_mels=self.cfg["n_mels"],
            fmin=self.cfg["fmin"],
            fmax=self.cfg["fmax"],
        )  # [n_mels, T]

        text_ids = torch.tensor(encode(text), dtype=torch.long)

        # Обрезка слишком длинных примеров (CPU)
        if text_ids.numel() > self.cfg["max_text_len"]:
            text_ids = text_ids[: self.cfg["max_text_len"]]
        if mel.size(1) > self.cfg["max_mel_len"]:
            mel = mel[:, : self.cfg["max_mel_len"]]

        return {
            "text": text_ids,
            "mel": mel.transpose(0, 1),  # [T, n_mels]
            "text_len": text_ids.numel(),
            "mel_len": mel.size(1),
        }


def collate_batch(batch: list[dict]) -> dict:
    texts = [b["text"] for b in batch]
    mels = [b["mel"] for b in batch]
    text_lens = torch.tensor([b["text_len"] for b in batch], dtype=torch.long)
    mel_lens = torch.tensor([b["mel_len"] for b in batch], dtype=torch.long)

    texts_pad = pad_sequence(texts, batch_first=True, padding_value=PAD_ID)
    mels_pad = pad_sequence(mels, batch_first=True, padding_value=0.0)

    stop_targets = torch.zeros(mels_pad.size(0), mels_pad.size(1))
    for i, length in enumerate(mel_lens):
        stop_targets[i, length - 1 :] = 1.0

    return {
        "text": texts_pad,
        "mel": mels_pad,
        "text_lens": text_lens,
        "mel_lens": mel_lens,
        "stop_targets": stop_targets,
    }
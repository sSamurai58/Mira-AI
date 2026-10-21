"""Обучение Mini-TTS с нуля на русском датасете."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

import torch
import yaml
from torch.utils.data import DataLoader, random_split
from tqdm import tqdm

# чтобы `python -m mira_tts.train` и прямой запуск работали из корня репо
ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "src"))

from mira_tts.dataset import RuTTSDataset, collate_batch
from mira_tts.model import MiniTTS, tts_loss


def load_cfg(path: str) -> dict:
    with open(path, encoding="utf-8") as f:
        return yaml.safe_load(f)


def main() -> None:
    parser = argparse.ArgumentParser(description="Train Russian Mini-TTS from scratch")
    parser.add_argument(
        "--config",
        default=str(ROOT / "configs" / "tts_ru_cpu.yaml"),
    )
    parser.add_argument("--resume", default=None, help="путь к checkpoint .pt")
    args = parser.parse_args()

    cfg = load_cfg(args.config)
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"device={device}")

    dataset = RuTTSDataset(cfg["data_dir"], cfg)
    n_val = max(1, int(0.05 * len(dataset)))
    n_train = len(dataset) - n_val
    train_ds, val_ds = random_split(
        dataset,
        [n_train, n_val],
        generator=torch.Generator().manual_seed(42),
    )

    train_loader = DataLoader(
        train_ds,
        batch_size=cfg["batch_size"],
        shuffle=True,
        collate_fn=collate_batch,
        num_workers=0,
    )
    val_loader = DataLoader(
        val_ds,
        batch_size=cfg["batch_size"],
        shuffle=False,
        collate_fn=collate_batch,
        num_workers=0,
    )

    model = MiniTTS(cfg).to(device)
    optim = torch.optim.Adam(model.parameters(), lr=cfg["learning_rate"])
    start_epoch = 1

    ckpt_dir = Path(cfg["checkpoint_dir"])
    ckpt_dir.mkdir(parents=True, exist_ok=True)

    if args.resume:
        blob = torch.load(args.resume, map_location=device)
        model.load_state_dict(blob["model"])
        optim.load_state_dict(blob["optim"])
        start_epoch = blob.get("epoch", 0) + 1
        print(f"resume from {args.resume}, epoch={start_epoch}")

    for epoch in range(start_epoch, cfg["epochs"] + 1):
        model.train()
        running = 0.0
        pbar = tqdm(train_loader, desc=f"epoch {epoch}/{cfg['epochs']}")
        for step, batch in enumerate(pbar, start=1):
            batch = {
                k: v.to(device) if torch.is_tensor(v) else v for k, v in batch.items()
            }
            optim.zero_grad(set_to_none=True)
            out = model(
                batch["text"],
                batch["text_lens"],
                mel=batch["mel"],
                mel_lens=batch["mel_lens"],
                teacher_forcing=cfg["teacher_forcing"],
            )
            losses = tts_loss(out, batch)
            losses["total"].backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), cfg["grad_clip"])
            optim.step()

            running += float(losses["total"])
            if step % cfg["log_every"] == 0:
                pbar.set_postfix(
                    loss=f"{running / step:.4f}",
                    mel=f"{float(losses['mel']):.4f}",
                )

        model.eval()
        val_loss = 0.0
        with torch.no_grad():
            for batch in val_loader:
                batch = {
                    k: v.to(device) if torch.is_tensor(v) else v
                    for k, v in batch.items()
                }
                out = model(
                    batch["text"],
                    batch["text_lens"],
                    mel=batch["mel"],
                    mel_lens=batch["mel_lens"],
                    teacher_forcing=1.0,
                )
                val_loss += float(tts_loss(out, batch)["total"])
        val_loss /= max(1, len(val_loader))
        print(f"epoch {epoch}: train_loss={running / max(1, len(train_loader)):.4f} val_loss={val_loss:.4f}")

        path = ckpt_dir / f"mini_tts_ru_epoch{epoch:03d}.pt"
        torch.save(
            {
                "epoch": epoch,
                "model": model.state_dict(),
                "optim": optim.state_dict(),
                "cfg": cfg,
                "val_loss": val_loss,
            },
            path,
        )
        torch.save(
            {"epoch": epoch, "model": model.state_dict(), "cfg": cfg},
            ckpt_dir / "latest.pt",
        )
        print(f"saved {path}")


if __name__ == "__main__":
    main()
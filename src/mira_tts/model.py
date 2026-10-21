"""Учебный encoder–attention–decoder TTS (своя архитектура, обучение с нуля)."""

from __future__ import annotations

import torch
import torch.nn as nn
import torch.nn.functional as F

from .text import PAD_ID, vocab_size


class Encoder(nn.Module):
    def __init__(self, emb_dim: int, hidden: int, dropout: float):
        super().__init__()
        self.emb = nn.Embedding(vocab_size(), emb_dim, padding_idx=PAD_ID)
        self.convs = nn.ModuleList(
            [
                nn.Conv1d(emb_dim, emb_dim, kernel_size=5, padding=2)
                for _ in range(3)
            ]
        )
        self.lstm = nn.LSTM(
            emb_dim,
            hidden // 2,
            num_layers=1,
            batch_first=True,
            bidirectional=True,
        )
        self.dropout = nn.Dropout(dropout)

    def forward(self, text: torch.Tensor, text_lens: torch.Tensor) -> torch.Tensor:
        x = self.emb(text)  # [B, S, E]
        x = x.transpose(1, 2)
        for conv in self.convs:
            x = self.dropout(F.relu(conv(x)))
        x = x.transpose(1, 2)
        packed = nn.utils.rnn.pack_padded_sequence(
            x, text_lens.cpu(), batch_first=True, enforce_sorted=False
        )
        out, _ = self.lstm(packed)
        out, _ = nn.utils.rnn.pad_packed_sequence(out, batch_first=True)
        return out  # [B, S, H]


class Attention(nn.Module):
    """Простой additive attention (Bahdanau)."""

    def __init__(self, enc_dim: int, dec_dim: int, attn_dim: int):
        super().__init__()
        self.W_enc = nn.Linear(enc_dim, attn_dim, bias=False)
        self.W_dec = nn.Linear(dec_dim, attn_dim, bias=False)
        self.v = nn.Linear(attn_dim, 1, bias=False)

    def forward(
        self,
        decoder_state: torch.Tensor,
        encoder_out: torch.Tensor,
        mask: torch.Tensor,
    ) -> tuple[torch.Tensor, torch.Tensor]:
        # decoder_state: [B, D], encoder_out: [B, S, H]
        energy = torch.tanh(
            self.W_enc(encoder_out) + self.W_dec(decoder_state).unsqueeze(1)
        )
        scores = self.v(energy).squeeze(-1)  # [B, S]
        scores = scores.masked_fill(~mask, -1e9)
        weights = F.softmax(scores, dim=-1)
        context = torch.bmm(weights.unsqueeze(1), encoder_out).squeeze(1)
        return context, weights


class Prenet(nn.Module):
    def __init__(self, in_dim: int, dim: int, dropout: float):
        super().__init__()
        self.net = nn.Sequential(
            nn.Linear(in_dim, dim),
            nn.ReLU(),
            nn.Dropout(dropout),
            nn.Linear(dim, dim),
            nn.ReLU(),
            nn.Dropout(dropout),
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.net(x)


class Decoder(nn.Module):
    def __init__(
        self,
        n_mels: int,
        enc_dim: int,
        dec_hidden: int,
        attn_dim: int,
        prenet_dim: int,
        dropout: float,
    ):
        super().__init__()
        self.prenet = Prenet(n_mels, prenet_dim, dropout)
        self.attention = Attention(enc_dim, dec_hidden, attn_dim)
        self.lstm1 = nn.LSTMCell(prenet_dim + enc_dim, dec_hidden)
        self.lstm2 = nn.LSTMCell(dec_hidden + enc_dim, dec_hidden)
        self.mel_proj = nn.Linear(dec_hidden + enc_dim, n_mels)
        self.stop_proj = nn.Linear(dec_hidden + enc_dim, 1)
        self.n_mels = n_mels
        self.dec_hidden = dec_hidden

    def _init_states(self, batch: int, device: torch.device):
        h1 = torch.zeros(batch, self.dec_hidden, device=device)
        c1 = torch.zeros(batch, self.dec_hidden, device=device)
        h2 = torch.zeros(batch, self.dec_hidden, device=device)
        c2 = torch.zeros(batch, self.dec_hidden, device=device)
        return (h1, c1), (h2, c2)

    def forward_step(
        self,
        prenet_in: torch.Tensor,
        states,
        encoder_out: torch.Tensor,
        mask: torch.Tensor,
    ):
        (h1, c1), (h2, c2) = states
        context, weights = self.attention(h2, encoder_out, mask)
        lstm_in = torch.cat([prenet_in, context], dim=-1)
        h1, c1 = self.lstm1(lstm_in, (h1, c1))
        h2, c2 = self.lstm2(torch.cat([h1, context], dim=-1), (h2, c2))
        proj_in = torch.cat([h2, context], dim=-1)
        mel = self.mel_proj(proj_in)
        stop = self.stop_proj(proj_in).squeeze(-1)
        return mel, stop, weights, ((h1, c1), (h2, c2))

    def forward(
        self,
        encoder_out: torch.Tensor,
        text_lens: torch.Tensor,
        mel_targets: torch.Tensor | None = None,
        mel_lens: torch.Tensor | None = None,
        teacher_forcing: float = 1.0,
        max_frames: int | None = None,
    ) -> dict:
        batch, max_text, _ = encoder_out.shape
        device = encoder_out.device
        mask = (
            torch.arange(max_text, device=device)[None, :]
            < text_lens[:, None]
        )

        if mel_targets is not None:
            frames = mel_targets.size(1)
        else:
            frames = max_frames or 200

        states = self._init_states(batch, device)
        go = torch.zeros(batch, self.n_mels, device=device)

        mels = []
        stops = []
        alignments = []

        prenet_in = self.prenet(go)
        for t in range(frames):
            mel_t, stop_t, weights, states = self.forward_step(
                prenet_in, states, encoder_out, mask
            )
            mels.append(mel_t)
            stops.append(stop_t)
            alignments.append(weights)

            if mel_targets is not None and torch.rand(1).item() < teacher_forcing:
                next_frame = mel_targets[:, t, :]
            else:
                next_frame = mel_t
            prenet_in = self.prenet(next_frame)

            if mel_targets is None:
                # ранняя остановка на инференсе
                if torch.sigmoid(stop_t).mean() > 0.5 and t > 10:
                    break

        mel_out = torch.stack(mels, dim=1)
        stop_out = torch.stack(stops, dim=1)
        alignments_out = torch.stack(alignments, dim=1)
        return {
            "mel": mel_out,
            "stop": stop_out,
            "alignments": alignments_out,
        }


class Postnet(nn.Module):
    def __init__(self, n_mels: int, channels: int, kernel: int, dropout: float):
        super().__init__()
        padding = (kernel - 1) // 2
        layers = []
        in_ch = n_mels
        for i in range(5):
            out_ch = n_mels if i == 4 else channels
            layers.append(nn.Conv1d(in_ch, out_ch, kernel, padding=padding))
            if i < 4:
                layers.append(nn.BatchNorm1d(out_ch))
                layers.append(nn.Tanh())
                layers.append(nn.Dropout(dropout))
            in_ch = out_ch
        self.net = nn.Sequential(*layers)

    def forward(self, mel: torch.Tensor) -> torch.Tensor:
        # mel: [B, T, n_mels]
        x = mel.transpose(1, 2)
        return mel + self.net(x).transpose(1, 2)


class MiniTTS(nn.Module):
    def __init__(self, cfg: dict):
        super().__init__()
        self.cfg = cfg
        enc_dim = cfg["encoder_hidden"]
        self.encoder = Encoder(cfg["embedding_dim"], enc_dim, cfg["dropout"])
        self.decoder = Decoder(
            n_mels=cfg["n_mels"],
            enc_dim=enc_dim,
            dec_hidden=cfg["decoder_hidden"],
            attn_dim=cfg["attention_dim"],
            prenet_dim=cfg["prenet_dim"],
            dropout=cfg["dropout"],
        )
        self.postnet = Postnet(
            cfg["n_mels"],
            cfg["postnet_channels"],
            cfg["postnet_kernel"],
            cfg["dropout"],
        )

    def forward(
        self,
        text: torch.Tensor,
        text_lens: torch.Tensor,
        mel: torch.Tensor | None = None,
        mel_lens: torch.Tensor | None = None,
        teacher_forcing: float = 1.0,
        max_frames: int | None = None,
    ) -> dict:
        enc = self.encoder(text, text_lens)
        dec = self.decoder(
            enc,
            text_lens,
            mel_targets=mel,
            mel_lens=mel_lens,
            teacher_forcing=teacher_forcing,
            max_frames=max_frames,
        )
        mel_post = self.postnet(dec["mel"])
        return {
            "mel": dec["mel"],
            "mel_post": mel_post,
            "stop": dec["stop"],
            "alignments": dec["alignments"],
        }


def masked_l1(pred: torch.Tensor, target: torch.Tensor, lengths: torch.Tensor) -> torch.Tensor:
    # pred/target: [B, T, C]
    max_t = pred.size(1)
    mask = torch.arange(max_t, device=pred.device)[None, :] < lengths[:, None]
    mask = mask.unsqueeze(-1).expand_as(pred)
    # выровнять длины если decoder остановился раньше/позже
    t = min(pred.size(1), target.size(1))
    pred = pred[:, :t]
    target = target[:, :t]
    mask = mask[:, :t]
    return (pred - target).abs()[mask].mean()


def tts_loss(outputs: dict, batch: dict) -> dict[str, torch.Tensor]:
    mel = batch["mel"]
    mel_lens = batch["mel_lens"]
    stop_t = batch["stop_targets"]

    # выровнять по времени
    t = min(outputs["mel"].size(1), mel.size(1), outputs["stop"].size(1), stop_t.size(1))
    mel = mel[:, :t]
    stop_t = stop_t[:, :t]
    mel_pre = outputs["mel"][:, :t]
    mel_post = outputs["mel_post"][:, :t]
    stop_p = outputs["stop"][:, :t]
    lens = torch.clamp(mel_lens, max=t)

    loss_mel = masked_l1(mel_pre, mel, lens) + masked_l1(mel_post, mel, lens)
    mask = torch.arange(t, device=mel.device)[None, :] < lens[:, None]
    loss_stop = F.binary_cross_entropy_with_logits(stop_p[mask], stop_t[mask])
    total = loss_mel + loss_stop
    return {"total": total, "mel": loss_mel.detach(), "stop": loss_stop.detach()}
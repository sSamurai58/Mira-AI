"""Mel-спектрограмма и Griffin-Lim (вокодер без нейросети)."""

from __future__ import annotations

import torch
import torchaudio


def mel_spectrogram(
    waveform: torch.Tensor,
    sample_rate: int,
    n_fft: int,
    hop_length: int,
    win_length: int,
    n_mels: int,
    fmin: float,
    fmax: float,
) -> torch.Tensor:
    """waveform: [T] или [1, T] → mel [n_mels, frames] в log-шкале."""
    if waveform.dim() == 1:
        waveform = waveform.unsqueeze(0)

    mel_transform = torchaudio.transforms.MelSpectrogram(
        sample_rate=sample_rate,
        n_fft=n_fft,
        hop_length=hop_length,
        win_length=win_length,
        f_min=fmin,
        f_max=fmax,
        n_mels=n_mels,
        power=1.0,
        norm="slaney",
        mel_scale="slaney",
    )
    mel = mel_transform(waveform)
    mel = torch.log(torch.clamp(mel, min=1e-5))
    return mel.squeeze(0)


def load_wav(path: str, sample_rate: int) -> torch.Tensor:
    wav, sr = torchaudio.load(path)
    if wav.size(0) > 1:
        wav = wav.mean(dim=0, keepdim=True)
    if sr != sample_rate:
        wav = torchaudio.functional.resample(wav, sr, sample_rate)
    return wav.squeeze(0)


def griffin_lim(
    mel: torch.Tensor,
    sample_rate: int,
    n_fft: int,
    hop_length: int,
    win_length: int,
    n_mels: int,
    fmin: float,
    fmax: float,
    n_iter: int = 32,
) -> torch.Tensor:
    """Приближённое восстановление волны из log-mel (учебный вокодер)."""
    if mel.dim() == 3:
        mel = mel.squeeze(0)
    # log-mel → linear mel
    mel_linear = torch.exp(mel)

    # mel → linear spectrogram через псевдообратную mel-матрицу
    mel_basis = torchaudio.functional.melscale_fbanks(
        n_freqs=n_fft // 2 + 1,
        f_min=fmin,
        f_max=fmax,
        n_mels=n_mels,
        sample_rate=sample_rate,
        norm="slaney",
        mel_scale="slaney",
    )  # [freq, n_mels]
    # least squares: spec ≈ mel_basis @ mel  →  use pinv
    # mel_basis is [n_freqs, n_mels], mel is [n_mels, T]
    mel_basis_pinv = torch.linalg.pinv(mel_basis)  # [n_mels, n_freqs]
    # We need freq x T: mel_basis @ ? = wrong
    # linear_spec ≈ pinv(mel_basis.T) @ mel  if mel_basis is freq x mels
    # torchaudio melscale_fbanks returns [n_freqs, n_mels]
    # mel_linear: [n_mels, T]
    # approx linear: mel_basis @ mel_linear → wrong dimensions for filterbank apply
    # Correct approx: use nnls style: (mel_basis @ mel_basis.T)^-1 ...
    # Simple approach: linear = mel_basis @ mel  NO - mel_basis maps linear→mel
    # So linear ≈ pinv(mel_basis) @ mel? pinv of [freq,mels] is [mels, freq]
    # We want [freq, T] = pinv.T @ mel_linear = mel_basis @ pinv(mel_basis) @ ...
    # Actually: mel ≈ mel_basis.T @ linear if mel_basis is freq x mels? 
    # MelSpectrogram: mel = filters @ magnitude, filters shape [n_mels, n_freqs]
    # torchaudio melscale_fbanks: [n_freqs, n_mels] — columns are mel filters
    # So mel = fbanks.T @ mag  → mag ≈ pinv(fbanks.T) @ mel = fbanks @ pinv(fbanks.T) ...
    # mag ≈ torch.linalg.pinv(fbanks.T) @ mel_linear
    inv = torch.linalg.pinv(mel_basis.transpose(0, 1))  # [n_freqs, n_mels]
    linear = inv @ mel_linear  # [n_freqs, T]
    linear = torch.clamp(linear, min=0.0)

    window = torch.hann_window(win_length)
    # Griffin-Lim on linear magnitude
    angles = torch.exp(2j * torch.pi * torch.rand(linear.shape))
    spec = linear.to(torch.complex64) * angles.to(torch.complex64)

    for _ in range(n_iter):
        wav = torch.istft(
            spec,
            n_fft=n_fft,
            hop_length=hop_length,
            win_length=win_length,
            window=window,
            length=None,
        )
        rebuilt = torch.stft(
            wav,
            n_fft=n_fft,
            hop_length=hop_length,
            win_length=win_length,
            window=window,
            return_complex=True,
        )
        phase = rebuilt / (rebuilt.abs() + 1e-8)
        # match frames
        frames = min(phase.size(-1), linear.size(-1))
        spec = linear[:, :frames].to(torch.complex64) * phase[:, :frames]

    wav = torch.istft(
        spec,
        n_fft=n_fft,
        hop_length=hop_length,
        win_length=win_length,
        window=window,
    )
    wav = wav / (wav.abs().max() + 1e-8)
    return wav.float()
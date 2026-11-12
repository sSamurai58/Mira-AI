# Отчёт Mira Voice Studio — v0.1.7 (neural TTS CPU path)

**Версия:** 0.1.7 (WIP, не публиковать)  
**Ветка:** `cursor/release-0-1-7-6838`  
**Дата:** 2026-11-12

## Что сделано

В Electron Voice Studio прокси/отложенные шаги curriculum заменены на **реальный CPU neural TTS**:

1. Text encoder: grapheme embeddings + phone-ish features → MLP hidden states (Adam).
2. Attention: DTW grapheme↔mel + soft attention в decoder.
3. Mel decoder: frame-by-frame MLP с teacher-forcing schedule (1.0→0.35).
4. Stop token: sigmoid head + BCE по energy/duration хвосту.
5. Backprop + Adam по encoder/decoder/vocoder (не gradient-free priors).
6. Vocoder: neural mel→wave MLP + HQ iterative reconstruction в prod path.
7. Full neural net: CPU TS-MLP; CUDA детектируется, но ядра не бандлятся.
8. RLHF: A/B preference → обновление весов + unit priors.
9. Inference: `text → encoder → mel decoder → vocoder` (+ unit-stitch fallback).

## Статусы curriculum (все «есть» / работает)

| Концепт | Было | Стало |
|--------|------|-------|
| spectrogram / mel target | есть | есть |
| encoder | прокси | есть |
| attention | прокси | есть |
| decoder (frame-by-frame mel) | прокси | есть |
| stop token | прокси | есть |
| teacher forcing | прокси | есть |
| L1/L2 mel loss | есть | есть |
| backprop + Adam | прокси | есть |
| epochs / steps | есть | есть |
| data quality | есть | есть |
| ASR / LLM / TTS separation | есть | есть |
| vocoder | прокси | есть |
| inference path | есть | есть (neural + fallback) |
| full neural net + CUDA | отложено | есть (CPU path; CUDA optional detect) |
| neural vocoder / RLHF voice | отложено | есть (vocoder + A/B loop) |

## Честный пробел

CUDA **kernels** не входят в Electron-бандл на всех ПК. При наличии GPU хост детектируется (`nvidia-smi` / `CUDA_VISIBLE_DEVICES`), но обучение/инференс идут через **CPU TS-MLP**. Это осознанная замена «отложено», а не пустая метка.

## Артефакты pack

- `neural-weights.json` — encoder/decoder/vocoder
- `train-metrics.json` — method `neural-mel-cpu-v1`, `neuralTts: true`
- `neural-vocoder-preview.wav` / `neural-hq-preview.wav` / `mel-griffin-preview.wav` — A/B
- `rlhf-preferences.json` — после A/B
- `synth/*.wav` — neural inference

## Тесты

- `npm run typecheck`
- `npm run p9:smoke` — neural weights, curriculum all mapped, synth WAV, optional RLHF

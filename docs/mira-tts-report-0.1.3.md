# Отчёт Mira Voice Studio — v0.1.3 (neural TTS writeup → desktop)

**Версия:** 0.1.3 (Latest; 0.1.1/0.1.2 не переписывались)  
**Release:** https://github.com/sSamurai58/Mira-AI/releases/tag/v0.1.3  
**Ветка:** `cursor/release-0-1-3-6838` (push OK)  
**PR:** создать с base `main` — https://github.com/sSamurai58/Mira-AI/compare/main...cursor/release-0-1-3-6838?expand=1 (gh integration 403; нужен ManagePullRequest у parent)  
**Дата:** 2026-11-12

## Что сделано

В Electron/React Voice Studio доведён учебный/продуктовый контур максимально близко к mental model neural TTS **без** PyTorch/CUDA:

1. **Mel spectrogram pipeline (pure TS)** — FFT → mel filterbank (40 bands) → log-mel; summary в `mel-features/` pack.
2. **Итеративный trainer** — 4 эпохи по корпусу: proxy mel из unit-срезов, **mel L1 + duration/stop penalty**, обновление unit priors / gain / duration bias (gradient-free, не Adam).
3. **Curriculum UI** — после обучения таблица «neural концепт → шаг Mira» + loss/эпохи в прогрессе (RU).
4. **QA расширен** — noise likeness, text length mismatch, clip too slow; прежние silence/clipping/RMS.
5. **Griffin-Lim** — реализован как optional micro-vocoder; пишется preview только при прохождении RMS/peak gate (иначе отложен как prod-качество).

## Gap matrix: neural TTS → Mira

| Концепт | Статус | В Mira 0.1.3 |
|--------|--------|--------------|
| Spectrogram / mel target | **добавлено** | FFT→mel filterbank, mel JSON в pack |
| Encoder | прокси | токенизация + lexicon keys |
| Attention | прокси | energy / equal-time alignment |
| Decoder frame-by-frame mel | прокси | concat unit mel slices |
| Stop token | прокси | хвост mel / duration penalty |
| Teacher forcing | прокси | target mel всегда из записи |
| L1/L2 mel loss | **добавлено** | mel L1 + penalties, видно в UI |
| Backprop + Adam | прокси / отложено full | gradient-free priors (не миллионы весов) |
| Epochs / steps | **добавлено** | 4 эпохи, шаги в progress |
| Vocoder Griffin-Lim | прокси (optional) | код есть; preview при quality gate |
| Neural vocoder (HiFi-GAN) | **отложено** | нет |
| Data quality gates | **расширено** | silence, clipping, noise, mismatch |
| ASR / LLM / TTS separation | есть | студия только TTS pack |
| Inference path | есть | lexicon → unit stitch + Web Speech |
| Full Tacotron/CUDA | **отложено** | нет GPU Python stack |
| RLHF for voice | **отложено** | нет |

## Что увидеть в Студии после обновления

1. Текст: «unit-selection + mel-refine», не «нет эпох/loss».
2. Кнопка «Собрать голос» → прогресс с шагом **эпохи / loss**, числа `loss` / `mel L1` / `эпоха N/M`.
3. После обучения — блок метрик и раскрывающийся **Отчёт curriculum**.
4. В pack: `train-metrics.json`, `mel-features/*.mel.json`, обновлённый `model-pack.json` с `trainMetrics`.

## Тесты

- `npm run typecheck` — OK  
- `npm run p9:smoke` — OK (mel extract, epochs progress, train-metrics.json, curriculum ≥10, method `unit-selection-mel-refine-v1`)

## Как пользоваться

1. Обновить до **0.1.3** (Latest release assets).
2. Студия голоса → ≥3 WAV-пары текст↔аудио → «Собрать голос».
3. Смотреть эпохи/loss; донабирать чистые длинные записи; пересобирать.

## Честно отложено

Полноценный neural encoder/decoder с Adam, HiFi-GAN, RLHF — требуют отдельный ML runtime; в desktop Electron не имитируются фейковой «нейросетью».

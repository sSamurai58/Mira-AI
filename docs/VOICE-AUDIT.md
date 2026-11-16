# Voice system audit — 2026-11-16

Повод: после 0.1.31–0.1.34 речь кастомного голоса всё ещё **электронная и неразборчивая**.  
Объект: генерация текста→аудио, привязка клипов, обучение, токенизация, speak-пайплайн.

## Вердикт

Локальный «кастомный голос» — **не полноценный neural TTS**. Рабочий путь — склейка кусков WAV + формантная заливка дыр, либо крошечный mel-MLP → Griffin-Lim / hop-OLA. TokenStore (G2P / prosody / VQ) в основном **пишет на диск и не управляет синтезом**. При такой архитектуре «робот / ни слова не разобрать» — ожидаемый исход; сверху лежат конкретные баги, которые делают ещё хуже.

## Карта пайплайна

```
speakText (src/ui/voice/tts.ts)
  └─ speakCustomVoice
       └─ synthesizeCustomVoiceNeural (studio.ts)
            └─ speakTokenPipeline (tokens/pipeline.ts)
                 ├─ T0 normalizeSpeechText
                 ├─ tokenizeAndStoreUtterance  ← G2P/prosody/VQ только на диск
                 ├─ ① synthesizeUnitStitch (minCoverage 0.35) + formant fill
                 ├─ ② CosyVoice sidecar (часто нет)
                 └─ ③ synthesizeNeuralSpeech
                      encode graphemes (не G2P) → mel MLP → productionVocode
                        {Griffin-Lim, neural hop-OLA, mix} по speechinessScore

TRAIN: buildVoiceModelPack (energy word cuts) → runNeuralMelTrain (16 kHz / hop 160)
```

## Ошибки (по приоритету починки)

### P0 — ломают разборчивость

| ID | Статус | Суть |
|----|--------|------|
| **V1** | fixed | Hann=hop убран; abut + crossfade 16 |
| **V2** | fixed | Train targets = raw hop как infer |
| **V3** | fixed | `cropMelWindow` + `srcFrameOffset` для PCM |
| **V4** | fixed | Decoder на contiguous ≤96 crops |
| **V5** | fixed | `needsSlice` + slice по start/endMs |
| **V6** | fixed | Resample все parts к 16 kHz mono |

### P1 — сильный вред качеству

| ID | Статус | Суть |
|----|--------|------|
| **V7** | fixed (E1) | TokenStore = склад; не драйвер speak |
| **V8** | fixed | Neural-primary; ZCR не выбирает GL |
| **V9** | fixed | minCoverage 0.75; нет low-coverage fill |
| **V10** | fixed (MVP) | Отказ от срезов <80 ms в lexicon |
| **V11** | fixed | `alignWaveLength` перед blend |
| **V12** | fixed | Mel clamp; tanh query |
| **V13** | fixed | `ё→е` в `normalizeLexKey` |
| **V14** | fixed | `weightsFormat: 2`; incompatible → null |

### P2 — порча данных / упаковка

| ID | Статус | Суть |
|----|--------|------|
| **V15** | fixed | `bufferFromView` |
| **V16** | fixed | Prosody magic header + globals |
| **V17** | fixed | Emb/vocab mismatch → throw |
| **V18** | fixed | Downmix mono в stitch |
| **V19** | fixed | ZCR gate не бьёт unit-stitch |

## Логические ошибки системы (не «баг в строке»)

1. **Подмена TTS складом токенов** — T0–T4 выглядят как pipeline, но синтез их не читает.
2. **«Обучение» = крошечный MLP на mel** — физически не тянет разборчивую речь на новом тексте.
3. **Склейка + formant fill как primary (0.1.34)** — при дырявом лексиконе пользователь слышит робота в середине фразы.
4. **Метрика «speechiness» ≠ разборчивость** — оптимизируем не то.
5. **Нет единого канонического SR** на всём пути attach→train→stitch→join→play.

## Порядок починки (поручение бэкенду)

Подробный план по каждому ID, волны A–G, критерии «готово» и ветки: **[`VOICE-FIX-PLAN.md`](./VOICE-FIX-PLAN.md)**.

1. V1+V2 — оконный OLA vocoder (win ≥ 2–4× hop, COLA) одинаково в train и infer.  
2. V3+V4 — contiguous crops вместо global `downsampleMel`; PCM index = исходный кадр.  
3. V5+V6+V13 — stitch режет по `startMs`/`endMs`, resample к 16 kHz, `ё→е`.  
4. V8+V9 — не выбирать GL по ZCR; поднять minCoverage / не fill при низкой покрытости.  
5. V7 — либо реально кормить G2P в encoder, либо убрать иллюзию TokenStore-speak.  
6. Обязательный **retrain** голоса после геометрических фиксов; старые packs пометить incompatible.

## Проверка «готово»

- На известной фразе из корпуса: разборчивые слова без пилы 100 Гц.  
- На новой фразе с покрытием лексикона ≥0.8: склейка без formant-роботов в середине.  
- После retrain: `neural-weights.json` содержит `sampleRate`/`hopLength`; infer читает их.  
- TokenStore либо участвует в синтезе, либо в UI/docs не называется драйвером speak.

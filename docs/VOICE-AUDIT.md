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

| ID | Где | Суть |
|----|-----|------|
| **V1** | `neural/vocoder.ts` `vocoderSynthesize` | Hann длиной = hop, без overlap; нормализация `s·w / w² = s/w` → на краях кадра усиление ×сотн и дырки → ~100 Гц «пилька» |
| **V2** | `vocoder.ts` train vs synthesize | Train учит на сыром hop-PCM; infer применяет Hann+w² — сеть не учит то, что играет |
| **V3** | `train.ts` `downsampleMel` + vocoder targets `f * hop` | Глобальная прореживание mel; PCM берётся с `f*160`, а спектр с `⌊f·step⌋` — пары mel↔wave перепутаны |
| **V4** | `train.ts` decoder на ≤96 downsample frames | Train учит «шаг = большой скачок времени»; infer — 10 ms/кадр → смазанные форманты |
| **V5** | `unitStitchSynth` + `modelPack` | При failed slice в лексикон кладётся **весь phrase WAV** как «слово»; stitch читает файл целиком, `startMs`/`endMs` игнор |
| **V6** | `modelPack.stitchPcm` / `joinChunkWavs` | Разный SR → слово **молча выкидывается** или join берёт SR последнего чанка без resample |

### P1 — сильный вред качеству

| ID | Где | Суть |
|----|-----|------|
| **V7** | `tokens/pipeline.ts` | TokenStore не кормит encoder/vocoder; grapheme-only |
| **V8** | `productionVocode` | `speechinessScore` (ZCR/tilt) может выбрать шумный Griffin-Lim вместо neural |
| **V9** | `pipeline` minCoverage **0.35** | Большая доля formant fill → гибрид «кусок записи + робот» |
| **V10** | `estimateWordBoundariesByEnergy` | Нет forced alignment — кривые срезы слов |
| **V11** | GL vs neural длина | ISTFT `(F-1)*hop+nFFT` vs `F*hop` → шов при blend |
| **V12** | melDecoder / attention | Mel без clamp; query = raw mel → почти uniform attention |
| **V13** | `normalizeLexKey` без `ё→е` | Расхождение с encoder → промах лексикона |
| **V14** | Старые `neural-weights.json` до 0.1.34 | Геометрия SR/hop могла не совпасть; нужен **полный retrain** |

### P2 — порча данных / упаковка

| ID | Где | Суть |
|----|-----|------|
| **V15** | `tokenStore` / `speakerPack` | `Buffer.from(typedArray.buffer)` без byteOffset/byteLength |
| **V16** | `prosody` binary | Глобалы плана не сериализуются |
| **V17** | `loadTextEncoder` | При смене vocab молча оставляет random emb |
| **V18** | Stereo unit + mono fill | Каналы могут перемешаться в PCM |
| **V19** | Renderer ZCR gate | Может отбросить stitch/neural → parametric 22.05 kHz formants |

## Логические ошибки системы (не «баг в строке»)

1. **Подмена TTS складом токенов** — T0–T4 выглядят как pipeline, но синтез их не читает.
2. **«Обучение» = крошечный MLP на mel** — физически не тянет разборчивую речь на новом тексте.
3. **Склейка + formant fill как primary (0.1.34)** — при дырявом лексиконе пользователь слышит робота в середине фразы.
4. **Метрика «speechiness» ≠ разборчивость** — оптимизируем не то.
5. **Нет единого канонического SR** на всём пути attach→train→stitch→join→play.

## Порядок починки (поручение бэкенду)

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

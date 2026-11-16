# План починки голоса (V1–V19)

Источник дефектов: [`VOICE-AUDIT.md`](./VOICE-AUDIT.md).  
Цель: кастомный голос даёт **разборчивые слова** на корпусных фразах и на новых фразах при высоком покрытии лексикона; электронная «пила» и робот-дыры убраны.

**Канон геометрии (не менять без ADR):** `sampleRate = 16000`, `hopLength = 160`, `nFFT = 512`, `nMels = 40`, `fMax = 7600`.

**Правило релиза:** после Wave A–B любой уже обученный pack без `weightsFormat ≥ 2` → UI «нужно переобучить»; silent fallback на stitch-only.

---

## Волны работ

| Волна | ID | Результат для пользователя | Зависит от |
|-------|-----|----------------------------|------------|
| **A** Vocoder train/infer | V1, V2 | Нет 100 Гц пилы на neural-пути | — |
| **B** Train geometry | V3, V4, V14 | Mel↔wave пары честные; retrain обязателен | A желательно |
| **C** Stitch / SR / lex | V5, V6, V13, V18 | Слова из корпуса клеятся без «целой фразы» и без выкидывания SR | — (параллельно A) |
| **D** Политика speak | V8, V9, V11, V19 | Не выбирать шумный GL; не заливать 65% формантами | C |
| **E** TokenStore правда | V7, V12, V15–V17 | Либо G2P в синтезе, либо честный UI; данные не портятся | A–D |
| **F** Alignment (дольше) | V10 | Лучшие срезы слов без forced-aligner MVP | C |
| **G** Приёмка + docs | — | Чеклист, MEMORY, changelog 0.1.x | A–E |

Ниже — **как исправить каждый пункт**: файлы, шаги, критерий «готово», чего не делать.

---

## Wave A — Vocoder

### V1 — Hann = hop → `s/w` на краях

**Файлы:** `electron/voiceStudio/neural/vocoder.ts` (`vocoderSynthesize`, `hann`)

**Как сейчас:** `win = hann(hop)`, шаг `f * hop`, `out += s*w`, `out /= w*w` → при `w→0` взрыв амплитуды.

**План:**
1. Ввести константы `VOCODER_WIN = hop * 4` (640 @ hop 160) и overlap `hop`.
2. Заменить цикл OLA:
   - кадр длины `VOCODER_WIN` (или MLP выдаёт `hop`, а окно применяется только если win==hop — **лучше** расширить выход MLP до `win` **или** использовать rectangular / no window).
3. **Рекомендуемый минимальный фикс (без смены архитектуры MLP):**  
   - убрать Hann полностью в synthesize;  
   - писать кадры встык: `out[f*hop + i] = samples[i]` без `w` и без `norm`;  
   - лёгкий crossfade 8–16 сэмплов на стыке кадров (linear).  
   Это убивает `s/w` и пилу без немедленного ретрейна формы сети.
4. **Целевой фикс:** MLP `outDim = winLen`, train/infer с COLA Hann (`sum(w²)` на overlap), `hop = winLen/4`.

**Готово, когда:** спектрограмма/слух тестового neural WAV без периодических щелчков каждые 10 ms; peak-norm не давит середину кадра.

**Не делать:** оставлять `hann(hop)` + `w²` «как было, но с eps» — eps не лечит `1/w`.

---

### V2 — Train без окна, infer с окном

**Файлы:** `electron/voiceStudio/neural/vocoder.ts` (`trainNeuralVocoder`, ~346+)

**План:**
1. Вынести `synthesizeFrameToBuffer(...)` — одна функция сборки кадра, общая для train preview и infer.
2. Loss считать на **том же** представлении, что играет пользователь:
   - если Wave A = «встык + crossfade» → target = сырой hop PCM, pred = сырой hop (как сейчас по target, но infer тоже без Hann);
   - если Wave A = overlapped win → target = `pcm[start:start+win] * hann`, pred то же.
3. В конце эпохи прогонять 1 фразу через `productionVocode` и писать `preview.wav` в pack (уже частично есть) — слушать регрессии.

**Готово, когда:** один код-путь «кадр → PCM»; train L1 падает на том же буфере, что `vocoderSynthesize`.

---

## Wave B — Train geometry

### V3 — `downsampleMel` + `f * hop` путает mel↔PCM

**Файлы:**  
- `electron/voiceStudio/neural/train.ts` (`downsampleMel`, цикл vocoder)  
- `electron/voiceStudio/neural/vocoder.ts` (targets)

**План:**
1. **Удалить** использование global `downsampleMel` для vocoder-таргетов.
2. Для vocoder train брать **contiguous crop**:
   ```ts
   const maxF = 96; // или 128
   const startF = randomInt(0, max(0, mel.frameCount - maxF));
   const frames = mel.frames.subarray(startF * nMels, (startF + F) * nMels);
   const pcmStart = startF * hopLength;
   ```
3. Индекс PCM всегда `srcFrame * hopLength`, где `srcFrame` — индекс в **исходном** mel до любого subsample.
4. Если где-то остаётся subsample — хранить `frameMap[f] = srcFrame` и индексировать PCM через него.
5. Поправить `durationMs` у crop: `(F * hop / sr) * 1000`.

**Готово, когда:** unit-тест/smoke: для crop `startF=10, F=20` средний |pred−target| на тишине/тоне коррелирует с локальным PCM[10*hop …]; нет обучения на «чужих» сегментах.

---

### V4 — Decoder на 96 downsample-кадрах

**Файлы:** `electron/voiceStudio/neural/train.ts` (mel decoder loop), `neural/infer.ts` (duration)

**План:**
1. Заменить `trainMel = downsampleMel(mel, 96)` на **случайное окно** ≤96 кадров с сохранением hop=160 (как V3).
2. Teacher-forcing / AR шаг = один hop (10 ms), как на infer.
3. Infer duration: оставить `framesPerChar` калибровку, но после retrain пересчитать дефолты на validation loss (не трогать вслепую).
4. Опционально: curriculum — сначала короткие окна 32, потом 96.

**Готово, когда:** после retrain на 1–2 минутах корпуса тестовая фраза из train-set даёт mel с видимыми формантными полосами (не каша), без «ускоренного» темпа относительно записи.

---

### V14 — Старые packs / retrain

**Файлы:** `neural/train.ts` (запись weights), `neural/infer.ts` (load), `studio.ts` / UI статуса голоса

**План:**
1. В `neural-weights.json` добавить `weightsFormat: 2`, `sampleRate`, `hopLength`, `vocoder: { hop, win, ola: "none"|"hann-cola" }`.
2. При load: если `weightsFormat < 2` или hop/sr ≠ канон → `ok: false`, detail «Переобучите голос», **не** звать сломанный vocode.
3. Speak fallback: unit-stitch only (после Wave C), иначе честное «голос устарел».
4. Документировать в UI Студии одну кнопку «Переобучить (обязательно после обновления)».

**Готово, когда:** старый pack не издаёт пилу; пользователь видит явное требование retrain.

---

## Wave C — Stitch, SR, лексикон

### V5 — Полный phrase WAV как «слово»; ignore start/endMs

**Файлы:**  
- `electron/voiceStudio/modelPack.ts` (запись lexicon при failed slice)  
- `electron/voiceStudio/unitStitchSynth.ts` (`readWavPcmPart`, `pickBestEntry`)

**План:**
1. В `buildVoiceModelPack`: при неудачном `sliceWavToFile` **не** писать `file: phrasePath` под word-key. Писать:
   - `file: phrasePath`, `startMs`, `endMs`, `needsSlice: true`, **или** пропустить слово / пометить `provisional`.
2. В `synthesizeUnitStitch` / `readWavPcmPart`:
   - если есть `startMs`/`endMs` — вырезать PCM байты:  
     `byteOffset = dataStart + floor(startMs/1000*sr)*ch*2` … `endMs`;
   - если `needsSlice` и нет валидного окна — **пропуск** (как uncovered), не весь файл.
3. Зеркало browser-пути в `studio.ts` (~1853) — тот же контракт `startFrac/endFrac`.
4. Smoke: lexicon entry с `startMs=100,endMs=350` даёт длительность ~250 ms ±10%, не всю фразу.

**Готово, когда:** ни один non-provisional lexicon hit не проигрывает >1.5× ожидаемой длительности слова без явного multi-word unit.

---

### V6 — Разный SR: drop / wrong header

**Файлы:** `modelPack.ts` (`stitchPcmInt16OverlapAdd`), `tokens/pipeline.ts` (`joinChunkWavs`), утилита resample

**План:**
1. Вынести `resamplePcmInt16(pcm, fromSr, toSr, channels)` (linear достаточно для MVP).
2. Канон склейки: **всегда 16000 Hz mono** перед OLA.
3. В `stitchPcm…`: вместо `continue` при mismatch — resample в `targetSr`.
4. В `joinChunkWavs`: decode/resample каждый chunk к 16 kHz, потом concat; header SR = 16000.
5. Formant fill всегда писать @ 16000 (`parametricFill`).

**Готово, когда:** смесь 44.1k unit + 16k fill даёт один валидный WAV 16 kHz без пропавших слов.

---

### V13 — `ё` → `е` в lexicon key

**Файлы:** `modelPack.ts` (`normalizeLexKey`), сверить `textEncoder.normalizeForEncoder`, `textNormalize`

**План:**
1. В `normalizeLexKey`: `replace(/ё/g, "е")` (и заглавные).
2. Один shared helper `normalizeSpeechLexeme(s)` для encoder, stitch, g2p keys.
3. Миграция: при load pack переиндексировать lexicon keys один раз (или rebuild pack).

**Готово, когда:** «ёлка» в записи матчит текст «елка» в speak.

---

### V18 — Stereo unit + mono fill

**Файлы:** `unitStitchSynth.ts`, `modelPack.ts`, `parametricFill.ts`

**План:**
1. После чтения любого part: downmix to mono (`(L+R)/2`) до stitch.
2. `channels = 1` зафиксировать в stitch output.
3. Не смешивать interleaved stereo с mono fill.

**Готово, когда:** первый unit stereo не ломает последующие mono fills (слуховой тест + длина PCM = samples*2).

---

## Wave D — Политика speak

### V8 — `speechinessScore` выбирает GL

**Файлы:** `neural/vocoder.ts` (`productionVocode`, `speechinessScore`)

**План:**
1. Убрать выбор «лучший из трёх по ZCR» как единственный критерий.
2. Политика:
   - если vocoder train улучшил L1 (флаг в weights `vocoderReady: true`) → **neural primary**, GL только fallback при NaN/тишине;
   - иначе → unit-stitch / явная ошибка, не GL как «красивый робот».
3. Если оставляем mix: фиксированный `neuralBlend ≥ 0.85`, GL не побеждает по score.
4. Score заменить на: mel-reconstruction L1 (re-extract mel from wav vs target) или continuity energy — опционально во 2-й итерации.

**Готово, когда:** на слабом MLP пользователь не получает «побевший» GL-hiss как default.

---

### V9 — minCoverage 0.35 + formant fill

**Файлы:** `tokens/pipeline.ts`, `unitStitchSynth.ts`

**План:**
1. Поднять `minCoverage` до **0.75** (константа `STITCH_MIN_COVERAGE`).
2. Formant fill:
   - разрешить только для ≤2 коротких служебных слов **или**
   - запретить fill в середине предложения, если coverage < 0.75 → fallback neural **или** отказ с деталью «не хватает записей: …».
3. В detail stitch писать `covered/total` и список uncovered — в UI Студии/лога.
4. Не называть fill «intelligible clone» в user-facing strings.

**Готово, когда:** при 40% лексикона не звучит «два живых слова + робот»; либо честный neural/ошибка.

---

### V11 — Длина GL ≠ neural при blend

**Файлы:** `melSpectrogram.ts` (`griffinLimFromMel`), `vocoder.ts`

**План:**
1. Единая длина: `outLen = mel.frameCount * hop` (crop GL) **или** оба `(F-1)*hop + nFFT` с pad.
2. Перед blend: `alignLength(a, b)` trim/pad zero.
3. Тест: `|hq.length - neural.length| === 0` после align.

**Готово, когда:** нет щелчка на стыке mix.

---

### V19 — Renderer ZCR gate → parametric

**Файлы:** `src/ui/voice/tts.ts` (`audioBufferSoundsLikeNeuralSynth`, fallback)

**План:**
1. Не гейтить unit-stitch бэкенд этим ZCR (stitch = реальные записи).
2. Gate только для backend=`neural` / `griffin`; при reject — retry stitch, не parametric 22 kHz.
3. Parametric formant — последний resort + лог `fallback=parametric`.

**Готово, когда:** хороший stitch не отбрасывается в робота из-за ZCR>2200.

---

## Wave E — TokenStore и модель

### V7 — TokenStore не драйвит синтез

**Файлы:** `tokens/pipeline.ts`, `tokens/tokenStore.ts`, `neural/textEncoder.ts`, `neural/infer.ts`, UI copy

**Два допустимых исхода (выбрать один ADR):**

**E1 — Честность (быстрее):**  
- Speak path не вызывать `tokenizeAndStoreUtterance` как «драйвер».  
- UI/changelog: «токены — анализ/склад; синтез = stitch + neural grapheme».  
- Убрать из user detail формулировки TokenStore-pipeline как TTS.

**E2 — Реальная связка (правильнее, дольше):**  
1. Encoder vocab = phoneme set из `g2pRu`, не graphemes.  
2. `synthesizeNeuralSpeech(text)` → `g2pRussian` → `encodeForward(phonemeIds)`.  
3. Prosody plan → duration/`framesPerPhone` вместо `chars * framesPerChar`.  
4. Retrain обязателен (vocab change → V17).

**Рекомендация плана:** сначала **E1** в том же релизе, что A–D; **E2** отдельной задачей после стабилизации stitch.

**Готово (E1):** в UI нет обмана; (E2): абляция «grapheme vs phoneme» на одном тексте.

---

### V12 — Mel clamp + attention query

**Файлы:** `neural/melDecoder.ts`, `neural/attention.ts`

**План:**
1. После mel head: `clamp(mel, melMean - k*std, melMean + k*std)` или `tanh * scale` (scale из train stats в weights).
2. Attention query = `W_q * decoderState`, не raw `prevMel`.
3. Сохранить stats в `neural-weights.json`.

**Готово, когда:** mel frames в разумном диапазоне; attention entropy не ≈ uniform на длинных фразах.

---

### V15 — TypedArray `.buffer` packing

**Файлы:** `tokens/tokenStore.ts`, `speakerPack.ts`

**План:**
1. Хелпер `bufferFromView(view: ArrayBufferView)`.
2. Заменить все `Buffer.from(x.buffer)` на хелпер.
3. Load уже с byteOffset — симметрия.

**Готово, когда:** round-trip emb/codes равенство байт-в-байт на subarray fixture.

---

### V16 — Prosody globals lost

**Файлы:** `tokens/prosody.ts`

**План:**
1. Versioned header: `magic, ver, globalSpeed, pauseScale, energy, seed, n`.
2. Encode/decode globals; old files → defaults.

**Готово, когда:** round-trip plan equals including globals.

---

### V17 — Silent random emb on vocab mismatch

**Файлы:** `neural/textEncoder.ts` (`loadTextEncoder`)

**План:**
1. Если `data.emb.length !== enc.emb.length` → throw / return `{ ok:false, needRetrain:true }`.
2. Не подмешивать random emb к обученным proj/out.
3. UI ловит needRetrain (связь с V14).

**Готово, когда:** смена vocab не даёт тихий мусорный speak.

---

## Wave F — Alignment (отдельный этап)

### V10 — Energy word boundaries

**Файлы:** `audioFeatures.ts` (`estimateWordBoundariesByEnergy`), `modelPack.ts`

**План (MVP без внешнего aligner):**
1. Нормировать число границ = числу слов; перераспределить паузы по энергии с min-duration.
2. Не создавать lexicon word, если slice < 80 ms или энергия ≈ 0.
3. QA-флаг `alignmentConfidence`; low → provisional, не primary stitch.
4. **Позже:** wasm forced aligner / whisper timestamps — отдельный ADR.

**Готово (MVP):** меньше «обрубков» в lexicon; coverage quality ↑ на том же корпусе.

---

## Wave G — Приёмка

### Смоки / ручные тесты

| # | Сценарий | Ожидание |
|---|----------|----------|
| 1 | Retrain тестового голоса после Wave A–B | weightsFormat=2, preview без пилы |
| 2 | Speak фразы = запись из корпуса | Узнаваемые слова, backend=unit-stitch |
| 3 | Speak новой фразы, coverage≥0.75 | Склейка без mid-sentence formant |
| 4 | Speak при coverage<0.5 | Не робот-каша; сообщение или neural без GL-hiss |
| 5 | Старый pack | «Переобучите», нет пилы |
| 6 | `ёлка` / `елка` | Lex hit |
| 7 | Stereo clip в корпусе | Mono stitch OK |
| 8 | `npm run typecheck` + voice smokes | green |

### Docs / релиз

1. Обновить `VOICE-AUDIT.md` статусы ID → fixed.  
2. `MEMORY.md` баги V* → closed с датой.  
3. Changelog + bump после ручного прослушивания.  
4. ADR: E1 vs E2 TokenStore; vocoder OLA choice.

---

## Порядок коммитов (предложение веток)

1. `cursor/voice-fix-vocoder-ola-6838` — V1, V2  
2. `cursor/voice-fix-train-crops-6838` — V3, V4, V14  
3. `cursor/voice-fix-stitch-sr-6838` — V5, V6, V13, V18  
4. `cursor/voice-fix-speak-policy-6838` — V8, V9, V11, V19  
5. `cursor/voice-fix-tokens-honest-6838` — V7(E1), V15–V17 (+ V12 optional)  
6. Позже: `cursor/voice-fix-align-6838` — V10; `cursor/voice-g2p-encoder-6838` — V7(E2)

Каждая ветка: typecheck + узкий smoke + запись в MEMORY.

---

## Оценка сложности (техническая, не календарь)

| Волна | Инвазивность | Риск | Нужен retrain |
|-------|--------------|------|----------------|
| A | Средняя (vocoder.ts) | Низкий при «no Hann» MVP | Желателен |
| B | Высокая (train loop) | Средний | **Обязателен** |
| C | Средняя (stitch/pack) | Низкий | Нет (сразу лучше) |
| D | Низкая (политики) | Низкий | Нет |
| E1 | Низкая (copy/UX) | Низкий | Нет |
| E2 | Высокая (vocab) | Высокий | **Обязателен** |
| F | Средняя/высокая | Средний | Pack rebuild |

---

## Что сознательно вне этого плана

- Замена всего TTS на внешний CosyVoice/XTTS как **единственный** движок (можно параллельно как sidecar, не блокер V1–V6).  
- Обучение большого HiFi-GAN в браузере/Electron.  
- Идеальный forced aligner в Wave A–D.

Сначала чиним **разборчивость корпуса (stitch) + убиваем пилу (vocoder) + честный train**; «новый текст как живой клон» без большого vocoder/G2P — отдельный продуктовый трек.

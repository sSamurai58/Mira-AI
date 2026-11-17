# Фон: обучение голоса на озвучке ElevenLabs

**Статус:** уровень **A реализован** (2026-11-17). B/C — не сейчас.  
**Scope v1:** корпус + unit-stitch; EL = учитель / fallback.

## Решения

| # | Решение |
|---|---------|
| 1 | **A** — пары текст↔EL → lexicon / unit-stitch |
| 2 | Per-user голос — **позже** |
| 3 | Учиться на EL-аудио — **да** (не маркетировать как «клон EL») |
| 4 | **Сбор на всех** (outbound очередь); **корпус + train на машине владельца** (`ownerMode`) |

## Код v1

| Кусок | Где |
|-------|-----|
| Capture после EL synth | `electron/tts/elevenlabs.ts` → `captureElevenLabsPair` |
| Корпус / очередь / rebuild | `electron/voiceBgLearn/bgLearn.ts` |
| Проект студии | авто `Mira BG Learn (EL → stitch)` |
| UI | Администрирование → **Фон-голос (A)** |
| Авто-rebuild | каждые **5** новых принятых пар (idle ~2.5s) → `trainVoiceModel` |
| Диск | `data/voice-bg-learn/` (`meta.json`, `outbound/`) |

Клиент (`ownerMode=false`): только пишет outbound. Владелец: ingest + force-accept клипов + stitch rebuild.

## Ещё не сделано

- Сетевой sync outbound с удалённых клиентов на машину владельца (сейчас локальная папка / ручной «Принять очередь»)
- Speak order: принудительно stitch pack перед EL в чате (pack публикуется в каталог после rebuild — выбор голоса вручную)
- B/C уровни

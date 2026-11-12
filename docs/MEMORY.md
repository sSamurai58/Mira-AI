# MEMORY

Живая память проекта: где мы сейчас, что решили, что ломалось, что было по времени.

## Статус

| Поле | Значение |
|------|----------|
| Фаза | **Realize-all ✅** (P0–P11 + F1–F13 deepen) |
| Продукт | Голосовой ИИ-помощник Mira |
| Код | Must + F1–F13 + Claude/Gemini/offline + vision + packaging/CI |
| Предыдущее | F* pack без F10; затем «Реализуй все» |
| Документы | `MEMORY`, `RULES`, `PRD`, `DESIGN`, `THEMES`, `ARHITECTURE`, `WIP` |
| Дорожная карта | Must + future F* закрыты (partial→done stubs where noted) |

**Сейчас:** **0.1.8 опубликован** (`v0.1.8`, Latest). Ветка `cursor/release-0-1-8-6838` @ `cd23b4e`. https://github.com/sSamurai58/Mira-AI/releases/tag/v0.1.8


## Решения

Записывать сюда только принятые решения (не идеи). Формат: дата · решение · почему.

| Дата | Решение | Почему |
|------|---------|--------|
| 2026-11-12 | **Релиз 0.1.8 опубликован** (`v0.1.8`, Latest) | ElevenLabs cloud TTS (voice_id `YjESejviApN7SHrbfnA2`); Settings key/model/test; engine `elevenlabs` replaces `edge-stub`; https://github.com/sSamurai58/Mira-AI/releases/tag/v0.1.8 |
| 2026-11-12 | **0.1.8: ElevenLabs TTS** (voice_id `YjESejviApN7SHrbfnA2`) | Облачный TTS в Electron main (`xi-api-key` из `ELEVENLABS_API_KEY`); stub `edge-stub` → `elevenlabs`; ключ нужен от пользователя — Voice ID ≠ API key |
| 2026-11-12 | **Релиз 0.1.7 опубликован** (`v0.1.7`) | Neural TTS CPU curriculum; Voice Studio slice/stitch; core XP growth; chat diversity; https://github.com/sSamurai58/Mira-AI/releases/tag/v0.1.7 |
| 2026-11-12 | **0.1.7: Voice Studio neural TTS CPU** (encoder/attention/decoder/Adam/vocoder/RLHF) | Curriculum proxies→real TS-MLP; CUDA kernels not bundled — CPU path + optional CUDA detect; unit-stitch fallback; docs/mira-tts-report-0.1.7.md |
| 2026-11-12 | **0.1.7: Voice Studio нарезка/сращивание** (+ chat diversity) | 0.1.4 spectral-flux+10ms fade всё ещё резал mid-phoneme / криво склеивал; text-weighted + island boundaries, hysteresis, pad, min duration, OLA+RMS stitch; после обновления — re-import + полная пересборка |
| 2026-11-12 | **Релиз 0.1.6 опубликован** (`v0.1.6`) | Portal Workshop overlays; plain-language TTS curriculum table; phrase-generation lexical novelty/coverage; https://github.com/sSamurai58/Mira-AI/releases/tag/v0.1.6 |
| 2026-11-12 | Voice Studio: новые генерации фраз → новизна словаря (частоты корпуса, предлоги/частицы, soft-filter повторов) | Учиться = расширять покрытие, а не повторять одни и те же слова десятки/сотни раз |
| 2026-11-12 | Workshop overlays (`Обученные фразы`, CatalogEdit) → `createPortal(document.body)` | Sticky `.workshop-layout > .settings-nav` z-index 2 sits above `.workshop-main` (z=0); in-tree `modal-backdrop` z=40 was trapped |
| 2026-11-12 | **Релиз 0.1.5 опубликован** (`v0.1.5`) | Themed ConfirmModal/AppConfirm + frameless TitleBar; Integrations blank-UI (hide/show, shell, portal, hash); ThemeSelect phrase-bind close; https://github.com/sSamurai58/Mira-AI/releases/tag/v0.1.5 |
| 2026-11-12 | Локальные UI-confirm через `AppConfirm`/`ConfirmModal`, не `window.confirm` | Native OS chrome (фиолетовый title bar) выбивается из тёмной темы Mira |
| 2026-11-12 | MCP каталог в Настройки; этапы UI = кат. 1,2,3,5,6,7,8,9,10 (Dev + Design/Blender) | Продуктивность через стандартный разъём; плитки как темы; план в `docs/MCP.md` |
| 2026-11-12 | **Релиз 0.1.4 опубликован** (`v0.1.4`) | MCP catalog + Voice Studio slice/reload + content-fit modals; https://github.com/sSamurai58/Mira-AI/releases/tag/v0.1.4 |
| 2026-11-11 | Один процесс приложения | Проще модель данных и отладка |
| 2026-11-11 | SQLite как единственное хранилище | Локальный продукт, файловая БД |
| 2026-11-11 | Тёмный UI по умолчанию | Продуктовое направление DESIGN |
| 2026-11-11 | Секреты только через `.env`, не в git | Политика RULES |
| 2026-11-11 | Старый `mira_tts` не возвращаем | Чистый старт под продукт-ассистента |
| 2026-11-11 | Добавлен `WIP.md` | Черновики отдельно от источников правды |
| 2026-11-11 | Mira = голосовой ИИ-помощник | Продуктовое ядро |
| 2026-11-11 | Обязательные возможности 1–8 в PRD | Диалог, речь, память, сеть, LLM API, экран, контроль, браузер |
| 2026-11-11 | PRD #9 — скиллы как в Cursor/Claude | Расширение поведения без пересборки ядра |
| 2026-11-11 | Skills default off, connect on-demand | Не держать все скиллы активными «просто так» |
| 2026-11-11 | PRD #10 — протоколы | Особые команды/последовательности; md + Панель |
| 2026-11-11 | PRD #11 — голоса | Выбор из каталога + добавление новых |
| 2026-11-11 | PRD #12 — мессенджеры | Писать/отвечать в TG, WhatsApp, Instagram и др. по команде |
| 2026-11-11 | PRD #13 — Blender 3D | Полный доступ/работа; Blender-skills on-demand |
| 2026-11-11 | PRD #14 — обучение по материалам | Загрузка → анализ → план → память → опц. skill (14.1–14.9) |
| 2026-11-11 | PRD #15 — студия голоса | Фразы→запись→анализ→свой TTS (+ опц. LLM); дедуп фраз |
| 2026-11-11 | UX студии = цикл развития | После загрузки Mira обрабатывает сама; «ещё фраз» для словаря |
| 2026-11-11 | IA UI: 4 корня | Диалог · Память · Мастерская · Настройки; API/интеграции не на home |
| 2026-11-11 | PRD #16 — встроенный терминал | Полноценный TTY в Мастерской; не корневой таб |
| 2026-11-11 | Agent skills: emilkowalski design/animation | В `.cursor/skills/` только design+motion; on-demand |
| 2026-11-11 | Темы UI: каталог в THEMES.md | Default `deep-sea-neon`; акцент зашит в тему; выбор в Настройки → Внешний вид |
| 2026-11-11 | Future F1/F2 в PRD | Камеры видеонаблюдения; умная техника/фурнитура — не must |
| 2026-11-11 | Future F3–F8 в PRD | Календарь/таймеры; почта; файлы; заметки; медиа; i18n — не must |
| 2026-11-11 | Future F9–F13 в PRD | Wake/barge-in; профили; backup/забыть; режимы confirm; Doctor — не must; до F12 confirm = always |
| 2026-11-11 | Дорожная карта P0–P11 | Разработка строго по фазам в WIP; старт с каркаса → MVP-0 текст → голос → … |
| 2026-11-11 | Стек (допущение до P0.1) | Electron + React + TS; SQLite; один LLM-адаптер сначала; confirm=always |
| 2026-11-11 | Стек принят (P0.1) | Electron + React + TypeScript; SQLite через `node:sqlite`; Vite; confirm=always |
| 2026-11-11 | P0 каркас готов | AppShell 4 корня, 14 тем, ConfirmModal, Doctor stub, bootstrap DB |
| 2026-11-11 | Первый LLM-адаптер | OpenAI-compatible (+ `mock` без ключа); ключи только `.env` |
| 2026-11-11 | P1 MVP-0 готов | Стриминг чата, utterances в SQLite, поиск памяти, тест LLM в Настройках |
| 2026-11-11 | ASR/TTS движок P2 | Web Speech API в Electron/Chromium; RU-голос по умолчанию если есть |
| 2026-11-11 | P2 голос готов | PTT→ASR→LLM→TTS; каталог голосов; Стоп озвучки; Demo PTT fallback |
| 2026-11-11 | Формат skills/protocols | Markdown + YAML frontmatter; seed в `seed/`, runtime в `data/` |
| 2026-11-11 | Skills default off in context | В контекст только matched triggers / явная команда; не весь каталог |
| 2026-11-11 | P3 готов | Demo code-helper + summarizer; protocol morning-check; Workshop CRUD/Run |
| 2026-11-11 | Web tools P4 | DuckDuckGo search + fetch; WEB_* env; confirm на fetch |
| 2026-11-11 | ConfirmBridge | IPC confirm-request/response для опасных исходящих действий |
| 2026-11-11 | P4 готов | web.search в диалоге; тест в Интеграциях; p4:smoke OK |
| 2026-11-11 | Провайдеры Claude / Gemini / GPT — must | Без lock-in на одного вендора |
| 2026-11-11 | OS priority для screen | **linux → windows → macos** (`OS_PRIORITY`); Linux first в cloud/dev |
| 2026-11-11 | Screen capture P5 | desktopCapturer + fallback window/placeholder; PNG в `data/screenshots/` |
| 2026-11-11 | Screen control P5 | клик/ввод через xdotool + confirm; dry-run если xdotool нет |
| 2026-11-11 | Browser P5 | openExternal + SQLite `browser_visits`; Chromium History read-only fallback |
| 2026-11-11 | P5 готов | «что на экране» / open URL / история; Интеграции UI; p5:smoke OK |
| 2026-11-11 | Первый мессенджер | **Telegram** (Bot API); WhatsApp/Instagram — stub UI |
| 2026-11-11 | Messaging P6 | resolve contact → preview/confirm → live или dry-run; SQLite log |
| 2026-11-11 | P6 готов | send/reply в TG через confirm; Интеграции; p6:smoke OK |
| 2026-11-11 | Terminal P7 | node-pty + xterm в Мастерской; multi-session; cwd; dialog→shell + confirm |
| 2026-11-11 | P7 готов | 16.1–16.8 happy-path; p7:smoke OK |
| 2026-11-11 | Library/learn P8 | txt/md extract+analyze; PDF/AV stub; learned_units; skill confirm |
| 2026-11-11 | P8 готов | 14.1–14.9 happy-path; p8:smoke OK |
| 2026-11-11 | Publish security harden | IPC token+sender gate; terminal confirm; path allowlist; SSRF guard; owner_id sessions; redact health paths; system browser history off by default |
| 2026-11-11 | TTS train P9 = local corpus pack | Neural train later; synthesis fallback = Web Speech; custom voice в #11 + LLM-profile stub |
| 2026-11-11 | P9 готов | 15.1–15.9 happy-path; p9:smoke OK |
| 2026-11-11 | Blender bridge P10 | bpy через CLI `--background --python`; dry-run без бинарника |
| 2026-11-11 | Blender-skills on-demand | `blender-scene` default off; в контекст только на Blender-задачу |
| 2026-11-11 | P10 готов | демо-сцена куб+свет; p10:smoke OK |
| 2026-11-11 | P11 F* приоритет | После must: **F11** backup/забыть → **F13** Doctor полный → **F9** barge-in |
| 2026-11-11 | Doctor-light P11 | mic/API/Blender/tools findings + fix hints; UI Настройки→Данные |
| 2026-11-11 | P11 готов | критерии 1–16 ≥ partial; p11:smoke OK |
| 2026-11-11 | Backup format mira-backup-v1 | БД + library + voice-studio + skills/protocols; secrets только opt-in |
| 2026-11-11 | F11 готов | export/import + forget (memory/learned/library/voice/all); f11:smoke OK |
| 2026-11-11 | Session logs F13 | SQLite `app_logs` + `data/logs/*.jsonl`; doctor показывает recentErrors |
| 2026-11-11 | F13 готов | полный Doctor + log viewer; f13:smoke OK |
| 2026-11-11 | F9 hands-free | Wake-фраза + sensitivity в localStorage; barge-in → listening |
| 2026-11-11 | F9 готов | Chat «Перебить»/Space; Настройки → Голос; f9:smoke OK |
| 2026-11-11 | F12 confirm modes | always / smart / dangerous-list + actionClass на tool confirms |
| 2026-11-11 | F1–F8 pack | cameras/iot/calendar/mail/files/notes/media/i18n via chat+UI; F10 skipped |
| 2026-11-11 | f-rest:smoke OK | покрытие F1–F8+F12 без F10 |
| 2026-11-11 | Realize-all | Claude/Gemini/offline + vision + F10 profiles + HUD + CI/pack + WA/IG dry-run |
| 2026-11-11 | Grok (xAI) | LLM_PROVIDER=grok + XAI_API_KEY → api.x.ai/v1 |
| 2026-11-11 | UI redesign | Jarvis-HUD композиция + темы Mira; CoreOrb 1–5; IA 4 пункта |
| 2026-11-11 | SQLite path | Default `mira/library/database/mira.db`; миграция с `mira/database` и `data/mira.db` |
| 2026-11-11 | Skills workshop | UI create/edit + tags; `saveSkill` IPC; browser localStorage fallback |


| 2026-11-11 | f-all:smoke | deepenings smoke |


## Баги

| ID | Статус | Описание | Где | Заметки |
|----|--------|----------|-----|---------|
| — | — | Открытых багов нет: приложения ещё нет | — | Появляются вместе с кодом |

Шаблон:

```
| BUG-001 | open | краткое описание | модуль/экран | шаги / ожидаемое / факт |
```

## Хронология

| Дата | Событие |
|------|---------|
| 2026-10-21 | В репозиторий загружен TTS-прототип (`mira_tts`, скрипты, конфиги) |
| 2026-11-11 | Удалены `requirements.txt`, `configs/`, `scripts/`, `src/mira_tts/`, `README.md` |
| 2026-11-11 | Создана папка `docs/` и каркас файлов |
| 2026-11-11 | Заполнены docs; продукт уточнён как голосовой помощник |
| 2026-11-11 | В PRD оформлены обязательные возможности (сейчас 1–16) |
| 2026-11-11 | В PRD добавлен блок «на будущее»: F1 камеры, F2 умный дом |
| 2026-11-11 | Future расширен: F3–F8 (календарь, почта, файлы, заметки, медиа, i18n) |
| 2026-11-11 | Future расширен: F9–F13 (wake/barge-in, профили, backup, confirm modes, Doctor) |
| 2026-11-11 | Зафиксирован план разработки P0–P11 в WIP.md |
| 2026-11-11 | Завершён этап P0 (каркас приложения) |
| 2026-11-11 | Завершён этап P1 (текст + LLM + память) |
| 2026-11-11 | Завершён этап P2 (голос ASR/TTS + каталог) |
| 2026-11-11 | Завершён этап P3 (skills + протоколы) |
| 2026-11-11 | Завершён этап P4 (интернет + confirm) |
| 2026-11-11 | Завершён этап P5 (экран + браузер) |
| 2026-11-11 | Завершён этап P6 (Telegram + stubs WA/IG) |
| 2026-11-11 | Завершён этап P7 (встроенный терминал) |
| 2026-11-11 | Завершён этап P8 (библиотека и обучение) |
| 2026-11-11 | Завершён этап P9 (студия голоса) |
| 2026-11-11 | Завершён этап P10 (Blender bridge) |
| 2026-11-11 | Завершён этап P11 (стабилизация must) |
| 2026-11-11 | Завершён F11 (backup / забывать) |
| 2026-11-11 | Завершён F13 (Doctor / логи) |
| 2026-11-11 | Завершён F9 (wake-word / barge-in) |
| 2026-11-11 | Завершён F* pack без F10 |
| 2026-11-11 | «Реализуй все»: F10 + LLM/vision/HUD/CI |

| 2026-11-11 | DESIGN: информационная архитектура, карта настроек |
| 2026-11-11 | Подключены agent skills Emil Kowalski (design/animation) |
| 2026-11-11 | Добавлен каталог 14 цветовых тем + референсы в docs/themes/ |

---

Обновлять при каждом значимом решении, баге или смене фазы.

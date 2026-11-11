# MEMORY

Живая память проекта: где мы сейчас, что решили, что ломалось, что было по времени.

## Статус

| Поле | Значение |
|------|----------|
| Фаза | **P11 — Стабилизация must ✅** (обязательный контур 1–16 ≥ partial) |
| Продукт | Голосовой ИИ-помощник Mira (диалог, память, сеть, экран, TG, TTY, learn, voice, Blender) |
| Код | P0–P11: doctor-light + p11:smoke happy-path #1–16 |
| Предыдущее | Учебный TTS (`mira_tts`) удалён; не восстанавливаем как есть |
| Документы | `MEMORY`, `RULES`, `PRD`, `DESIGN`, `THEMES`, `ARHITECTURE`, `WIP` |
| Дорожная карта | Must P0–P11 закрыт → дальше F* по приоритету |

**Сейчас:** P11 закрыт. Следующие F*: **F11 → F13 → F9** (решение P11).

## Решения

Записывать сюда только принятые решения (не идеи). Формат: дата · решение · почему.

| Дата | Решение | Почему |
|------|---------|--------|
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
| 2026-11-11 | DESIGN: информационная архитектура, карта настроек |
| 2026-11-11 | Подключены agent skills Emil Kowalski (design/animation) |
| 2026-11-11 | Добавлен каталог 14 цветовых тем + референсы в docs/themes/ |

---

Обновлять при каждом значимом решении, баге или смене фазы.

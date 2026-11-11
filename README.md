# Mira

Локальный голосовой ИИ-помощник. Источник правды по продукту — [`docs/`](./docs/).

## Фаза сейчас

**P2 — Голос:** PTT → Web Speech ASR → LLM → TTS; каталог системных голосов.  
P1: текстовый диалог + LLM (`mock` / OpenAI-compatible) + память.  
P0: Electron + React + TypeScript, 4 корня UI, темы.

Дорожная карта: [`docs/WIP.md`](./docs/WIP.md).

## Быстрый старт

```bash
cp .env.example .env
npm install
npm run db:check     # создаёт data/mira.db и bootstrap-сессию
npm run p1:smoke     # headless: mock-чат + поиск памяти
npm run p2:smoke     # headless: каталог голосов / engine status
npm run dev          # UI в браузере (без IPC)
npm run dev:electron # UI + Electron + SQLite + LLM + голос
```


Без `OPENAI_API_KEY` используется **mock**. Для живой модели:

```env
LLM_PROVIDER=openai
LLM_MODEL=gpt-4o-mini
OPENAI_API_KEY=sk-...
# OPENAI_BASE_URL=https://api.openai.com/v1
```

Сборка:

```bash
npm run build
npm start
```

## Структура

- `electron/` — main/preload + SQLite store
- `src/ui/` — React AppShell (Диалог / Память / Мастерская / Настройки)
- `src/*` — модульные stubs под ARHITECTURE
- `docs/` — PRD, DESIGN, RULES, MEMORY, WIP

Секреты только в `.env` (не коммитить).

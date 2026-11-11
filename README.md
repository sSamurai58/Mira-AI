# Mira

Локальный голосовой ИИ-помощник. Источник правды по продукту — [`docs/`](./docs/).

## Фаза сейчас

**P5 — Экран + браузер:** capture, клик/ввод + confirm, open URL, история.  
**P4 — Web** · **P3 — Skills/Protocols** · **P2 — Голос** · **P1 — чат/память** · **P0 — shell**.

Дорожная карта: [`docs/WIP.md`](./docs/WIP.md).

## Быстрый старт

```bash
cp .env.example .env
npm install
npm run db:check     # создаёт data/mira.db и bootstrap-сессию
npm run p1:smoke     # headless: mock-чат + поиск памяти
npm run p2:smoke     # headless: каталог голосов / engine status
npm run p3:smoke     # headless: on-demand skills + protocol match
npm run p4:smoke     # headless: DuckDuckGo search + chat webUsed
npm run p5:smoke     # headless: screen capture + browser open/history
npm run dev          # UI в браузере (без IPC)
npm run dev:electron # полный локальный контур
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

- `electron/` — main/preload + SQLite store + tools (web/screen/browser)
- `src/ui/` — React AppShell (Диалог / Память / Мастерская / Настройки)
- `src/*` — модульные stubs под ARHITECTURE
- `docs/` — PRD, DESIGN, RULES, MEMORY, WIP

Секреты только в `.env` (не коммитить).

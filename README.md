# Mira

Локальный голосовой ИИ-помощник. Источник правды по продукту — [`docs/`](./docs/).

## Фаза сейчас

**P0 — Каркас:** Electron + React + TypeScript, SQLite (`node:sqlite`), 4 корневых раздела UI, темы, stubs.

Дорожная карта: [`docs/WIP.md`](./docs/WIP.md).

## Быстрый старт

```bash
cp .env.example .env
npm install
npm run db:check    # создаёт data/mira.db и bootstrap-сессию
npm run dev         # UI в браузере (без IPC)
npm run dev:electron # UI + Electron + SQLite IPC
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

# Mira local data

Локальные данные приложения, рядом с кодом Mira.

| Путь | Назначение |
|------|------------|
| `mira/database/` | SQLite (`mira.db` + WAL/SHM). Путь по умолчанию и в `.env.example`. |

Остальной runtime (skills, screenshots, logs, backups) пока в `data/`.  
Не коммитьте `*.db` — они в `.gitignore`.

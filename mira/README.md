# Mira local data

Локальные данные приложения, рядом с кодом Mira.

| Путь | Назначение |
|------|------------|
| `mira/library/` | Библиотека материалов (импорт/learn) |
| `mira/library/database/` | SQLite (`mira.db` + WAL/SHM) |

Остальной runtime (skills, screenshots, logs, backups) пока в `data/`.  
Не коммитьте `*.db` и содержимое библиотеки — в `.gitignore`.

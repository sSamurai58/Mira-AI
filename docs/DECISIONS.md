# Decisions (ADR)

## ADR-1: Историческое имя ARHITECTURE.md
- Дата: 2026-11-11
- Статус: принято
- Контекст: файл архитектуры уже жил как `ARHITECTURE.md` в репо и ссылках.
- Решение: не переименовывать; `docs/ARCHITECTURE.md` — ярлык для product-team.
- Альтернативы: массовый rename + правка всех ссылок.
- Последствия: два пути к одному смыслу; канон — `ARHITECTURE.md`.

## ADR-2: product-team как Cursor skill разработки
- Дата: 2026-11-16
- Статус: принято
- Контекст: нужна ролевая дисциплина (менеджер → одна роль → артефакт) без смешения с runtime-скиллами Mira (PRD #9).
- Решение: пакет `https://github.com/sSamurai58/skills/tree/main/product-team` живёт в `.cursor/skills/product-team`; on-demand при разработке.
- Альтернативы: только внешняя ссылка без копии; runtime-каталог `data/skills`.
- Последствия: обновления — re-copy из upstream; не путать с пользовательскими skills в приложении.

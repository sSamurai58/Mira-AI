# Release

## Версия / имя выпуска

**0.1.44** — unslop A–K (quiet chrome, Home = CoreOrb). Windows-only сейчас; macOS / Android — по отдельной команде.

## Критерий «выпуск закрыт»
- [ ] Windows installer published (`win/v0.1.44` → Release `v0.1.44`)
- [ ] GitHub Release published (не draft)
- [ ] macOS / Android — ждут команды

## Чеклист
- [x] bump 0.1.44
- [ ] Тег `win/v0.1.44` (без голого `v*` — полный Release не стартуем)
- [ ] Код на `main` до сборки (workflow checkout `main`)

## Откат
- `v0.1.43` (ключи MIRA-XXXX… / пресеты срока)

## Заметки
- Только Windows via `win/v*`. Не пушить голый `v0.1.44`, пока не скажут «остальные OS».

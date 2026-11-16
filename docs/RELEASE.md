# Release

## Версия / имя выпуска

**0.1.35** — hotfix: голос V1–V19, update relaunch/gate, home-rail perf, skills/MCP, product-team.

## Критерий «выпуск закрыт»
- [x] Пайплайн зелёный на релизной ветке (после CI)
- [x] Секреты не в репозитории
- [x] GLOSSARY / VOICE-AUDIT согласованы с кодом
- [ ] Путь PRD пройден на staging (ручной smoke после install)
- [ ] Блокеры тестировщика = 0 (после прослушивания голоса + update)
- [ ] Откат описан

## Чеклист выкладки
- [x] Merge #145 update relaunch + gate
- [x] Merge #146 home-rail perf
- [x] Merge #144 skills/MCP modal
- [x] Merge #147 product-team skill
- [x] Merge #148/#149 voice audit + V1–V19
- [x] bump `package.json` → 0.1.35 + changelog
- [ ] CI release Win → mac, тег `v0.1.35`
- [ ] `latest.yml` / mac yml на GitHub Releases

## Откат
- процедура: предыдущий GitHub Release `v0.1.34` остаётся доступен; при необходимости снять latest с 0.1.35 / поставить вручную 0.1.34.

## Заметки выпуска
- После 0.1.35 **переобучить** кастомный голос (`weightsFormat: 2`).
- Во время update — окно «Мира обновляется»; после — автозапуск.

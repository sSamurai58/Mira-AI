# Release

## Версия / имя выпуска

**0.1.36** — планшетная адаптация, статус обучения голоса, Android APK.

## Критерий «выпуск закрыт»
- [x] Пайплайн на релизной ветке
- [x] Секреты не в репозитории
- [ ] CI release Win + mac + Android зелёный
- [ ] `latest.yml` / mac yml + `Mira-*-android.apk` на GitHub Releases

## Чеклист выкладки
- [x] Tablet portrait/landscape compact shell
- [x] Voice train lifecycle card
- [x] Capacitor Android + Release job
- [x] bump `package.json` → 0.1.36 + changelog
- [ ] Тег `v0.1.36` → Release workflow
- [ ] Gate `release-all`

## Откат
- предыдущий GitHub Release `v0.1.35`

## Заметки
- Android = WebView UI (не полный Electron); см. `docs/ANDROID.md`
- После 0.1.35 всё ещё нужен retrain кастомного голоса (`weightsFormat: 2`)

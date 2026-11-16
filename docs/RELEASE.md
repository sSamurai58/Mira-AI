# Release

## Версия / имя выпуска

**0.1.37** — Android APK signed + Mira icon (fix «пакет недействителен»).

## Критерий «выпуск закрыт»
- [x] APK подписан (`apksigner verify`)
- [x] Иконка Mira в mipmaps
- [ ] CI release Win + mac + Android зелёный
- [ ] GitHub Release published (не draft)

## Чеклист
- [x] `signingConfigs.ciDebug` на release buildType
- [x] `scripts/android-icons.mjs`
- [x] bump 0.1.37
- [ ] Тег `v0.1.37`

## Откат
- `v0.1.36` (Win/mac ок; Android APK был unsigned)

## Заметки
- 0.1.36 Android не ставился: unsigned release → «пакет недействителен»

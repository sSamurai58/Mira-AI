# Android (планшетная оболочка)

## Что это
Mira на Android — **Capacitor WebView** поверх того же React UI (`dist/`), с компактной tablet-адаптацией (портрет / ландшафт).

**Не** Electron: нет `window.mira` IPC, локального SQLite Electron-store, NSIS-апдейтера и нативного voice-studio train worker. Работают browser-fallback пути (чат/настройки с ключами в UI, локальная студия в `localStorage` где уже было).

## Ориентация
- Portrait: верхняя панель + выезжающее меню, workshop-сегменты горизонтальным скроллом
- Landscape: узкий icon-rail слева, контент на всю ширину

См. `src/ui/hooks/useLayoutMode.ts` + CSS `[data-layout="tablet-*"]`.

## Сборка локально
```bash
npm run pack:android:debug   # debug APK
npm run pack:android         # release APK (unsigned / debug-signed by Gradle defaults)
```
Нужны JDK 21 + Android SDK. Артефакт: `android/app/build/outputs/apk/...`

## Релиз CI
Тег `v*` → workflow `Release`:
1. Windows
2. macOS (+ Android параллельно после Windows)
3. Gate `release-all` = Win + mac + Android

APK: `Mira-<version>-android.apk` в том же GitHub Release.

## Ограничения v1
- Sideload APK подписан **Android debug keystore** (ставится с «Неизвестные источники»). Play Store key — позже.
- Без полного локального нейро-TTS Electron
- Терминал / desktop automation / update gate — desktop-only

## Иконка
`node scripts/android-icons.mjs` → mipmaps из `build/icon-512.png` (Mira mark). CI вызывает перед `assembleRelease`.

## Следующие шаги
- Подписать release keystore через GitHub Secrets (`MIRA_ANDROID_STORE_*`)
- Deep-link / mic runtime permission UX
- Опционально: Capacitor filesystem для корпуса голоса

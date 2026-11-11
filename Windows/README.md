# Mira для Windows

Готовый пакет десктоп-приложения Mira (Electron): zip / NSIS / portable.

## Что внутри

| Путь | Назначение |
|------|------------|
| `Mira-Setup-0.0.1.zip` | **Рекомендуется** — архив приложения без NSIS |
| `Mira-Setup-0.0.1.exe` | Установщик Windows (NSIS, x64) |
| `Mira-Portable-0.0.1.exe` | Portable-запуск (тоже NSIS SFX) |
| `Mira-Launch.bat` | Хелпер запуска |
| `config/electron-builder.windows.yml` | Конфиг сборки под Windows |
| `scripts/build-installer.mjs` | Скрипт `npm run pack:windows` |
| `nsis/` | Лицензия и макросы NSIS |
| `COPY.txt` | Карта копий / артефактов |

## Установка

**Предпочтительно (без ошибки NSIS integrity check):**

1. Распакуйте `Mira-Setup-0.0.1.zip` (или `.7z` из артефактов).
2. Запустите `Mira.exe`.

NSIS (`Mira-Setup-*.exe`), собранный через Wine на Linux, на части ПК
даёт «Installer integrity check has failed» даже на целом файле — используйте zip/7z.

Локальные данные (ключи, библиотека) — `%APPDATA%\Mira`.

## Сборка у себя

```bash
npm ci
npm run pack:windows
```

На Linux для NSIS нужны Wine + wine32. На Windows CI (`windows-installer.yml`) сборка нативная; `node-pty` пересобирается там, иначе терминал использует spawn-fallback.

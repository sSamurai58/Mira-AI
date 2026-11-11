# Mira для Windows

Готовый пакет десктоп-приложения Mira (Electron): NSIS-установщик и portable.

## Что внутри

| Путь | Назначение |
|------|------------|
| `Mira-Setup-0.0.1.exe` | Установщик Windows (NSIS, x64) |
| `Mira-Portable-0.0.1.exe` | Portable-запуск без установки |
| `Mira-Launch.bat` | Хелпер запуска |
| `config/electron-builder.windows.yml` | Конфиг сборки под Windows |
| `scripts/build-installer.mjs` | Скрипт `npm run pack:windows` |
| `nsis/` | Лицензия и макросы NSIS |
| `COPY.txt` | Карта копий / артефактов |

## Установка

1. Запустите `Mira-Setup-0.0.1.exe`.
2. Выберите папку → Install.
3. Запуск: меню «Пуск» → **Mira** (или ярлык на рабочем столе).

Без установки: `Mira-Portable-0.0.1.exe`.

Локальные данные (ключи, библиотека) — в профиле пользователя / рядом с приложением.

## Сборка у себя

```bash
npm ci
npm run pack:windows
```

На Linux для NSIS нужны Wine + wine32. На Windows CI (`windows-installer.yml`) сборка нативная; `node-pty` пересобирается там, иначе терминал использует spawn-fallback.

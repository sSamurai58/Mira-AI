# Отчёт: планшетная адаптация + Android

Дата: 2026-11-16 (Europe/Moscow)

## 1. Проблема
На скринах UI был desktop-only: широкий сайдбар, плотный chat-toolbar, вертикальный nav Мастерской, высокие карточки Skills, длинная модалка правки, одноколоночная Студия. Для планшета (портрет/ландшафт) и Android так быть не должно.

## 2. Планшетная адаптация
- Хук `useLayoutMode`: режимы `desktop` | `tablet-landscape` | `tablet-portrait` → `html`/`app-shell` `data-layout`
- **Landscape:** icon-rail (~76px), подписи скрыты, workspace на всю ширину
- **Portrait:** topbar (☰ / бренд / +), drawer-меню + scrim, сегменты Мастерской горизонтальным скроллом
- Chat: вторичные chips (`chat-toolbar-extra`) скрыты на tablet
- Skills: denser cards; 1 колонка в портрете, auto-fill в ландшафте
- Modal edit: почти full-bleed, ограничение высоты preview
- Electron `minWidth` 720 (было 960) — можно сузить окно под tablet preview
- Статус обучения голоса (карточка % / дообучить) — из PR train UI, влит в эту ветку

## 3. Android installer
- Capacitor 8 (`ai.mira.app`), проект `android/`
- Scripts: `pack:android`, `pack:android:debug`, `cap:sync`
- Manifest: `fullUser` orientation, mic permission, soft input resize
- CI Release: job `release-android` → `Mira-<ver>-android.apk` в тот же GitHub Release
- Gate `release-all` = Win + mac + Android

## 4. Ограничения
Android ≠ полный Electron. Нет native train worker / update gate / pty. UI + browser fallbacks.

## 5. Релиз
По команде «запускай релиз»: bump → main → tag → Release Win/mac/Android.
Пока **не** тегаем — ждём команду.

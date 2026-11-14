# Ветки и релизы Mira

## Коротко

| Ветка | Зачем |
|-------|--------|
| **`develop`** | Вся разработка: фичи, фиксы, эксперименты. Сюда мержим `cursor/*` PR. |
| **`main`** | Только **актуальная версия для установки**. Код совпадает с последним опубликованным релизом. |
| **`cursor/…-6838`** | Рабочие ветки агента/фич → PR в `develop`. |

**Установщики (.exe / .zip / `latest.yml`) в git не кладём.**  
Они публикуются в **GitHub Releases** (тег `v*`). Автообновление Mira читает именно Releases, не файлы из ветки.

Папка с `Mira.exe` на диске = движок Chromium; ваши данные — `%APPDATA%\Mira` (см. `ЧИТАЙ-МЕНЯ.txt` в установке).

## Поток работы

```
cursor/feature-…  →  PR  →  develop  →  (релиз)  →  main  →  tag vX.Y.Z  →  GitHub Release
```

1. Делаем фичу в `cursor/…-6838` от **`develop`**.
2. PR → **`develop`** (CI зелёный).
3. Когда пользователь говорит **«Делай релиз» / «Запускай релиз»**:
   - с `develop` собираем релизный PR в **`main`** (bump `package.json`, changelog, MEMORY);
   - мержим в `main`;
   - ставим тег **`vX.Y.Z`** на коммит **`main`**;
   - workflow `Release` **всегда** публикует **Windows и macOS вместе** в один GitHub Release
     (`latest.yml` + `latest-mac.yml`, exe/zip + dmg/zip). Релиз не считается готовым,
     пока не зелёны оба job’а (`release-all` gate).
4. После релиза `main` = то, что ставится; `develop` продолжает жить дальше (при необходимости fast-forward / merge main → develop).

## Запреты

- Не пушить сырые фичи прямо в `main`.
- Не коммитить `.exe` / `.zip` / `latest.yml` в репозиторий.
- Не ставить тег `v*` с ветки, которой нет в истории `main` (после перехода на эту схему).
- Непубликованные эксперименты — не в `main`.
- **Не выпускать релиз только под Windows или только под macOS** — всегда оба в одном теге.
- macOS DMG/ZIP пока **unsigned** (Gatekeeper: ПКМ → Открыть); Apple Developer signing — позже.

## CI

- **CI** — `develop`, `main`, `cursor/**`.
- **Windows installer (артефакт без publish)** — `develop` / `main` / `cursor/**` (проверка упаковки).
- **Release (publish)** — только по тегу `v*`, коммит должен быть предком `main`;
  jobs: `release-windows` + `release-macos` (параллельно) → `release-all`.

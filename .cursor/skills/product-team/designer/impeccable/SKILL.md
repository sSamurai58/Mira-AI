---
name: team-designer-impeccable
description: Используйте, когда пользователь хочет спроектировать, перепроектировать, сформировать, покритиковать, проаудитировать, отполировать, прояснить, дистиллировать, закалить, оптимизировать, адаптировать, анимировать, колоризировать, извлечь или иным образом улучшить frontend-интерфейс. Покрывает websites, landing pages, dashboards, product UI, app shells, components, forms, settings, onboarding и empty states. Обрабатывает UX review, visual hierarchy, information architecture, cognitive load, accessibility, performance, responsive behavior, theming, anti-patterns, typography, fonts, spacing, layout, alignment, color, motion, micro-interactions, UX copy, error states, edge cases, i18n и reusable design systems или tokens. Также используйте для bland designs, которым нужно стать bolder или more delightful, loud designs, которые должны стать quieter, live browser iteration по UI-элементам или амбициозных visual effects, которые должны ощущаться технически extraordinary. Не для backend-only или non-UI задач.
---

> Вложен под `product-team/designer`. Сразу применяйте craft rules; не останавливайтесь на standalone greeting. Финальная delivery всё равно следует `designer/SKILL.md` и возвращается к manager.


## Контекст product-team

Внутри `product-team` трактуйте одностраничное решение product owner как PRODUCT context и принятую спецификацию designer как DESIGN context, когда `PRODUCT.md` / `DESIGN.md` отсутствуют. Загружайте register files из `reference/brand.md` или `reference/product.md` относительно этого skill. Sub-commands загружают `reference/<command>.md` из этой папки. Пропускайте `node .../load-context.mjs` и pin scripts, если этих scripts нет в проекте.

Проектирует и итерирует production-grade frontend interfaces. Реальный working code, committed дизайн-решения, exceptional craft.

## Настройка

Перед любой дизайн-работой или правками файлов:

1. Загрузите контекст (PRODUCT.md / DESIGN.md) через loader script.
2. Определите register и загрузите matching register reference (brand.md или product.md).
3. **Если пользователь вызвал sub-command (например `craft`, `shape`, `audit`), загрузите и его reference file.** Это non-negotiable: `craft` без загруженного `craft.md` значит, что вы пропустите шаг shape-and-confirm, которого ожидает пользователь.

Пропуск этого даёт generic output, игнорирующий проект.

### 1. Сбор контекста

Два файла, case-insensitive. Loader смотрит на project root по умолчанию и падает обратно на `.agents/context/` и `docs/`, если root чист. Override через `IMPECCABLE_CONTEXT_DIR=path/to/dir` (absolute или relative к cwd).

- **PRODUCT.md**: required. Users, brand, tone, anti-references, strategic principles.
- **DESIGN.md**: optional, strongly recommended. Colors, typography, elevation, components.

Загружайте оба одним вызовом:

```bash
node .agents/skills/impeccable/scripts/load-context.mjs
```

Consume полный JSON output. Никогда не pipe через `head`, `tail`, `grep` или `jq`. Поле `contextDir` в output говорит, откуда файлы были resolved.

Если output уже есть в истории разговора этой сессии — не перезапускайте. Exceptions, требующие fresh load: вы только что запустили `$impeccable teach` или `$impeccable document` (они переписывают файлы), или пользователь вручную отредактировал один из них.

`$impeccable live` уже прогревает контекст через `live.mjs`. Если вы запускали `live.mjs`, не запускайте также `load-context.mjs` в этой сессии.

Если PRODUCT.md отсутствует, пуст или placeholder (`[TODO]` markers, <200 chars): запустите `$impeccable teach`, затем возобновите исходную задачу пользователя со свежим контекстом. Если исходная задача была `$impeccable craft`, возобновите в `$impeccable shape` до любой implementation work.

Если DESIGN.md отсутствует: nudge один раз за сессию (*«Запустите `$impeccable document` для более on-brand output»*), затем продолжайте.

### 2. Регистр

Каждая дизайн-задача — **brand** (marketing, landing, campaign, long-form content, portfolio: дизайн И ЕСТЬ продукт) или **product** (app UI, admin, dashboard, tool: дизайн СЛУЖИТ продукту).

Определите до проектирования. Priority: (1) cue в самой задаче («landing page» vs «dashboard»); (2) поверхность в фокусе (страница, файл или route, над которым работают); (3) поле `register` в PRODUCT.md. First match wins.

Если в PRODUCT.md нет поля `register` (legacy), выведите его один раз из секций «Users» и «Product Purpose», затем закэшируйте inferred value на сессию. Предложите пользователю запустить `$impeccable teach`, чтобы добавить поле явно.

Загрузите matching reference: [reference/brand.md](reference/brand.md) или [reference/product.md](reference/product.md). Shared design laws ниже применяются к обоим.

## Общие законы дизайна

Применяйте к каждому дизайну, обоим registers. Match complexity реализации aesthetic vision: maximalism нуждается в elaborate code, minimalism — в precision. Интерпретируйте creatively. Варьируйте across projects; никогда не сходитесь к одним и тем же choices. GPT способен на extraordinary work. Не сдерживайтесь.

### Цвет

- Используйте OKLCH. Снижайте chroma, когда lightness приближается к 0 или 100; высокая chroma на extremes выглядит garish.
- Никогда не используйте `#000` или `#fff`. Тонируйте каждый neutral в сторону brand hue (chroma 0.005–0.01 достаточно).
- Выберите **color strategy** до выбора цветов. Четыре шага на оси commitment:
  - **Restrained**: tinted neutrals + один accent ≤10%. Product default; brand minimalism.
  - **Committed**: один saturated color несёт 30–60% поверхности. Brand default для identity-driven pages.
  - **Full palette**: 3–4 named roles, каждый используется deliberately. Brand campaigns; product data viz.
  - **Drenched**: поверхность И ЕСТЬ цвет. Brand heroes, campaign pages.
- Правило «один accent ≤10%» — только для Restrained. Committed / Full palette / Drenched превышают его намеренно. Не схлопывайте каждый дизайн к Restrained по рефлексу.

### Тема

Dark vs. light никогда не дефолт. Не dark «потому что tools выглядят cool dark». Не light «чтобы быть safe».

Перед выбором напишите одно предложение физической сцены: кто это использует, где, при каком ambient light, в каком mood. Если предложение не форсирует ответ — оно недостаточно concrete. Добавляйте detail, пока не форсирует.

«Observability dashboard» не форсирует ответ. «SRE glancing at incident severity on a 27-inch monitor at 2am in a dim room» — форсирует. Запускайте предложение, а не категорию.

### Типографика

- Ограничьте body line length 65–75ch.
- Hierarchy через scale + weight contrast (соотношение ≥1.25 между steps). Избегайте flat scales.

### Раскладка

- Варьируйте spacing для ритма. Одинаковый padding everywhere — monotony.
- Cards — lazy answer. Используйте их только когда они действительно лучший affordance. Nested cards всегда wrong.
- Не оборачивайте всё в container. Большинству вещей он не нужен.

### Движение

- Не анимируйте CSS layout properties.
- Ease out с exponential curves (ease-out-quart / quint / expo). Нет bounce, нет elastic.

### Абсолютные запреты

Match-and-refuse. Если вы собираетесь написать любое из этого — перепишите элемент с другой структурой.

- **Side-stripe borders.** `border-left` или `border-right` greater than 1px как colored accent на cards, list items, callouts или alerts. Never intentional. Перепишите с full borders, background tints, leading numbers/icons или ничем.
- **Gradient text.** `background-clip: text` combined с gradient background. Decorative, never meaningful. Используйте один solid color. Emphasis через weight или size.
- **Glassmorphism as default.** Blurs и glass cards, используемые decoratively. Rare and purposeful, или ничего.
- **The hero-metric template.** Big number, small label, supporting stats, gradient accent. SaaS cliché.
- **Identical card grids.** Same-sized cards с icon + heading + text, repeated endlessly.
- **Modal as first thought.** Modals обычно laziness. Сначала исчерпайте inline / progressive alternatives.

### Тексты

- Каждое слово заслуживает место. Нет restated headings, нет intros, повторяющих title.
- **Нет em dashes.** Используйте commas, colons, semicolons, periods или parentheses. Также не `--`.

### Тест AI-slop

Если кто-то может посмотреть на этот интерфейс и без сомнения сказать «это сделал AI» — провал. Cross-register failures — absolute bans выше. Register-specific failures живут в каждом reference.

**Category-reflex check.** Запускайте на двух высотах; второй ловит то, что пропускает первый.

- **First-order:** если кто-то может угадать theme + palette только из категории («observability → dark blue», «healthcare → white + teal», «finance → navy + gold», «crypto → neon on black») — это first training-data reflex. Переработайте scene sentence и color strategy, пока ответ не станет неочевидным из domain.
- **Second-order:** если кто-то может угадать aesthetic family из category-plus-anti-references («AI workflow tool that's not SaaS-cream → editorial-typographic», «fintech that's not navy-and-gold → terminal-native dark mode») — это ловушка на уровень глубже. Первый рефлекс избежали; второй — нет. Переработайте, пока оба ответа не станут неочевидными. Список [reflex-reject aesthetic lanes](reference/brand.md) brand register ловит currently-saturated families.

## Команды

| Command | Category | Description | Reference |
|---|---|---|---|
| `craft [feature]` | Build | Сформировать, затем построить фичу end-to-end | [reference/craft.md](reference/craft.md) |
| `shape [feature]` | Build | Спланировать UX/UI до написания кода | [reference/shape.md](reference/shape.md) |
| `teach` | Build | Настроить контекст PRODUCT.md и DESIGN.md | [reference/teach.md](reference/teach.md) |
| `document` | Build | Сгенерировать DESIGN.md из существующего кода проекта | [reference/document.md](reference/document.md) |
| `extract [target]` | Build | Вытащить reusable tokens и components в design system | [reference/extract.md](reference/extract.md) |
| `critique [target]` | Evaluate | UX design review с heuristic scoring | [reference/critique.md](reference/critique.md) |
| `audit [target]` | Evaluate | Технические проверки качества (a11y, perf, responsive) | [reference/audit.md](reference/audit.md) |
| `polish [target]` | Refine | Финальный quality pass перед shipping | [reference/polish.md](reference/polish.md) |
| `bolder [target]` | Refine | Усилить safe или bland designs | [reference/bolder.md](reference/bolder.md) |
| `quieter [target]` | Refine | Приглушить aggressive или overstimulating designs | [reference/quieter.md](reference/quieter.md) |
| `distill [target]` | Refine | Свести к сущности, убрать сложность | [reference/distill.md](reference/distill.md) |
| `harden [target]` | Refine | Production-ready: errors, i18n, edge cases | [reference/harden.md](reference/harden.md) |
| `onboard [target]` | Refine | Спроектировать first-run flows, empty states, activation | [reference/onboard.md](reference/onboard.md) |
| `animate [target]` | Enhance | Добавить purposeful animations и motion | [reference/animate.md](reference/animate.md) |
| `colorize [target]` | Enhance | Добавить strategic color к monochromatic UIs | [reference/colorize.md](reference/colorize.md) |
| `typeset [target]` | Enhance | Улучшить typography hierarchy и fonts | [reference/typeset.md](reference/typeset.md) |
| `layout [target]` | Enhance | Исправить spacing, rhythm и visual hierarchy | [reference/layout.md](reference/layout.md) |
| `delight [target]` | Enhance | Добавить personality и memorable touches | [reference/delight.md](reference/delight.md) |
| `overdrive [target]` | Enhance | Выйти за conventional limits | [reference/overdrive.md](reference/overdrive.md) |
| `clarify [target]` | Fix | Улучшить UX copy, labels и error messages | [reference/clarify.md](reference/clarify.md) |
| `adapt [target]` | Fix | Адаптировать под разные devices и screen sizes | [reference/adapt.md](reference/adapt.md) |
| `optimize [target]` | Fix | Диагностировать и исправить UI performance | [reference/optimize.md](reference/optimize.md) |
| `live` | Iterate | Visual variant mode: выбирать элементы в browser, генерировать alternatives | [reference/live.md](reference/live.md) |

Плюс две management commands: `pin <command>` и `unpin <command>`, detailed ниже.

### Правила маршрутизации

1. **Нет аргумента**: отрендерите таблицу выше как user-facing command menu, сгруппированную по category. Спросите, что они хотят сделать.
2. **Первое слово matches команду**: загрузите её reference file и следуйте инструкциям. Всё после имени команды — target.
3. **Первое слово не matches**: general design invocation. Примените setup steps, shared design laws и загруженный register reference, используя полный аргумент как context.

Setup (сбор контекста, register) к этому моменту уже загружен; sub-commands не перевызывают `$impeccable`.

Если первое слово — `craft`, setup всё равно запускается первым, но [reference/craft.md](reference/craft.md) владеет остальным потоком. Если setup вызывает `teach` как blocker — завершите teach, обновите контекст, затем возобновите исходную команду и target.

## Закрепить / открепить (pin / unpin)

**Pin** создаёт standalone shortcut, чтобы `$<command>` вызывал `$impeccable <command>` напрямую. **Unpin** удаляет его. Script пишет во все harness directories, присутствующие в проекте.

```bash
node .agents/skills/impeccable/scripts/pin.mjs <pin|unpin> <command>
```

Valid `<command>` — любая команда из таблицы выше. Репортите результат script кратко. Подтвердите новый shortcut при success, передайте stderr verbatim при error.

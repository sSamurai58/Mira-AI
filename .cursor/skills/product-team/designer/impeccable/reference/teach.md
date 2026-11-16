# Поток teach

Собирает design context проекта и пишет два взаимодополняющих файла в корне проекта:

- **PRODUCT.md** (strategic): корневой файл проекта для register, целевых пользователей, product purpose, brand personality, anti-references, стратегических design principles. Отвечает на «who/what/why».
- **DESIGN.md** (visual): корневой файл проекта для visual theme, color palette, typography, components, layout. Следует [формату Google Stitch DESIGN.md](https://stitch.withgoogle.com/docs/design-md/format/). Отвечает на «how it looks».

Каждая другая команда impeccable читает эти файлы перед любой работой.

## Шаг 1: загрузите текущее состояние

Сначала запустите shared loader, чтобы знать, что уже есть:

```bash
node .agents/skills/impeccable/scripts/load-context.mjs
```

Output говорит, существуют ли уже PRODUCT.md и/или DESIGN.md. Если `migrated: true`, legacy `.impeccable.md` был автоматически переименован в `PRODUCT.md`. Упомяните это пользователю один раз.

Decision tree:
- **Ни одного файла нет (пустой проект или ещё нет контекста)**: сделайте Steps 2–4 (напишите PRODUCT.md), затем решите по DESIGN.md в зависимости от того, есть ли код для анализа.
- **PRODUCT.md есть, DESIGN.md нет**: перейдите к Step 5 и предложите запустить `$impeccable document` для DESIGN.md.
- **PRODUCT.md есть, но без секции `## Register` (legacy)**: добавьте её. Выведите гипотезу из кодовой базы (см. Step 2), подтвердите с пользователем, запишите поле.
- **Оба есть**: ОСТАНОВИТЕСЬ и используйте structured user-input/question tool Codex, когда доступен; если недоступен — спросите прямо в чате, чтобы прояснить то, что нельзя вывести. Спросите, какой файл обновить. Пропустите тот, который пользователь не хочет менять.
- **Есть только DESIGN.md (unusual)**: сделайте Steps 2–4, чтобы получить PRODUCT.md.

Никогда не перезаписывайте существующий файл молча. Всегда подтверждайте сначала.

Если teach вызван как setup blocker другой командой, например `$impeccable craft landing page`, поставьте ту команду на паузу здесь. Завершите teach, перезапустите loader, затем возобновите исходную команду со свежезагруженным контекстом. Для craft возобновляйте дальше в shape; teach создаёт project context, но не заменяет task-specific shape interview и подтверждённый design brief.

## Шаг 2: исследуйте кодовую базу

Перед вопросами тщательно просканируйте проект, чтобы обнаружить, что можете:

- **README и docs**: purpose проекта, целевая аудитория, заявленные цели
- **Package.json / config files**: tech stack, зависимости, существующие design libraries
- **Existing components**: текущие design patterns, spacing, typography в использовании
- **Brand assets**: логотипы, favicons, уже определённые color values
- **Design tokens / CSS variables**: существующие color palettes, font stacks, spacing scales
- **Любые style guides или brand documentation**

Также сформируйте **register hypothesis** из найденного:

- Brand signals: `/`, `/about`, `/pricing`, `/blog/*`, `/docs/*`, hero sections, крупная typography, scroll-driven sections, landing-page-shaped content.
- Product signals: `/app/*`, `/dashboard`, `/settings`, `/(auth)`, forms, data tables, side/top nav, app-shell components.

Register на этом этапе — гипотеза, не решение; Step 3 подтверждает её.

Зафиксируйте, что узнали и что остаётся неясным. Это исследование питает и PRODUCT.md, и DESIGN.md.

## Step 3: Ask strategic questions (для PRODUCT.md)

ОСТАНОВИТЕСЬ и используйте structured user-input/question tool Codex, когда доступен; если недоступен — спросите прямо в чате, чтобы прояснить то, что нельзя вывести. Спрашивайте только о том, что не удалось вывести из кодовой базы.

### Interview mode, не confirmation mode

Если репозиторий пуст или brief пользователя sparse, проведите короткое интервью до предложения PRODUCT.md. **Не** превращайте одно предложение запроса в полностью выведенный PRODUCT.md и не просите blanket confirmation.

- Используйте structured question tool harness, когда он есть. Иначе спросите прямо в чате и остановитесь.
- Задавайте **2–3 вопроса за раунд**, затем ждите ответов.
- Используйте выведенные ответы как гипотезы или опции, не как готовые факты.
- Завершите как минимум один реальный раунд ответа пользователя до черновика PRODUCT.md, если каждый required ответ не discoverable напрямую из docs репозитория.
- Round 1 должен установить register, users/purpose и desired outcome.
- Round 2 должен установить brand personality или references, anti-references и accessibility needs.

### Минимально жизнеспособное интервью

Спросите достаточно, чтобы завершить PRODUCT.md. Как минимум: подтверждение register, users и purpose, brand personality, anti-references и accessibility needs — если каждый ответ не discoverable напрямую из контекста репозитория. После как минимум одного раунда интервью можете предложить выведенные ответы, но пользователь должен подтвердить их до записи PRODUCT.md. Никогда не синтезируйте PRODUCT.md только из исходного task prompt.

### Register (спрашивайте первым; это формирует всё ниже)

Каждая дизайн-задача — либо **brand** (marketing, landing, campaign, long-form content, portfolio: дизайн И ЕСТЬ продукт), либо **product** (app UI, admin, dashboards, tools: дизайн СЛУЖИТ продукту).

Если Step 2 дал ясную гипотезу, начните с неё: *«From the codebase, this looks like a [brand / product] surface. Does that match your intent, or should we treat it differently?»*

Если сигнал genuinely split (например product с большим marketing landing), ОСТАНОВИТЕСЬ и используйте structured user-input/question tool Codex, когда доступен; если недоступен — спросите прямо в чате, чтобы прояснить то, что нельзя вывести. Спросите, какой register описывает **primary** поверхность. Register можно переопределить per task позже, но PRODUCT.md несёт один default.

### Пользователи и цель
- Кто это использует? В каком контексте?
- Какую работу они пытаются сделать?
- Для brand: какие эмоции должен вызывать интерфейс? (confidence, delight, calm, urgency)
- Для product: в каком workflow они? Какова primary task на данном экране?

### Бренд и характер
- Как бы вы описали brand personality в 3 словах?
- Reference sites или apps, которые передают нужное ощущение? Что конкретно в них?
  - Для brand тяните к real-world references в нужной lane (tech-minimal, editorial-magazine, consumer-warm, brutalist-grid и т.д.), не к generic «modern» прилагательным.
  - Для product тяните к category best-tool references (Linear, Figma, Notion, Raycast, Stripe).
- Чем это явно НЕ должно выглядеть? Есть anti-references?

### Доступность и инклюзия
- Конкретные требования accessibility? (WCAG level, известные user needs)
- Соображения по reduced motion, color blindness или другим accommodations?

Пропускайте вопросы, где ответ уже ясен. **НЕ спрашивайте здесь про colors, fonts, radii или visual styling.** Это принадлежит DESIGN.md, не PRODUCT.md.

## Шаг 4: напишите PRODUCT.md

Пишите PRODUCT.md только после того, как пользователь подтвердил стратегические ответы из Step 3. Если выведенный ответ неуверен или неподтверждён — спросите до записи.

Синтезируйте в стратегический документ:

```markdown
# Product

## Регистр

product

## Users
[Who they are, their context, the job to be done]

## Product Purpose
[What this product does, why it exists, what success looks like]

## Brand Personality
[Voice, tone, 3-word personality, emotional goals]

## Anti-references
[What this should NOT look like. Specific bad-example sites or patterns to avoid.]

## Design Principles
[3-5 strategic principles derived from the conversation. Principles like "practice what you preach", "show, don't tell", "expert confidence". NOT visual rules like "use OKLCH" or "magenta accent".]

## Accessibility & Inclusion
[WCAG level, known user needs, considerations]
```

Register — либо `brand`, либо `product` как голое значение. Без prose, без commentary.

Пишите в `PROJECT_ROOT/PRODUCT.md`. Если существовал `.impeccable.md`, loader уже переименовал его; мержите в этот контент, а не начинайте с нуля.

## Шаг 5: решите по DESIGN.md

Предложите `$impeccable document` в любом случае. Два пути:

- **Код есть** (CSS tokens, components, работающий сайт): «I can generate a DESIGN.md that captures your visual system (colors, typography, components) so variants stay on-brand. Want to do that now?»
- **Pre-implementation** (пустой проект): «I can seed a starter DESIGN.md from five quick questions about color strategy, type direction, motion energy, and references. You can re-run once there's code, to capture the real tokens. Want to do that now?»

Если пользователь согласен, делегируйте `$impeccable document` (он auto-detects scan vs seed). Загрузите его reference и следуйте тому flow.

Если предпочитает пропустить, упомяните, что можно запустить `$impeccable document` позже в любое время.

## Шаг 6: подтвердите и завершите

Резюмируйте:
- Зафиксированный register (brand / product)
- Что написано (PRODUCT.md, DESIGN.md, или оба)
- 3–5 стратегических principles из PRODUCT.md, которые будут вести будущую работу
- Если DESIGN.md pending — напомните, как сгенерировать позже

**Критично: перезапустите loader, чтобы обновить session context.** После записи PRODUCT.md запустите `node .agents/skills/impeccable/scripts/load-context.mjs` ещё раз и дайте полному JSON output попасть в разговор. Это гарантирует, что последующие команды в сессии используют свежезаписанный PRODUCT.md, а не устаревшую раннюю версию.

Если teach вызван как blocker другой командой impeccable (например пользователь запустил `$impeccable polish` без PRODUCT.md), возобновите исходную задачу сейчас со свежим контекстом.

Опционально ОСТАНОВИТЕСЬ и используйте structured user-input/question tool Codex, когда доступен; если недоступен — спросите прямо в чате, чтобы прояснить то, что нельзя вывести. Спросите, хотят ли краткое резюме PRODUCT.md в AGENTS.md для удобной agent reference. Если да, добавьте туда короткий указатель **Design Context**.

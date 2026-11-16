> **Нужен дополнительный контекст**: существующие brand colors.

Замените робкие grayscale или single-accent дизайны стратегической палитрой: выберите color strategy, выберите hue family, подходящую бренду, затем применяйте цвет с намерением. Больше цвета ≠ лучше. Strategic color бьёт rainbow vomit.

---

## Регистр

Brand: палитра И ЕСТЬ voice. Сначала выберите color strategy по SKILL.md (Restrained / Committed / Full palette / Drenched) и следуйте её dosage. Committed, Full palette и Drenched намеренно превышают правило ≤10%; это правило только для Restrained. Неожиданные комбинации разрешены; dominant color может владеть страницей, когда выбранная стратегия этого требует.

Product: semantic-first и почти всегда Restrained. Accent color зарезервирован для primary action, current selection и state indicators. Не decoration. Каждый цвет имеет consistent meaning на каждом экране.

---

## Оцените возможность цвета

Проанализируйте текущее состояние и найдите возможности:

1. **Поймите текущее состояние**:
   - **Отсутствие цвета**: Pure grayscale? Limited neutrals? Один робкий accent?
   - **Упущенные возможности**: Где цвет мог бы добавить meaning, hierarchy или delight?
   - **Контекст**: Что уместно для этого domain и аудитории?
   - **Бренд**: Есть ли существующие brand colors, которые следует использовать?

2. **Определите, где цвет добавляет ценность**:
   - **Semantic meaning**: Success (green), error (red), warning (yellow/orange), info (blue)
   - **Hierarchy**: Привлечение внимания к важным элементам
   - **Categorization**: Разные секции, типы или состояния
   - **Emotional tone**: Warmth, energy, trust, creativity
   - **Wayfinding**: Помощь пользователям навигировать и понимать структуру
   - **Delight**: Моменты визуального интереса и personality

Если что-то из этого неясно из codebase, ОСТАНОВИТЕСЬ и используйте структурированный инструмент вопросов Codex, когда он доступен; если недоступен, спросите напрямую в чате, чтобы уточнить то, что нельзя вывести.

**КРИТИЧНО**: Больше цвета ≠ лучше. Strategic color бьёт rainbow vomit каждый раз. У каждого цвета должна быть цель.

## Спланируйте Color Strategy

Создайте purposeful план введения цвета:

- **Color palette**: Какие цвета соответствуют brand/context? (Выберите максимум 2–4 цвета beyond neutrals)
- **Dominant color**: Какой цвет владеет 60% colored elements?
- **Accent colors**: Какие цвета дают contrast и highlights? (30% и 10%)
- **Application strategy**: Где появляется каждый цвет и почему?

**ВАЖНО**: Цвет должен усиливать иерархию и meaning, а не создавать chaos. Less is more, когда это matters more.

## Вводите цвет стратегически

Добавляйте цвет системно по этим измерениям:

### Семантический цвет
- **State indicators**:
  - Success: Green tones (emerald, forest, mint)
  - Error: Red/pink tones (rose, crimson, coral)
  - Warning: Orange/amber tones
  - Info: Blue tones (sky, ocean, indigo)
  - Neutral: Gray/slate для inactive states

- **Status badges**: Colored backgrounds или borders для states (active, pending, completed и т.д.)
- **Progress indicators**: Colored bars, rings или charts, показывающие completion или health

### Применение Accent Color
- **Primary actions**: Окрашивайте самые важные buttons/CTAs
- **Links**: Добавляйте цвет к clickable text (maintain accessibility)
- **Icons**: Colorize key icons для recognition и personality
- **Headers/titles**: Добавляйте цвет к section headers или key labels
- **Hover states**: Вводите цвет при interaction

### Фон и поверхности
- **Tinted backgrounds**: Замените pure gray (`#f5f5f5`) тёплыми нейтралами (`oklch(97% 0.01 60)`) или cool tints (`oklch(97% 0.01 250)`)
- **Colored sections**: Используйте subtle background colors для разделения областей
- **Gradient backgrounds**: Добавляйте depth subtle, intentional gradients (не generic purple-blue)
- **Cards & surfaces**: Чуть тонируйте cards или surfaces для warmth

**Используйте OKLCH для цвета**: Он perceptually uniform — равные шаги lightness *выглядят* равными. Отлично для генерации гармоничных scales.

### Визуализация данных
- **Charts & graphs**: Используйте цвет для encoding categories или values
- **Heatmaps**: Color intensity показывает density или importance
- **Comparison**: Color coding для разных datasets или timeframes

### Границы и акценты
- **Hairline borders**: 1px colored borders по полному периметру (не side-stripes; см. absolute ban на `border-left/right > 1px`)
- **Underlines**: Color underlines для emphasis или active states
- **Dividers**: Subtle colored dividers вместо gray lines
- **Focus rings**: Colored focus indicators matching brand
- **Surface tints**: 4–8% background wash accent color вместо stripe

**НИКОГДА**: `border-left` или `border-right` greater than 1px как colored accent stripe. Это один из трёх absolute bans в родительском skill. Если хотите пометить card как «active» или «warning», используйте full hairline border, background tint, leading glyph или numbered prefix. Не side stripe.

### Типографика Color
- **Colored headings**: Используйте brand colors для section headings (maintain contrast)
- **Highlight text**: Цвет для emphasis или categories
- **Labels & tags**: Small colored labels для metadata или categories

### Декоративные элементы
- **Illustrations**: Добавляйте colored illustrations или icons
- **Shapes**: Geometric shapes в brand colors как background elements
- **Gradients**: Colorful gradient overlays или mesh backgrounds
- **Blobs/organic shapes**: Soft colored shapes для visual interest

## Баланс и уточнение

Убедитесь, что добавление цвета улучшает, а не overwhelms:

### Сохраняйте иерархию
- **Dominant color** (60%): Primary brand color или most used accent
- **Secondary color** (30%): Supporting color для variety
- **Accent color** (10%): High contrast для key moments
- **Neutrals** (остальное): Gray/black/white для structure

### Доступность
- **Contrast ratios**: Обеспечьте WCAG compliance (4.5:1 для text, 3:1 для UI components)
- **Не полагайтесь только на цвет**: Используйте icons, labels или patterns alongside color
- **Тестируйте на color blindness**: Проверьте, что red/green combinations работают для всех пользователей

### Целостность
- **Consistent palette**: Используйте цвета из определённой палитры, не arbitrary choices
- **Systematic application**: Одинаковые значения цветов throughout (green always = success)
- **Temperature consistency**: Warm palette остаётся warm, cool остаётся cool

**НИКОГДА**:
- Не используйте каждый цвет радуги (выберите 2–4 цвета beyond neutrals)
- Не применяйте цвет randomly без semantic meaning
- Не ставьте gray text на colored backgrounds. Выглядит washed out; используйте darker shade цвета фона или transparency
- Не используйте pure gray для neutrals. Добавьте subtle color tint (warm или cool) для depth
- Не используйте pure black (`#000`) или pure white (`#fff`) для больших областей
- Не нарушайте WCAG contrast requirements
- Не используйте цвет как единственный indicator (accessibility issue)
- Не делайте всё colorful (defeats the purpose)
- Не дефолтьте к purple-blue gradients (AI slop aesthetic)

## Проверьте добавление цвета

Протестируйте, что colorization улучшает опыт:

- **Better hierarchy**: Цвет направляет внимание appropriately?
- **Clearer meaning**: Цвет помогает понимать states/categories?
- **More engaging**: Интерфейс ощущается warmer и more inviting?
- **Still accessible**: Все color combinations соответствуют WCAG?
- **Not overwhelming**: Цвет balanced и purposeful?

Когда палитра заслуживает своё место, передайте `$impeccable polish` для финального прохода.

## Сигнатурные параметры live-mode

Когда вызван из live mode, каждый variant MUST declare `color-amount` param, чтобы пользователь мог dial между restrained accent и drenched surface без regeneration. Author CSS варианта против `var(--p-color-amount, 0.5)`, обычно как alpha multiplier на backgrounds или как scaling factor на chroma axis в OKLCH expression. 0 = neutral/monochrome, 1 = full saturation / dominant coverage.

```json
{"id":"color-amount","kind":"range","min":0,"max":1,"step":0.05,"default":0.5,"label":"Color amount"}
```

Layer 1–2 variant-specific params сверху: palette selection (`steps` с named options), temperature warmth или tint vs. true color. См. `reference/live.md` для полного params contract.

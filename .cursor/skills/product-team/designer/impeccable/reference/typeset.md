Typography несёт большую часть информации на странице. Замените generic defaults (Inter, Roboto, system fallback на плоской шкале) на type, отражающий бренд и масштабирующийся с намеренным контрастом.

---

## Регистр

Brand: выполните процедуру выбора шрифта в [brand.md](brand.md). Pairing следует lane бренда (display serif + sans body для editorial/luxury, один committed sans для tech и т.д.). Fluid `clamp()` scale, соотношение ≥1.25 между ступенями.

Product: system fonts и знакомые sans stacks здесь легитимны. Одна хорошо настроенная семья обычно несёт весь UI. Фиксированная `rem` scale, соотношение 1.125–1.2 между более плотными ступенями.

---

## Оцените текущую типографику

Проанализируйте, что слабо или generic в текущем type:

1. **Font choices**:
   - Используем ли невидимые defaults? (Inter, Roboto, Arial, Open Sans, system defaults)
   - Соответствует ли шрифт brand personality? (Игривый бренд не должен использовать corporate typeface)
   - Слишком много font families? (Больше 2–3 почти всегда беспорядок)

2. **Hierarchy**:
   - Сразу ли отличимы headings от body от captions?
   - Размеры шрифта слишком близки? (14px, 15px, 16px = muddy hierarchy)
   - Достаточно ли сильные weight contrasts? (Medium vs Regular почти незаметны)

3. **Sizing & scale**:
   - Есть ли согласованная type scale, или размеры произвольные?
   - Достигает ли body text минимума читаемости? (16px+)
   - Подходит ли стратегия sizing контексту? (Фиксированные `rem` scales для app UIs; fluid `clamp()` для заголовков marketing/content страниц)

4. **Readability**:
   - Комфортны ли длины строк? (идеал 45–75 символов)
   - Подходящий ли line-height для шрифта и контекста?
   - Достаточно ли контраста между текстом и фоном?

5. **Consistency**:
   - Одинаковые элементы стилизованы одинаково повсюду?
   - Font weights используются согласованно? (Не bold в одной секции, semibold в другой для той же роли)
   - Letter-spacing намеренный или default везде?

**КРИТИЧНО**: цель — не сделать текст «fancier». Цель — сделать его яснее, читаемее и более намеренным. Хорошая typography невидима; плохая — отвлекает.

## Спланируйте улучшения типографики

Обратитесь к [typography reference](typography.md) за детальным guidance по scales, pairing и стратегиям loading.

Создайте системный план:

- **Font selection**: нужно ли заменить шрифты? Что подходит бренду/контексту?
- **Type scale**: установите modular scale (например соотношение 1.25) с ясной иерархией
- **Weight strategy**: какие веса для каких ролей? (Regular для body, Semibold для labels, Bold для headings — или что подходит)
- **Spacing**: line-heights, letter-spacing и margins между типографическими элементами

## Улучшайте типографику системно

### Выбор шрифтов

Если шрифты нужно заменить:
- Выбирайте шрифты, отражающие brand personality
- Pair с настоящим контрастом (serif + sans, geometric + humanist), или используйте одну семью в нескольких весах
- Обеспечьте, чтобы web font loading не вызывал layout shift (`font-display: swap`, metric-matched fallbacks)

### Выстройте иерархию

Постройте ясную type scale:
- **5 размеров покрывают большинство нужд**: caption, secondary, body, subheading, heading
- **Используйте согласованное соотношение** между уровнями (1.25, 1.333 или 1.5)
- **Комбинируйте измерения**: Size + weight + color + space для сильной иерархии. Не опирайтесь только на размер
- **App UIs**: используйте фиксированную `rem`-based type scale, опционально скорректированную на 1–2 breakpoints. Fluid sizing подрывает spatial predictability, нужную dense container-based layouts
- **Marketing / content pages**: используйте fluid sizing через `clamp(min, preferred, max)` для headings и display text. Body text оставляйте фиксированным

### Исправьте читаемость

- Задавайте `max-width` на текстовых контейнерах в единицах `ch` (`max-width: 65ch`)
- Корректируйте line-height по контексту: плотнее для headings (1.1–1.2), свободнее для body (1.5–1.7)
- Чуть увеличьте line-height для light-on-dark текста
- Обеспечьте body text минимум 16px / 1rem

### Уточните детали

- Используйте `tabular-nums` для data tables и чисел, которые должны выравниваться
- Применяйте правильный `letter-spacing`: чуть открытый для small caps и uppercase, default или tight для крупного display text
- Используйте семантические имена токенов (`--text-body`, `--text-heading`), не value names (`--font-16`)
- Задайте `font-kerning: normal` и рассмотрите OpenType features где уместно

### Согласованность начертаний

- Определите ясные роли для каждого веса и придерживайтесь их
- Не используйте больше 3–4 весов (Regular, Medium, Semibold, Bold достаточно)
- Загружайте только реально используемые веса (каждый вес добавляет к page load)

**НИКОГДА**:
- Не используйте больше 2–3 font families
- Не выбирайте размеры произвольно; зафиксируйте scale
- Не ставьте body text ниже 16px
- Не используйте decorative/display fonts для body text
- Не отключайте browser zoom (`user-scalable=no`)
- Не используйте `px` для размеров шрифта; используйте `rem`, чтобы уважать настройки пользователя
- Не default на Inter/Roboto/Open Sans, когда personality важна
- Не pair шрифты, похожие, но не идентичные (два geometric sans-serifs)

## Проверьте улучшения типографики

- **Hierarchy**: мгновенно отличите heading vs body vs caption?
- **Readability**: комфортно ли читать body text длинными пассажами?
- **Consistency**: элементы одной роли стилизованы идентично повсюду?
- **Personality**: отражает ли typography бренд?
- **Performance**: web fonts грузятся эффективно без layout shift?
- **Accessibility**: соответствует ли текст WCAG contrast ratios? Масштабируется ли до 200%?

Когда type сам несёт иерархию — передайте `$impeccable polish` для финального прохода.

## Сигнатурные параметры live-mode

Каждый variant ОБЯЗАН объявить param `scale`, управляющий hierarchy ratio. Выражайте все размеры шрифта в scoped CSS variant через `calc(var(--p-scale, 1) * <base>)` или, лучше, масштабируйте type ramp через `clamp(min, calc(var(--p-scale, 1) * Npx), max)`. Пользователи двигают слайдер от subdued к commanding.

```json
{"id":"scale","kind":"range","min":0.85,"max":1.3,"step":0.05,"default":1,"label":"Scale"}
```

Где variant обыгрывает конкретный pairing, экспонируйте выбор pairing как param `steps` (например «serif display + sans body» vs. «mono display + sans body» vs. «all-sans»). Каждая ветка идёт через селекторы `:scope[data-p-pairing="X"]` в scoped CSS.

См. `reference/live.md` для полного контракта params.

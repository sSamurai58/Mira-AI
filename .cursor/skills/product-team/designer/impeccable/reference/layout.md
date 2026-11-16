Пространство — самый недоиспользованный дизайн-инструмент. Найдите реальную проблему layout (monotone spacing, слабая иерархия, identical card grids, centered-stack default) и исправьте структуру, а не поверхность.

---

## Регистр

Brand: асимметричные композиции, fluid spacing с `clamp()`, intentional grid-breaking для emphasis. Ритм через контраст: tight groupings paired с generous separations.

Product: предсказуемые grids, consistent densities, знакомые navigation patterns. Responsive behavior структурный (collapse sidebar, responsive table), а не fluid typography. Consistency И ЕСТЬ affordance.

---

## Оцените текущий Layout

Проанализируйте, что слабо в текущем spatial design:

1. **Spacing**:
   - Spacing consistent или arbitrary? (Random padding/margin values)
   - Весь spacing одинаковый? (Equal padding everywhere = нет ритма)
   - Связанные элементы сгруппированы tightly, с generous space между группами?

2. **Визуальная иерархия**:
   - Примените squint test: размойте (метафорически) глаза. Всё ещё можете определить самый важный элемент, второй по важности и ясные группировки?
   - Иерархия достигнута эффективно? (Space и weight сами по себе могут быть достаточны; работает ли текущий подход?)
   - Направляет ли whitespace глаз к важному?

3. **Grid & structure**:
   - Есть ясная underlying structure, или layout ощущается random?
   - Identical card grids используются везде? (Icon + heading + text, repeated endlessly)
   - Всё centered? (Left-aligned с асимметричными layouts ощущается более designed, но это не hard and fast rule)

4. **Rhythm & variety**:
   - Есть у layout визуальный ритм? (Alternating tight/generous spacing)
   - Каждая секция структурирована одинаково? (Monotonous repetition)
   - Есть intentional моменты surprise или emphasis?

5. **Density**:
   - Layout слишком cramped? (Недостаточно breathing room)
   - Layout слишком sparse? (Excessive whitespace без цели)
   - Density соответствует типу контента? (Data-dense UIs нуждаются в tighter spacing; marketing pages нуждаются в большем air)

**КРИТИЧНО**: Проблемы layout часто — root cause ощущения, что интерфейсы «off», даже когда цвета и шрифты в порядке. Пространство — design material; используйте его с намерением.

## Спланируйте улучшения Layout

Обратитесь к [spatial design reference](spatial-design.md) за detailed guidance по grids, rhythm и container queries.

Создайте системный план:

- **Spacing system**: Используйте consistent scale (встроенная scale framework вроде Tailwind, rem-based tokens или custom system). Конкретные значения важны меньше consistency.
- **Hierarchy strategy**: Как пространство будет сообщать importance?
- **Layout approach**: Какая структура подходит контенту? Flex для 1D, Grid для 2D, named areas для сложных page layouts.
- **Rhythm**: Где spacing должен быть tight vs generous?

## Улучшайте Layout системно

### Установите Spacing System

- Используйте consistent spacing scale (framework scales вроде Tailwind, rem-based tokens или custom scale — все работают). Важно, чтобы значения шли из определённого набора, а не произвольных чисел.
- Называйте tokens семантически при custom properties: `--space-xs` through `--space-xl`, не `--spacing-8`
- Используйте `gap` для sibling spacing вместо margins; устраняет margin collapse hacks
- Применяйте `clamp()` для fluid spacing, который дышит на больших экранах

### Создайте визуальный ритм

- **Tight grouping** для связанных элементов (8–12px между siblings)
- **Generous separation** между distinct sections (48–96px)
- **Varied spacing** внутри секций (не каждому row нужен одинаковый gap)
- **Асимметричные композиции**: ломайте предсказуемый centered-content pattern, когда это имеет смысл

### Выберите правильный Layout Tool

- **Используйте Flexbox для 1D layouts**: Rows of items, nav bars, button groups, card contents, большинство component internals. Flex проще и уместнее для большинства layout tasks.
- **Используйте Grid для 2D layouts**: Page-level structure, dashboards, data-dense interfaces, всё где rows И columns нуждаются в coordinated control.
- **Не дефолтьте к Grid**, когда Flexbox с `flex-wrap` был бы проще и гибче.
- Используйте `repeat(auto-fit, minmax(280px, 1fr))` для responsive grids без breakpoints.
- Используйте named grid areas (`grid-template-areas`) для сложных page layouts; переопределяйте на breakpoints.

### Сломайте монотонность Card Grid

- Не дефолтьте к card grids для всего; spacing и alignment создают визуальную группировку естественно
- Используйте cards только когда контент действительно distinct и actionable. Никогда не вкладывайте cards внутрь cards
- Варьируйте размеры cards, span columns или смешивайте cards с non-card контентом, чтобы сломать repetition

### Усильте визуальную иерархию

- Используйте наименьшее число измерений, нужных для ясной иерархии. Space само по себе может быть достаточным; generous whitespace вокруг элемента притягивает глаз. Некоторые из самых polished designs достигают ритма только через space и weight. Добавляйте color или size contrast только когда более простых средств недостаточно.
- Учитывайте reading flow: в LTR языках глаз naturally scans top-left to bottom-right, но placement primary action зависит от контекста (например bottom-right в dialogs, top в navigation).
- Создавайте ясные content groupings через proximity и separation.

### Управляйте Depth & Elevation

- Создайте semantic z-index scale (dropdown → sticky → modal-backdrop → modal → toast → tooltip)
- Постройте consistent shadow scale (sm → md → lg → xl); shadows должны быть subtle
- Используйте elevation для усиления иерархии, а не как decoration

### Оптические корректировки

- Если icon выглядит visually off-center несмотря на геометрический центр — сдвиньте. Но только если уверены, что действительно выглядит неправильно. Не adjust'ьте speculative.

**НИКОГДА**:
- Не используйте arbitrary spacing values вне вашей scale
- Не делайте весь spacing equal (variety создаёт иерархию)
- Не оборачивайте всё в cards (не всему нужен container)
- Не вкладывайте cards внутрь cards (используйте spacing и dividers для иерархии внутри)
- Не используйте identical card grids везде (icon + heading + text, repeated)
- Не центрируйте всё (left-aligned с asymmetry ощущается более designed)
- Не дефолтьте к hero metric layout (big number, small label, stats, gradient) как template. Если показываете real user data, prominent metric может работать, но должен показывать actual data, а не decorative numbers.
- Не дефолтьте к CSS Grid, когда Flexbox был бы проще; используйте simplest tool for the job
- Не используйте arbitrary z-index values (999, 9999); стройте semantic scale

## Проверьте улучшения Layout

- **Squint test**: Можете определить primary, secondary и groupings с blurred vision?
- **Rhythm**: Есть у страницы satisfying beat из tight и generous spacing?
- **Hierarchy**: Самый важный контент очевиден за 2 секунды?
- **Breathing room**: Layout ощущается comfortable, не cramped и не wasteful?
- **Consistency**: Spacing system применена равномерно?
- **Responsiveness**: Layout адаптируется gracefully across screen sizes?

Когда ритм и иерархия сели, передайте `$impeccable polish` для финального прохода.

## Сигнатурные параметры live-mode

Каждый variant MUST declare `density` param. Drive all spacing tokens в scoped CSS варианта через `calc(var(--p-density, 1) * <base>)`: paddings, gaps, column widths. Пользователи скользят от airy к packed и видят, как layout re-breathe без regeneration.

```json
{"id":"density","kind":"range","min":0.6,"max":1.4,"step":0.05,"default":1,"label":"Density"}
```

Для variants, чья топология genuinely меняется (stacked vs. side-by-side, grid vs. bento), используйте `steps` param, чей scoped CSS branches через `:scope[data-p-structure="X"]`. Один structure param + один density param — мощная combo; resist добавлять третий.

```json
{"id":"structure","kind":"steps","default":"grid","label":"Structure","options":[
  {"value":"stacked","label":"Stacked"},
  {"value":"grid","label":"Grid"},
  {"value":"bento","label":"Bento"}
]}
```

См. `reference/live.md` для полного params contract.

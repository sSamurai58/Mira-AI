# Пространственный дизайн

## Системы отступов

### Используйте базу 4pt, не 8pt

Системы 8pt слишком грубые; часто нужен 12px (между 8 и 16). Используйте 4pt для гранулярности: 4, 8, 12, 16, 24, 32, 48, 64, 96px.

### Именуйте токены семантически

Именуйте по отношению (`--space-sm`, `--space-lg`), не по значению (`--spacing-8`). Используйте `gap` вместо margins для spacing между siblings; это устраняет margin collapse и cleanup hacks.

## Системы сеток

### Самоподстраивающаяся сетка

Используйте `repeat(auto-fit, minmax(280px, 1fr))` для responsive grids без breakpoints. Колонки минимум 280px, столько, сколько помещается в ряд, остатки растягиваются. Для сложных layouts используйте named grid areas (`grid-template-areas`) и переопределяйте их на breakpoints.

## Визуальная иерархия

### Squint-тест

Размойте глаза (или сделайте screenshot и blur). Всё ещё можете определить:
- Самый важный элемент?
- Второй по важности?
- Ясные группировки?

Если в размытии всё одной тяжести — у вас проблема иерархии.

### Иерархия через несколько измерений

Не опирайтесь только на размер. Комбинируйте:

| Tool | Strong Hierarchy | Weak Hierarchy |
|------|------------------|----------------|
| **Size** | соотношение 3:1 или больше | соотношение <2:1 |
| **Weight** | Bold vs Regular | Medium vs Regular |
| **Color** | High contrast | Похожие тона |
| **Position** | Top/left (primary) | Bottom/right |
| **Space** | Окружено white space | Crowded |

**Лучшая иерархия использует 2–3 измерения сразу**: заголовок, который крупнее, жирнее И с большим пространством сверху.

### Cards не обязательны

Cards переиспользуют слишком часто. Spacing и alignment создают visual grouping естественно. Используйте cards только когда контент действительно distinct и actionable, элементам нужно визуальное сравнение в grid, или контенту нужны ясные границы взаимодействия. **Никогда не вкладывайте cards в cards.** Используйте spacing, typography и тонкие dividers для иерархии внутри card.

## Запросы контейнера (container queries)

Viewport queries — для page layouts. **Container queries — для компонентов**:

```css
.card-container {
  container-type: inline-size;
}

.card {
  display: grid;
  gap: var(--space-md);
}

/* Card layout changes based on its container, not viewport */
@container (min-width: 400px) {
  .card {
    grid-template-columns: 120px 1fr;
  }
}
```

**Почему это важно**: card в узком sidebar остаётся компактной, а та же card в main content area расширяется автоматически — без viewport hacks.

## Оптические корректировки

Текст при `margin-left: 0` выглядит с отступом из-за whitespace букв; используйте negative margin (`-0.05em`) для оптического выравнивания. Геометрически центрированные иконки часто выглядят off-center; play-иконкам нужен сдвиг вправо, стрелкам — в направлении.

### Touch targets vs визуальный размер

Кнопки могут выглядеть маленькими, но нуждаются в больших touch targets (минимум 44px). Используйте padding или pseudo-elements:

```css
.icon-button {
  width: 24px;  /* Visual size */
  height: 24px;
  position: relative;
}

.icon-button::before {
  content: '';
  position: absolute;
  inset: -10px;  /* Expand tap target to 44px */
}
```

## Глубина и elevation

Создавайте семантические z-index scales (dropdown → sticky → modal-backdrop → modal → toast → tooltip) вместо произвольных чисел. Для теней — согласованная elevation scale (sm → md → lg → xl). **Ключевой insight**: тени должны быть тонкими. Если её явно видно — вероятно, слишком сильная.

---

**Избегайте**: произвольных значений spacing вне вашей scale. Делать весь spacing одинаковым (variety создаёт иерархию). Создавать иерархию только через размер — комбинируйте size, weight, color и space.

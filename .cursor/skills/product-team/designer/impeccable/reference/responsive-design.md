# Адаптивный дизайн

## Mobile-First: пишите правильно

Начинайте с базовых стилей для mobile, наслаивайте сложность через `min-width` queries. Desktop-first (`max-width`) значит, что mobile сначала грузит ненужные стили.

## Breakpoints: от контента

Не гонитесь за размерами устройств; пусть контент скажет, где ломаться. Начните узко, растягивайте, пока дизайн не сломается, добавьте breakpoint там. Обычно хватает трёх breakpoints (640, 768, 1024px). Используйте `clamp()` для fluid-значений без breakpoints.

## Определяйте метод ввода, не только размер экрана

**Размер экрана не говорит о методе ввода.** Ноутбук с touchscreen, планшет с клавиатурой. Используйте pointer и hover queries:

```css
/* Fine pointer (mouse, trackpad) */
@media (pointer: fine) {
  .button { padding: 8px 16px; }
}

/* Coarse pointer (touch, stylus) */
@media (pointer: coarse) {
  .button { padding: 12px 20px; }  /* Larger touch target */
}

/* Device supports hover */
@media (hover: hover) {
  .card:hover { transform: translateY(-2px); }
}

/* Device doesn't support hover (touch) */
@media (hover: none) {
  .card { /* No hover state - use active instead */ }
}
```

**Критично**: не опирайтесь на hover для функциональности. Touch-пользователи не могут hover.

## Safe Areas: учтите notch

У современных телефонов notches, скруглённые углы и home indicators. Используйте `env()`:

```css
body {
  padding-top: env(safe-area-inset-top);
  padding-bottom: env(safe-area-inset-bottom);
  padding-left: env(safe-area-inset-left);
  padding-right: env(safe-area-inset-right);
}

/* With fallback */
.footer {
  padding-bottom: max(1rem, env(safe-area-inset-bottom));
}
```

**Включите viewport-fit** в meta tag:
```html
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
```

## Responsive Images: сделайте правильно

### srcset с Width Descriptors

```html
<img
  src="hero-800.jpg"
  srcset="
    hero-400.jpg 400w,
    hero-800.jpg 800w,
    hero-1200.jpg 1200w
  "
  sizes="(max-width: 768px) 100vw, 50vw"
  alt="Hero image"
>
```

**Как это работает**:
- `srcset` перечисляет доступные изображения с их фактическими ширинами (`w` descriptors)
- `sizes` говорит браузеру, какой ширины изображение будет отображаться
- Браузер выбирает лучший файл по ширине viewport И device pixel ratio

### Picture Element для Art Direction

Когда нужны разные кадры/композиции (не только разрешения):

```html
<picture>
  <source media="(min-width: 768px)" srcset="wide.jpg">
  <source media="(max-width: 767px)" srcset="tall.jpg">
  <img src="fallback.jpg" alt="...">
</picture>
```

## Паттерны адаптации layout

**Navigation**: три стадии: hamburger + drawer на mobile, горизонтальный compact на tablet, полный с labels на desktop. **Tables**: превращайте в cards на mobile через `display: block` и атрибуты `data-label`. **Progressive disclosure**: используйте `<details>/<summary>` для контента, который можно свернуть на mobile.

## Testing: не доверяйте только DevTools

Эмуляция устройств в DevTools полезна для layout, но пропускает:

- Реальные touch-взаимодействия
- Реальные ограничения CPU/memory
- Паттерны network latency
- Разницу в font rendering
- Появление browser chrome/keyboard

**Тестируйте как минимум**: один реальный iPhone, один реальный Android, планшет если релевантно. Дешёвые Android-телефоны вскрывают проблемы производительности, которых никогда не увидите на симуляторах.

---

**Избегайте**: desktop-first design. Device detection вместо feature detection. Отдельные codebases mobile/desktop. Игнорирование tablet и landscape. Предположение, что все mobile-устройства мощные.

# Типографика

## Классические принципы типографики

### Вертикальный ритм

Ваш line-height должен быть базовой единицей ВСЕХ вертикальных отступов. Если body text имеет `line-height: 1.5` на type `16px` (= 24px), значения spacing должны быть кратны 24px. Это создаёт подсознательную гармонию; текст и пространство делят математическую основу.

### Модульная шкала и иерархия

Частая ошибка: слишком много размеров шрифта, слишком близких друг к другу (14px, 15px, 16px, 18px...). Это создаёт muddy hierarchy.

**Используйте меньше размеров с большим контрастом.** Система из 5 размеров покрывает большинство нужд:

| Role | Typical Ratio | Use Case |
|------|---------------|----------|
| xs | 0.75rem | Captions, legal |
| sm | 0.875rem | Secondary UI, metadata |
| base | 1rem | Body text |
| lg | 1.25-1.5rem | Subheadings, lead text |
| xl+ | 2-4rem | Headlines, hero text |

Популярные соотношения: 1.25 (major third), 1.333 (perfect fourth), 1.5 (perfect fifth). Выберите одно и придерживайтесь.

### Читаемость и мера строки

Используйте единицы `ch` для character-based measure (`max-width: 65ch`). Line-height масштабируется обратно длине строки: узким колонкам нужен tighter leading, широким — больше.

**Неочевидно**: светлый текст на тёмном фоне нуждается в компенсации по трём осям, не по одной. Поднимите line-height на 0.05–0.1, добавьте чуть letter-spacing (0.01–0.02em) и опционально поднимите body weight на одну ступень (regular → medium). Воспринимаемый вес падает по всем трём; чините все три.

**Paragraph rhythm**: выбирайте либо space между абзацами, ЛИБО first-line indentation. Никогда оба. Digital обычно хочет space; editorial/long-form может оправдать только indent.

## Выбор и сочетание шрифтов

Тактическая процедура выбора и reflex-reject list живут в [reference/brand.md](brand.md) в секциях **Font selection procedure** и **Reflex-reject list** (загружаются для brand-register задач). Остальная часть этой секции покрывает смежные знания: anti-reflex corrections, использование system fonts и правила pairing.

### Anti-reflexes, от которых стоит защищаться

- Technical/utilitarian brief НЕ нуждается в serif «for warmth». Большинство tech tools должны выглядеть как tech tools.
- Editorial/premium brief НЕ нуждается в том же expressive serif, который все используют прямо сейчас. Premium может быть Swiss-modern, neo-grotesque, буквальным monospace, тихим humanist sans.
- Детский продукт НЕ нуждается в rounded display font. Книги для детей используют настоящий type.
- «Modern» brief НЕ нуждается в geometric sans. Самое modern — не использовать шрифт, который используют все остальные.

**System fonts недооценены**: `-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui` выглядит native, грузится мгновенно и очень читаем. Рассмотрите для apps, где performance > personality.

### Принципы сочетания

**Неочевидная правда**: часто второй шрифт не нужен. Одна хорошо выбранная font family в нескольких весах создаёт более чистую иерархию, чем два конкурирующих typefaces. Добавляйте второй шрифт только когда нужен настоящий контраст (например display headlines + body serif).

При pairing контрастируйте по нескольким осям:
- Serif + Sans (structure contrast)
- Geometric + Humanist (personality contrast)
- Condensed display + Wide body (proportion contrast)

**Никогда не pair шрифты, похожие, но не идентичные** (например два geometric sans-serifs). Они создают visual tension без ясной иерархии.

### Загрузка веб-шрифтов

Проблема layout shift: шрифты грузятся поздно, текст перетекает, пользователи видят прыжок контента. Вот фикс:

```css
/* 1. Use font-display: swap for visibility */
@font-face {
  font-family: 'CustomFont';
  src: url('font.woff2') format('woff2');
  font-display: swap;
}

/* 2. Match fallback metrics to minimize shift */
@font-face {
  font-family: 'CustomFont-Fallback';
  src: local('Arial');
  size-adjust: 105%;        /* Scale to match x-height */
  ascent-override: 90%;     /* Match ascender height */
  descent-override: 20%;    /* Match descender depth */
  line-gap-override: 10%;   /* Match line spacing */
}

body {
  font-family: 'CustomFont', 'CustomFont-Fallback', sans-serif;
}
```

Инструменты вроде [Fontaine](https://github.com/unjs/fontaine) считают эти overrides автоматически.

**`swap` vs `optional`**: `swap` сразу показывает fallback text и FOUT-swaps, когда web font прибывает. `optional` использует fallback, если web font промахивается мимо малого load budget (~100ms), и избегает shift целиком. Выбирайте `optional`, когда zero layout shift важнее branded font на медленных сетях.

**Preload только критичный вес**: обычно regular-weight body font выше fold. Preload каждого веса стоит больше bandwidth, чем экономит.

**Variable fonts для 3+ весов или стилей**: один файл variable font обычно меньше трёх static weight files, даёт fractional weight control и хорошо сочетается с `font-optical-sizing: auto`. Для 1–2 весов static достаточно.

## Современная веб-типографика

### Плавная типографика (fluid type)

Fluid typography через `clamp(min, preferred, max)` плавно масштабирует текст с viewport. Среднее значение (например `5vw + 1rem`) контролирует скорость масштабирования (выше vw = быстрее). Добавьте rem offset, чтобы не схлопывалось в 0 на маленьких экранах.

**Используйте fluid type для**: Headings и display text на marketing/content страницах, где текст доминирует в layout и должен дышать across viewport sizes.

**Используйте фиксированные `rem` scales для**: App UIs, dashboards и data-dense интерфейсов. Ни одна крупная app design system (Material, Polaris, Primer, Carbon) не использует fluid type в product UI; фиксированные scales с опциональными breakpoint adjustments дают spatial predictability, нужную container-based layouts. Body text тоже должен быть фиксированным даже на marketing pages, потому что разница размеров across viewports слишком мала, чтобы оправдать fluid.

**Ограничивайте clamp()**: держите `max-size ≤ ~2.5 × min-size`. Более широкие соотношения ломают zoom и reflow браузера и заставляют крупные viewports ощущаться так, будто страница кричит.

**Масштабируйте container width и font-size вместе**, чтобы effective character measure оставался в диапазоне 45–75ch на каждом viewport. Заголовок, который расширяется быстрее контейнера, уходит из комфортного measure на верхнем конце.

### Возможности OpenType

Большинство разработчиков не знают, что они существуют. Используйте для polish:

```css
/* Tabular numbers for data alignment */
.data-table { font-variant-numeric: tabular-nums; }

/* Proper fractions */
.recipe-amount { font-variant-numeric: diagonal-fractions; }

/* Small caps for abbreviations */
abbr { font-variant-caps: all-small-caps; }

/* Disable ligatures in code */
code { font-variant-ligatures: none; }

/* Enable kerning (usually on by default, but be explicit) */
body { font-kerning: normal; }
```

Проверяйте, какие features поддерживает ваш шрифт, на [Wakamai Fondue](https://wakamaifondue.com/).

### Полировка рендеринга

```css
/* Even out heading line lengths (browser picks better break points) */
h1, h2, h3 { text-wrap: balance; }

/* Reduce orphans and ragged endings in long prose */
article p { text-wrap: pretty; }

/* Variable fonts: pick the right optical-size master automatically */
body { font-optical-sizing: auto; }
```

**ALL-CAPS tracking**: capitals сидят слишком близко при default spacing. Добавьте 5–12% letter-spacing (`letter-spacing: 0.05em` до `0.12em`) коротким all-caps labels, eyebrows и мелким headings. Настоящие small caps (через `font-variant-caps`) нуждаются в том же, чуть мягче.

## Типографика System Architecture

Именуйте токены семантически (`--text-body`, `--text-heading`), не по значению (`--font-size-16`). Включайте font stacks, size scale, weights, line-heights и letter-spacing в вашу token system.

## Соображения доступности

Помимо contrast ratios (которые хорошо задокументированы), учитывайте:

- **Никогда не отключайте zoom**: `user-scalable=no` ломает accessibility. Если layout ломается при zoom 200% — чините layout.
- **Используйте rem/em для размеров шрифта**: это уважает настройки браузера пользователя. Никогда `px` для body text.
- **Минимум 16px body text**: меньше напрягает глаза и проваливает WCAG на mobile.
- **Adequate touch targets**: текстовым ссылкам нужен padding или line-height, создающий tap targets 44px+.

---

**Избегайте**: больше 2–3 font families на проект. Пропуск определений fallback fonts. Игнорирование производительности font loading (FOUT/FOIT). Decorative fonts для body text.

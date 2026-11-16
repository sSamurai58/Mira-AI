# Типографика

## Классические принципы типографики

### Вертикальный ритм

Ваш line-height должен быть базовой единицей для ВСЕХ вертикальных отступов. Если у body-текста `line-height: 1.5` при кегле `16px` (= 24px), значения spacing должны быть кратны 24px. Это создаёт подсознательную гармонию: текст и пространство делят одну математическую основу.

### Модульная шкала и иерархия

Типичная ошибка: слишком много размеров шрифта, слишком близких друг к другу (14px, 15px, 16px, 18px...). Это даёт мутную иерархию.

**Используйте меньше размеров с большим контрастом.** Система из 5 размеров покрывает большинство нужд:

| Роль | Типичный ratio | Применение |
|------|---------------|----------|
| xs | 0.75rem | Captions, legal |
| sm | 0.875rem | Secondary UI, metadata |
| base | 1rem | Body-текст |
| lg | 1.25-1.5rem | Подзаголовки, lead-текст |
| xl+ | 2-4rem | Заголовки, hero-текст |

Популярные ratios: 1.25 (major third), 1.333 (perfect fourth), 1.5 (perfect fifth). Выберите один и придерживайтесь.

### Читаемость и мера строки

Используйте единицы `ch` для character-based measure (`max-width: 65ch`). Line-height масштабируется обратно длине строки: узким колонкам нужен более плотный leading, широким — больший.

**Неочевидно**: светлый текст на тёмном фоне нуждается в компенсации по трём осям, а не по одной. Поднимите line-height на 0.05–0.1, добавьте чуть letter-spacing (0.01–0.02em) и опционально поднимите вес body на один шаг (regular → medium). Воспринимаемый вес падает по всем трём; чините все три.

**Ритм абзацев**: выберите либо space между абзацами, ЛИБО first-line indentation. Никогда оба. В digital обычно нужен space; editorial/long-form может оправдать только indent.

## Выбор и сочетание шрифтов

Тактическая процедура выбора и список reflex-reject живут в [reference/brand.md](brand.md) в разделах **Font selection procedure** и **Reflex-reject list** (подгружаются для brand-register задач). Остаток этого раздела — смежные знания: anti-reflex коррекции, использование system fonts и правила pairing.

### Анти-рефлексы, от которых стоит защищаться

- Техническому/утилитарному брифу НЕ нужен serif «для тепла». Большинство tech-инструментов должны выглядеть как tech-инструменты.
- Editorial/premium брифу НЕ нужен тот же expressive serif, которым все пользуются прямо сейчас. Premium может быть Swiss-modern, neo-grotesque, буквальным monospace, тихим humanist sans.
- Детскому продукту НЕ нужен rounded display font. Детские книги используют настоящий type.
- «Современному» брифу НЕ нужен geometric sans. Самое современное, что можно сделать — не использовать шрифт, которым пользуются все остальные.

**System fonts недооценены**: `-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui` выглядит нативно, грузится мгновенно и хорошо читается. Рассмотрите это для приложений, где performance > personality.

### Принципы pairing

**Неочевидная правда**: часто второй шрифт не нужен. Одно хорошо выбранное семейство в нескольких weights даёт более чистую иерархию, чем две конкурирующие гарнитуры. Добавляйте второй шрифт только когда нужен настоящий контраст (например, display headlines + body serif).

При pairing контрастируйте по нескольким осям:
- Serif + Sans (контраст структуры)
- Geometric + Humanist (контраст характера)
- Condensed display + Wide body (контраст пропорций)

**Никогда не pairing'ите шрифты, которые похожи, но не идентичны** (например, два geometric sans-serif). Они создают визуальное напряжение без ясной иерархии.

### Загрузка веб-шрифтов

Проблема layout shift: шрифты грузятся поздно, текст перетекает, пользователи видят скачок контента. Вот фикс:

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

**`swap` vs `optional`**: `swap` сразу показывает fallback-текст и FOUT-меняет его, когда приходит web font. `optional` использует fallback, если web font не уложился в маленький load budget (~100ms), и полностью избегает shift. Выбирайте `optional`, когда нулевой layout shift важнее брендового шрифта на медленных сетях.

**Preload только критический weight**: обычно regular-weight body-шрифт above the fold. Preload каждого weight стоит больше bandwidth, чем экономит.

**Variable fonts для 3+ weights или styles**: один файл variable font обычно меньше трёх static weight файлов, даёт дробный контроль weight и хорошо сочетается с `font-optical-sizing: auto`. Для 1–2 weights static достаточно.

## Современная веб-типографика

### Плавная типографика (fluid type)

Fluid typography через `clamp(min, preferred, max)` плавно масштабирует текст с viewport. Среднее значение (например, `5vw + 1rem`) контролирует скорость масштабирования (выше vw = быстрее). Добавляйте rem-offset, чтобы на маленьких экранах не схлопывалось в 0.

**Используйте fluid type для**: заголовков и display-текста на marketing/content-страницах, где текст доминирует в layout и должен «дышать» across viewport sizes.

**Используйте фиксированные шкалы `rem` для**: App UI, dashboards и data-dense интерфейсов. Ни одна крупная app design system (Material, Polaris, Primer, Carbon) не использует fluid type в product UI; фиксированные шкалы с опциональными breakpoint-корректировками дают пространственную предсказуемость, нужную container-based layout. Body-текст тоже должен быть фиксированным даже на marketing-страницах: разница размера across viewports слишком мала, чтобы это оправдывать.

**Ограничивайте clamp()**: держите `max-size ≤ ~2.5 × min-size`. Более широкие ratios ломают zoom и reflow браузера и заставляют большие viewport'ы ощущаться так, будто страница кричит.

**Масштабируйте ширину контейнера и font-size вместе**, чтобы эффективный character measure оставался в полосе 45–75ch на каждом viewport. Заголовок, который расширяется быстрее своего контейнера, уезжает из комфортного measure на верхнем конце.

### Возможности OpenType

Большинство разработчиков не знает, что они существуют. Используйте их для polish:

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

**Трекинг ALL-CAPS**: капитель сидит слишком плотно при дефолтном spacing. Добавляйте 5–12% letter-spacing (`letter-spacing: 0.05em` до `0.12em`) к коротким all-caps лейблам, eyebrows и мелким заголовкам. Настоящие small caps (через `font-variant-caps`) нуждаются в том же, чуть мягче.

## Архитектура типографической системы

Называйте токены семантически (`--text-body`, `--text-heading`), а не по значению (`--font-size-16`). Включите в token-систему font stacks, size scale, weights, line-heights и letter-spacing.

## Доступность

Помимо contrast ratios (которые хорошо задокументированы), учитывайте:

- **Никогда не отключайте zoom**: `user-scalable=no` ломает accessibility. Если layout ломается при 200% zoom — чините layout.
- **Используйте rem/em для размеров шрифта**: это уважает настройки браузера пользователя. Никогда `px` для body-текста.
- **Минимум 16px body-текста**: меньше этого напрягает глаза и проваливает WCAG на mobile.
- **Адекватные touch targets**: текстовым ссылкам нужен padding или line-height, дающий tap targets 44px+.

---

**Избегайте**: больше 2–3 семейств шрифтов на проект. Пропуск определений fallback-шрифтов. Игнорирование performance загрузки шрифтов (FOUT/FOIT). Декоративные шрифты для body-текста.

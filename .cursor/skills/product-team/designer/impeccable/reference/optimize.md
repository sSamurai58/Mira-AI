Производительность — это функция. Найдите реальный bottleneck для ЭТОГО интерфейса, исправьте, затем измерьте. Не оптимизируйте то, что не медленное.

## Оцените проблемы производительности

Поймите текущую производительность и выявите проблемы:

1. **Измерьте текущее состояние**:
   - **Core Web Vitals**: LCP, FID/INP, CLS scores
   - **Load time**: Time to interactive, first contentful paint
   - **Bundle size**: размеры JavaScript, CSS, изображений
   - **Runtime performance**: frame rate, memory usage, CPU usage
   - **Network**: число запросов, размеры payload, waterfall

2. **Определите bottlenecks**:
   - Что медленно? (Initial load? Взаимодействия? Анимации?)
   - Что вызывает это? (Большие изображения? Дорогой JavaScript? Layout thrashing?)
   - Насколько плохо? (Заметно? Раздражает? Блокирует?)
   - Кого затрагивает? (Всех? Только mobile? Медленные соединения?)

**КРИТИЧНО**: измеряйте до и после. Premature optimization тратит время. Оптимизируйте то, что действительно важно.

## Стратегия оптимизации

Создайте системный план улучшений:

### Производительность загрузки

**Оптимизируйте изображения**:
- Используйте современные форматы (WebP, AVIF)
- Правильные размеры (не грузите изображение 3000px для отображения 300px)
- Lazy loading для изображений ниже fold
- Responsive images (`srcset`, элемент `picture`)
- Сжимайте изображения (качество 80–85% обычно незаметно)
- Используйте CDN для быстрой доставки

```html
<img 
  src="hero.webp"
  srcset="hero-400.webp 400w, hero-800.webp 800w, hero-1200.webp 1200w"
  sizes="(max-width: 400px) 400px, (max-width: 800px) 800px, 1200px"
  loading="lazy"
  alt="Hero image"
/>
```

**Уменьшите JavaScript Bundle**:
- Code splitting (по маршрутам, по компонентам)
- Tree shaking (удаляйте неиспользуемый код)
- Удаляйте неиспользуемые зависимости
- Lazy load некритичного кода
- Используйте dynamic imports для тяжёлых компонентов

```javascript
// Lazy load heavy component
const HeavyChart = lazy(() => import('./HeavyChart'));
```

**Оптимизируйте CSS**:
- Удаляйте неиспользуемый CSS
- Critical CSS inline, остальное async
- Минимизируйте CSS-файлы
- Используйте CSS containment для независимых регионов

**Оптимизируйте шрифты**:
- Используйте `font-display: swap` или `optional`
- Subset шрифтов (только нужные символы)
- Preload критичных шрифтов
- Используйте system fonts, когда уместно
- Ограничивайте загружаемые начертания

```css
@font-face {
  font-family: 'CustomFont';
  src: url('/fonts/custom.woff2') format('woff2');
  font-display: swap; /* Show fallback immediately */
  unicode-range: U+0020-007F; /* Basic Latin only */
}
```

**Оптимизируйте стратегию загрузки**:
- Сначала критичные ресурсы (async/defer для некритичных)
- Preload критичных assets
- Prefetch вероятных следующих страниц
- Service worker для offline/caching
- HTTP/2 или HTTP/3 для multiplexing

### Производительность рендеринга

**Избегайте Layout Thrashing**:
```javascript
// ❌ Bad: Alternating reads and writes (causes reflows)
elements.forEach(el => {
  const height = el.offsetHeight; // Read (forces layout)
  el.style.height = height * 2; // Write
});

// ✅ Good: Batch reads, then batch writes
const heights = elements.map(el => el.offsetHeight); // All reads
elements.forEach((el, i) => {
  el.style.height = heights[i] * 2; // All writes
});
```

**Оптимизируйте рендеринг**:
- Используйте CSS-свойство `contain` для независимых регионов
- Минимизируйте глубину DOM (площе — быстрее)
- Уменьшайте размер DOM (меньше элементов)
- Используйте `content-visibility: auto` для длинных списков
- Virtual scrolling для очень длинных списков (react-window, react-virtualized)

**Снижайте Paint & Composite**:
- Используйте `transform` и `opacity` для надёжного движения, но допускайте blur, filters, masks, clip paths, shadows и сдвиги цвета, когда они дают осмысленный polish
- Избегайте casual-анимации свойств, управляющих layout (`width`, `height`, `top`, `left`, margins)
- Используйте `will-change` скупо для заведомо дорогих операций
- Ограничивайте дорогие области paint для эффектов blur/filter/shadow (меньше и изолированнее — быстрее)

### Производительность анимаций

**GPU Acceleration**:
```css
/* ✅ GPU-accelerated (fast) */
.animated {
  transform: translateX(100px);
  opacity: 0.5;
}

/* ❌ CPU-bound (slow) */
.animated {
  left: 100px;
  width: 300px;
}
```

**Плавные 60fps**:
- Цель — 16ms на кадр (60fps)
- Используйте `requestAnimationFrame` для JS-анимаций
- Debounce/throttle scroll handlers
- Предпочитайте CSS-анимации, когда возможно
- Избегайте долгого JavaScript во время анимаций

**Intersection Observer**:
```javascript
// Efficiently detect when elements enter viewport
const observer = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      // Element is visible, lazy load or animate
    }
  });
});
```

### Оптимизация React/фреймворков

**React-specific**:
- Используйте `memo()` для дорогих компонентов
- `useMemo()` и `useCallback()` для дорогих вычислений
- Виртуализируйте длинные списки
- Code split маршрутов
- Избегайте создания inline-функций в render
- Используйте React DevTools Profiler

**Framework-agnostic**:
- Минимизируйте re-renders
- Debounce дорогих операций
- Мемоизируйте вычисленные значения
- Lazy load маршрутов и компонентов

### Оптимизация сети

**Снижайте число запросов**:
- Объединяйте мелкие файлы
- Используйте SVG sprites для иконок
- Inline мелких критичных assets
- Удаляйте неиспользуемые сторонние скрипты

**Оптимизируйте API**:
- Используйте pagination (не грузите всё)
- GraphQL — запрашивайте только нужные поля
- Сжатие ответов (gzip, brotli)
- HTTP caching headers
- CDN для статичных assets

**Оптимизируйте под медленные соединения**:
- Adaptive loading по типу соединения (navigator.connection)
- Optimistic UI updates
- Приоритизация запросов
- Progressive enhancement

## Оптимизация Core Web Vitals

### Largest Contentful Paint (LCP < 2.5s)
- Оптимизируйте hero-изображения
- Inline critical CSS
- Preload ключевых ресурсов
- Используйте CDN
- Server-side rendering

### First Input Delay (FID < 100ms) / INP (< 200ms)
- Разбивайте длинные задачи
- Defer некритичного JavaScript
- Используйте web workers для тяжёлых вычислений
- Сокращайте время выполнения JavaScript

### Cumulative Layout Shift (CLS < 0.1)
- Задавайте размеры изображениям и видео
- Не вставляйте контент выше уже существующего
- Используйте CSS-свойство `aspect-ratio`
- Резервируйте место под ads/embeds
- Избегайте анимаций, вызывающих layout shifts

```css
/* Reserve space for image */
.image-container {
  aspect-ratio: 16 / 9;
}
```

## Мониторинг производительности

**Инструменты**:
- Chrome DevTools (Lighthouse, Performance panel)
- WebPageTest
- Core Web Vitals (Chrome UX Report)
- Bundle analyzers (webpack-bundle-analyzer)
- Performance monitoring (Sentry, DataDog, New Relic)

**Ключевые метрики**:
- LCP, FID/INP, CLS (Core Web Vitals)
- Time to Interactive (TTI)
- First Contentful Paint (FCP)
- Total Blocking Time (TBT)
- Bundle size
- Request count

**ВАЖНО**: измеряйте на реальных устройствах с реальными сетевыми условиями. Desktop Chrome с быстрым соединением не репрезентативен.

**НИКОГДА**:
- Не оптимизируйте без измерений (premature optimization)
- Не жертвуйте accessibility ради производительности
- Не ломайте функциональность при оптимизации
- Не используйте `will-change` везде (создаёт новые слои, расходует память)
- Не lazy load контента above-the-fold
- Не увлекайтесь микрооптимизациями, игнорируя главные проблемы (сначала самый большой bottleneck)
- Не забывайте о mobile-производительности (часто более слабые устройства и соединения)

## Проверьте улучшения

Убедитесь, что оптимизации сработали:

- **Before/after metrics**: сравните Lighthouse scores
- **Real user monitoring**: отслеживайте улучшения для реальных пользователей
- **Разные устройства**: тестируйте на low-end Android, не только на flagship iPhone
- **Медленные соединения**: throttle до 3G, проверьте опыт
- **Нет регрессий**: функциональность всё ещё работает
- **Восприятие пользователя**: *ощущается* ли быстрее?

Когда пользовательские цифры сдвинулись — передайте `$impeccable polish` для финального прохода.

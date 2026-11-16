Дизайны, работающие только с идеальными данными, не production-ready. Harden интерфейс против inputs, ошибок, языков и сетевых условий, которые бросят на него реальные пользователи.

## Оцените потребности в hardening

Выявите слабости и edge cases:

1. **Тестируйте с extreme inputs**:
   - Очень длинный текст (names, descriptions, titles)
   - Очень короткий текст (empty, один символ)
   - Спецсимволы (emoji, RTL text, accents)
   - Большие числа (millions, billions)
   - Много элементов (1000+ list items, 50+ options)
   - Нет данных (empty states)

2. **Тестируйте error scenarios**:
   - Network failures (offline, slow, timeout)
   - API errors (400, 401, 403, 404, 500)
   - Validation errors
   - Permission errors
   - Rate limiting
   - Concurrent operations

3. **Тестируйте internationalization**:
   - Длинные переводы (немецкий часто на 30% длиннее английского)
   - RTL languages (Arabic, Hebrew)
   - Character sets (Chinese, Japanese, Korean, emoji)
   - Date/time formats
   - Number formats (1,000 vs 1.000)
   - Currency symbols

**КРИТИЧНО**: дизайны, работающие только с идеальными данными, не production-ready. Harden против реальности.

## Измерения hardening

Системно повышайте resilience:

### Переполнение и перенос текста

**Long text handling**:
```css
/* Single line with ellipsis */
.truncate {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Multi-line with clamp */
.line-clamp {
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

/* Allow wrapping */
.wrap {
  word-wrap: break-word;
  overflow-wrap: break-word;
  hyphens: auto;
}
```

**Flex/Grid overflow**:
```css
/* Prevent flex items from overflowing */
.flex-item {
  min-width: 0; /* Allow shrinking below content size */
  overflow: hidden;
}

/* Prevent grid items from overflowing */
.grid-item {
  min-width: 0;
  min-height: 0;
}
```

**Responsive text sizing**:
- Используйте `clamp()` для fluid typography
- Задавайте минимальные читаемые размеры (14px на mobile)
- Тестируйте text scaling (zoom до 200%)
- Обеспечьте, что контейнеры расширяются с текстом

### Интернационализация (i18n)

**Text expansion**:
- Заложите 30–40% space budget на переводы
- Используйте flexbox/grid, адаптирующийся к контенту
- Тестируйте с самым длинным языком (обычно немецкий)
- Избегайте fixed widths на текстовых контейнерах

```jsx
// ❌ Bad: Assumes short English text
<button className="w-24">Submit</button>

// ✅ Good: Adapts to content
<button className="px-4 py-2">Submit</button>
```

**RTL (Right-to-Left) support**:
```css
/* Use logical properties */
margin-inline-start: 1rem; /* Not margin-left */
padding-inline: 1rem; /* Not padding-left/right */
border-inline-end: 1px solid; /* Not border-right */

/* Or use dir attribute */
[dir="rtl"] .arrow { transform: scaleX(-1); }
```

**Character set support**:
- Используйте UTF-8 encoding везде
- Тестируйте с Chinese/Japanese/Korean (CJK) characters
- Тестируйте с emoji (они могут быть 2–4 bytes)
- Обрабатывайте разные scripts (Latin, Cyrillic, Arabic и т.д.)

**Date/Time formatting**:
```javascript
// ✅ Use Intl API for proper formatting
new Intl.DateTimeFormat('en-US').format(date); // 1/15/2024
new Intl.DateTimeFormat('de-DE').format(date); // 15.1.2024

new Intl.NumberFormat('en-US', { 
  style: 'currency', 
  currency: 'USD' 
}).format(1234.56); // $1,234.56
```

**Pluralization**:
```javascript
// ❌ Bad: Assumes English pluralization
`${count} item${count !== 1 ? 's' : ''}`

// ✅ Good: Use proper i18n library
t('items', { count }) // Handles complex plural rules
```

### Обработка ошибок

**Network errors**:
- Показывайте ясные сообщения об ошибках
- Давайте кнопку retry
- Объясняйте, что случилось
- Предлагайте offline mode (если применимо)
- Обрабатывайте timeout scenarios

```jsx
// Error states with recovery
{error && (
  <ErrorMessage>
    <p>Failed to load data. {error.message}</p>
    <button onClick={retry}>Try again</button>
  </ErrorMessage>
)}
```

**Form validation errors**:
- Inline errors рядом с полями
- Ясные, конкретные сообщения
- Suggest corrections
- Не блокируйте submission без необходимости
- Сохраняйте user input при ошибке

**API errors**:
- Обрабатывайте каждый status code уместно
  - 400: покажите validation errors
  - 401: redirect на login
  - 403: покажите permission error
  - 404: покажите not found state
  - 429: покажите rate limit message
  - 500: покажите generic error, предложите support

**Graceful degradation**:
- Core functionality работает без JavaScript
- У изображений есть alt text
- Progressive enhancement
- Fallbacks для неподдерживаемых features

### Edge cases и граничные условия

**Empty states**:
- Нет элементов в списке
- Нет результатов поиска
- Нет уведомлений
- Нет данных для отображения
- Дайте ясное следующее действие

**Loading states**:
- Initial load
- Pagination load
- Refresh
- Показывайте, что грузится («Loading your projects...»)
- Time estimates для долгих операций

**Large datasets**:
- Pagination или virtual scrolling
- Search/filter capabilities
- Оптимизация производительности
- Не грузите все 10,000 items сразу

**Concurrent operations**:
- Предотвращайте double-submission (disable button while loading)
- Обрабатывайте race conditions
- Optimistic updates с rollback
- Conflict resolution

**Permission states**:
- Нет permission на просмотр
- Нет permission на edit
- Read-only mode
- Ясное объяснение почему

**Browser compatibility**:
- Polyfills для modern features
- Fallbacks для неподдерживаемого CSS
- Feature detection (не browser detection)
- Тестируйте в целевых браузерах

### Валидация и санитизация ввода

**Client-side validation**:
- Required fields
- Format validation (email, phone, URL)
- Length limits
- Pattern matching
- Custom validation rules

**Server-side validation** (всегда):
- Никогда не доверяйте только client-side
- Validate и sanitize все inputs
- Защищайте от injection attacks
- Rate limiting

**Constraint handling**:
```html
<!-- Set clear constraints -->
<input 
  type="text"
  maxlength="100"
  pattern="[A-Za-z0-9]+"
  required
  aria-describedby="username-hint"
/>
<small id="username-hint">
  Letters and numbers only, up to 100 characters
</small>
```

### Устойчивость доступности

**Keyboard navigation**:
- Вся функциональность доступна с клавиатуры
- Логичный tab order
- Focus management в modals
- Skip links для длинного контента

**Screen reader support**:
- Правильные ARIA labels
- Announce dynamic changes (live regions)
- Descriptive alt text
- Semantic HTML

**Motion sensitivity**:
```css
@media (prefers-reduced-motion: reduce) {
  * {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

**High contrast mode**:
- Тестируйте в Windows high contrast mode
- Не опирайтесь только на цвет
- Давайте альтернативные visual cues

### Устойчивость производительности

**Slow connections**:
- Progressive image loading
- Skeleton screens
- Optimistic UI updates
- Offline support (service workers)

**Memory leaks**:
- Clean up event listeners
- Cancel subscriptions
- Clear timers/intervals
- Abort pending requests on unmount

**Throttling & Debouncing**:
```javascript
// Debounce search input
const debouncedSearch = debounce(handleSearch, 300);

// Throttle scroll handler
const throttledScroll = throttle(handleScroll, 100);
```

## Стратегии тестирования

**Manual testing**:
- Тестируйте с extreme data (очень длинные, очень короткие, empty)
- Тестируйте на разных языках
- Тестируйте offline
- Тестируйте медленное соединение (throttle до 3G)
- Тестируйте со screen reader
- Тестируйте keyboard-only navigation
- Тестируйте на старых браузерах

**Automated testing**:
- Unit tests для edge cases
- Integration tests для error scenarios
- E2E tests для critical paths
- Visual regression tests
- Accessibility tests (axe, WAVE)

**ВАЖНО**: hardening — про ожидание неожиданного. Реальные пользователи сделают то, что вы никогда не представляли.

**НИКОГДА**:
- Не предполагайте perfect input (validate everything)
- Не игнорируйте internationalization (design for global)
- Не оставляйте generic error messages («Error occurred»)
- Не забывайте offline scenarios
- Не доверяйте только client-side validation
- Не используйте fixed widths для текста
- Не предполагайте English-length text
- Не блокируйте весь интерфейс, когда ошибается один компонент

## Проверьте hardening

Тщательно тестируйте с edge cases:

- **Long text**: попробуйте имена на 100+ символов
- **Emoji**: используйте emoji во всех текстовых полях
- **RTL**: тестируйте с Arabic или Hebrew
- **CJK**: тестируйте с Chinese/Japanese/Korean
- **Network issues**: отключите интернет, throttle соединение
- **Large datasets**: тестируйте с 1000+ items
- **Concurrent actions**: кликните submit 10 раз подряд
- **Errors**: форсируйте API errors, тестируйте все error states
- **Empty**: уберите все данные, тестируйте empty states

Когда edge cases покрыты — передайте `$impeccable polish` для финального прохода.

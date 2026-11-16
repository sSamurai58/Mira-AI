> **Нужен дополнительный контекст**: целевые platforms/devices и usage contexts.

Адаптируйте существующий дизайн к другому контексту: другому screen size, device, platform или use case. Ловушка — считать adaptation масштабированием. Задача — переосмыслить опыт под новый контекст.


---

## Оцените challenge адаптации

Поймите, что нужно адаптировать и почему:

1. **Определите source context**:
   - Для чего это было designed originally? (Desktop web? Mobile app?)
   - Какие assumptions были сделаны? (Large screen? Mouse input? Fast connection?)
   - Что хорошо работает в текущем контексте?

2. **Поймите target context**:
   - **Device**: Mobile, tablet, desktop, TV, watch, print?
   - **Input method**: Touch, mouse, keyboard, voice, gamepad?
   - **Screen constraints**: Size, resolution, orientation?
   - **Connection**: Fast wifi, slow 3G, offline?
   - **Usage context**: On-the-go vs desk, quick glance vs focused reading?
   - **User expectations**: Чего пользователи ожидают на этой platform?

3. **Определите challenges адаптации**:
   - Что не влезет? (Content, navigation, features)
   - Что не сработает? (Hover states на touch, tiny touch targets)
   - Что inappropriate? (Desktop patterns на mobile, mobile patterns на desktop)

**КРИТИЧНО**: Adaptation — это переосмысление опыта для нового контекста, а не масштабирование пикселей.

## Спланируйте стратегию адаптации

Создайте context-appropriate стратегию:

### Адаптация под mobile (Desktop → Mobile)

**Layout Strategy**:
- Single column вместо multi-column
- Vertical stacking вместо side-by-side
- Full-width components вместо fixed widths
- Bottom navigation вместо top/side navigation

**Interaction Strategy**:
- Touch targets минимум 44x44px (не hover-dependent)
- Swipe gestures где appropriate (lists, carousels)
- Bottom sheets вместо dropdowns
- Thumbs-first design (controls в зоне большого пальца)
- Larger tap areas с большим spacing

**Content Strategy**:
- Progressive disclosure (не показывайте всё сразу)
- Приоритизируйте primary content (secondary content в tabs/accordions)
- Shorter text (более concise)
- Larger text (минимум 16px)

**Navigation Strategy**:
- Hamburger menu или bottom navigation
- Снизьте navigation complexity
- Sticky headers для context
- Back button в navigation flow

### Адаптация под tablet (гибридный подход)

**Layout Strategy**:
- Two-column layouts (не single и не three-column)
- Side panels для secondary content
- Master-detail views (list + detail)
- Adaptive based on orientation (portrait vs landscape)

**Interaction Strategy**:
- Поддерживайте и touch, и pointer
- Touch targets 44x44px, но denser layouts, чем phone
- Side navigation drawers
- Multi-column forms где appropriate

### Адаптация под desktop (Mobile → Desktop)

**Layout Strategy**:
- Multi-column layouts (используйте horizontal space)
- Side navigation always visible
- Multiple information panels simultaneously
- Fixed widths с max-width constraints (не растягивайте до 4K)

**Interaction Strategy**:
- Hover states для дополнительной информации
- Keyboard shortcuts
- Right-click context menus
- Drag and drop где helpful
- Multi-select с Shift/Cmd

**Content Strategy**:
- Показывайте больше информации upfront (меньше progressive disclosure)
- Data tables с many columns
- Richer visualizations
- More detailed descriptions

### Адаптация под печать (Screen → Print)

**Layout Strategy**:
- Page breaks в logical points
- Уберите navigation, footer, interactive elements
- Black and white (или limited color)
- Proper margins для binding

**Content Strategy**:
- Expand shortened content (показывайте full URLs, hidden sections)
- Добавьте page numbers, headers, footers
- Включите metadata (print date, page title)
- Конвертируйте charts в print-friendly versions

### Адаптация под email (Web → Email)

**Layout Strategy**:
- Narrow width (макс. 600px)
- Только single column
- Inline CSS (без external stylesheets)
- Table-based layouts (для совместимости email clients)

**Interaction Strategy**:
- Large, obvious CTAs (buttons не text links)
- Нет hover states (не reliable)
- Deep links в web app для сложных interactions

## Реализуйте Adaptations

Применяйте изменения системно:

### Responsive-брейкпоинты

Выберите appropriate breakpoints:
- Mobile: 320px–767px
- Tablet: 768px–1023px
- Desktop: 1024px+
- Или content-driven breakpoints (где design breaks)

### Техники адаптации раскладки

- **CSS Grid/Flexbox**: Reflow layouts автоматически
- **Container Queries**: Адаптируйте based on container, не viewport
- **`clamp()`**: Fluid sizing между min и max
- **Media queries**: Разные styles для разных contexts
- **Display properties**: Show/hide elements per context

### Адаптация под touch

- Увеличьте touch target sizes (минимум 44x44px)
- Добавьте больше spacing между interactive elements
- Уберите hover-dependent interactions
- Добавьте touch feedback (ripples, highlights)
- Учитывайте thumb zones (легче дотянуться до bottom, чем top)

### Адаптация контента

- Используйте `display: none` sparingly (всё равно downloads)
- Progressive enhancement (core content first, enhancements на larger screens)
- Lazy loading для off-screen content
- Responsive images (`srcset`, `picture` element)

### Адаптация навигации

- Transform complex nav в hamburger/drawer на mobile
- Bottom nav bar для mobile apps
- Persistent side navigation на desktop
- Breadcrumbs на smaller screens для context

**ВАЖНО**: Тестируйте на real devices. Device emulation в DevTools helpful, но не perfect.

**НИКОГДА**:
- Не скрывайте core functionality на mobile (если важно — сделайте так, чтобы работало)
- Не предполагайте desktop = powerful device (учитывайте accessibility, older machines)
- Не используйте разную information architecture across contexts (confusing)
- Не ломайте user expectations для platform (mobile users ожидают mobile patterns)
- Не забывайте landscape orientation на mobile/tablet
- Не используйте generic breakpoints вслепую (используйте content-driven breakpoints)
- Не игнорируйте touch на desktop (многие desktop devices имеют touch)

## Проверьте Adaptations

Тестируйте thoroughly across contexts:

- **Real devices**: Тестируйте на реальных phones, tablets, desktops
- **Different orientations**: Portrait и landscape
- **Different browsers**: Safari, Chrome, Firefox, Edge
- **Different OS**: iOS, Android, Windows, macOS
- **Different input methods**: Touch, mouse, keyboard
- **Edge cases**: Очень маленькие screens (320px), очень большие screens (4K)
- **Slow connections**: Тестируйте на throttled network

Когда адаптация ощущается native для каждого контекста, передайте `$impeccable polish` для финального прохода.

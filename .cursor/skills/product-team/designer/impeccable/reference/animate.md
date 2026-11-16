> **Нужен дополнительный контекст**: performance constraints.

Добавляйте motion, который передаёт state, даёт feedback и проясняет иерархию. Убирайте motion, который существует только для decoration. Animation fatigue — реальная цена; тратьте budget на моменты, которым он нужен.

---

## Регистр

Brand: оркестрированные page-load sequences, staggered reveals, scroll-driven animation. Motion — часть voice; один хорошо отрепетированный entrance бьёт разбросанные micro-interactions.

Product: 150–250 ms на большинстве transitions. Motion передаёт state: feedback, reveal, loading, transitions между views. Нет page-load choreography; пользователи в задаче и не будут ждать.

---

## Оцените возможности Animation

Проанализируйте, где motion улучшит опыт:

1. **Определите static areas**:
   - **Missing feedback**: Действия без visual acknowledgment (button clicks, form submission и т.д.)
   - **Jarring transitions**: Instant state changes, которые ощущаются abrupt (show/hide, page loads, route changes)
   - **Unclear relationships**: Spatial или hierarchical relationships, которые не очевидны
   - **Lack of delight**: Functional но joyless interactions
   - **Missed guidance**: Возможности направить внимание или объяснить behavior

2. **Поймите контекст**:
   - Какова personality? (Playful vs serious, energetic vs calm)
   - Каков performance budget? (Mobile-first? Complex page?)
   - Кто аудитория? (Motion-sensitive users? Power users, которым нужна speed?)
   - Что важнее всего? (Одна hero animation vs many micro-interactions?)

Если что-то из этого неясно из codebase, ОСТАНОВИТЕСЬ и используйте структурированный инструмент вопросов Codex, когда он доступен; если недоступен, спросите напрямую в чате, чтобы уточнить то, что нельзя вывести.

**КРИТИЧНО**: Уважайте `prefers-reduced-motion`. Всегда предоставляйте non-animated alternatives для пользователей, которым они нужны.

## Спланируйте Animation Strategy

Создайте purposeful план анимации:

- **Hero moment**: Какова ОДНА signature animation? (Page load? Hero section? Key interaction?)
- **Feedback layer**: Каким interactions нужно acknowledgment?
- **Transition layer**: Какие state changes нуждаются в smoothing?
- **Delight layer**: Где можно surprise and delight?

**ВАЖНО**: Один хорошо оркестрированный опыт бьёт разбросанные animations everywhere. Фокусируйтесь на high-impact moments.

## Реализуйте Animations

Добавляйте motion системно по этим категориям:

### Анимации появления
- **Page load choreography**: Stagger element reveals (задержки 100–150ms), комбинации fade + slide
- **Hero section**: Dramatic entrance для primary content (scale, parallax или creative effects)
- **Content reveals**: Scroll-triggered animations с intersection observer
- **Modal/drawer entry**: Smooth slide + fade, backdrop fade, focus management

### Микро-взаимодействия
- **Button feedback**:
  - Hover: Subtle scale (1.02–1.05), color shift, shadow increase
  - Click: Quick scale down then up (0.95 → 1), ripple effect
  - Loading: Spinner или pulse state
- **Form interactions**:
  - Input focus: Border color transition, slight scale или glow
  - Validation: Shake on error, check mark on success, smooth color transitions
- **Toggle switches**: Smooth slide + color transition (200–300ms)
- **Checkboxes/radio**: Check mark animation, ripple effect
- **Like/favorite**: Scale + rotation, particle effects, color transition

### Переходы состояний
- **Show/hide**: Fade + slide (не instant), appropriate timing (200–300ms)
- **Expand/collapse**: Height transition с overflow handling, icon rotation
- **Loading states**: Skeleton screen fades, spinner animations, progress bars
- **Success/error**: Color transitions, icon animations, gentle scale pulse
- **Enable/disable**: Opacity transitions, cursor changes

### Навигация и поток
- **Page transitions**: Crossfade между routes, shared element transitions
- **Tab switching**: Slide indicator, content fade/slide
- **Carousel/slider**: Smooth transforms, snap points, momentum
- **Scroll effects**: Parallax layers, sticky headers с state changes, scroll progress indicators

### Обратная связь и подсказки
- **Hover hints**: Tooltip fade-ins, cursor changes, element highlights
- **Drag & drop**: Lift effect (shadow + scale), drop zone highlights, smooth repositioning
- **Copy/paste**: Brief highlight flash on paste, «copied» confirmation
- **Focus flow**: Highlight path через form или workflow

### Моменты delight
- **Empty states**: Subtle floating animations на illustrations
- **Completed actions**: Confetti, check mark flourish, success celebrations
- **Easter eggs**: Hidden interactions для discovery
- **Contextual animation**: Weather effects, time-of-day themes, seasonal touches

## Техническая реализация

Используйте appropriate techniques для каждой анимации:

### Тайминг и easing

**Durations by purpose:**
- **100–150ms**: Instant feedback (button press, toggle)
- **200–300ms**: State changes (hover, menu open)
- **300–500ms**: Layout changes (accordion, modal)
- **500–800ms**: Entrance animations (page load)

**Easing curves (используйте эти, не CSS defaults):**
```css
/* Recommended: natural deceleration */
--ease-out-quart: cubic-bezier(0.25, 1, 0.5, 1);    /* Smooth */
--ease-out-quint: cubic-bezier(0.22, 1, 0.36, 1);   /* Slightly snappier */
--ease-out-expo: cubic-bezier(0.16, 1, 0.3, 1);     /* Confident, decisive */

/* AVOID: feel dated and tacky */
/* bounce: cubic-bezier(0.34, 1.56, 0.64, 1); */
/* elastic: cubic-bezier(0.68, -0.6, 0.32, 1.6); */
```

**Exit animations быстрее entrances.** Используйте ~75% enter duration.

### CSS-анимации
```css
/* Prefer for simple, declarative animations */
- transitions for state changes
- @keyframes for complex sequences
- transform and opacity for reliable movement
- blur, filters, masks, clip paths, shadows, and color shifts for premium atmospheric effects when verified smooth
```

### JavaScript-анимация
```javascript
/* Use for complex, interactive animations */
- Web Animations API for programmatic control
- Framer Motion for React
- GSAP for complex sequences
```

### Производительность
- **Motion materials**: Используйте transform/opacity для reliable movement, но используйте blur, filters, masks, shadows и color shifts, когда они materially улучшают эффект
- **Layout safety**: Избегайте casual animation layout-driving properties (`width`, `height`, `top`, `left`, margins)
- **will-change**: Добавляйте sparingly для known expensive animations
- **Bound expensive effects**: Держите blur/filter/shadow areas small или isolated, используйте `contain` где appropriate
- **Monitor FPS**: Обеспечьте 60fps на target devices

### Доступность
```css
@media (prefers-reduced-motion: reduce) {
  * {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

**НИКОГДА**:
- Не используйте bounce или elastic easing curves; они ощущаются dated и привлекают внимание к самой анимации
- Не анимируйте layout properties casually (`width`, `height`, `top`, `left`, margins), когда transform, FLIP или grid-based techniques сработали бы
- Не используйте durations over 500ms для feedback (ощущается laggy)
- Не анимируйте без цели (каждой анимации нужна reason)
- Не игнорируйте `prefers-reduced-motion` (это accessibility violation)
- Не анимируйте всё (animation fatigue делает интерфейсы exhausting)
- Не блокируйте interaction во время animations, если не intentional

## Проверьте качество

Тщательно тестируйте анимации:

- **Smooth at 60fps**: Нет jank на target devices
- **Feels natural**: Easing curves ощущаются organic, не robotic
- **Appropriate timing**: Не слишком fast (jarring) и не слишком slow (laggy)
- **Reduced motion works**: Animations disabled или simplified appropriately
- **Doesn't block**: Пользователи могут interact during/after animations
- **Adds value**: Делает интерфейс clearer или more delightful

Когда motion проясняет state вместо того, чтобы декорировать его, передайте `$impeccable polish` для финального прохода.

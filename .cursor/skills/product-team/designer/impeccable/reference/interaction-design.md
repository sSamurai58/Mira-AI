# Дизайн взаимодействия

## Восемь Interactive States

Каждый interactive element нуждается в спроектированных состояниях:

| State | When | Visual Treatment |
|-------|------|------------------|
| **Default** | At rest | Base styling |
| **Hover** | Pointer over (not touch) | Subtle lift, color shift |
| **Focus** | Keyboard/programmatic focus | Visible ring (see below) |
| **Active** | Being pressed | Pressed in, darker |
| **Disabled** | Not interactive | Reduced opacity, no pointer |
| **Loading** | Processing | Spinner, skeleton |
| **Error** | Invalid state | Red border, icon, message |
| **Success** | Completed | Green check, confirmation |

**Частый промах**: Проектировать hover без focus, или наоборот. Они разные. Keyboard users никогда не видят hover states.

## Focus Rings: делайте правильно

**Никогда `outline: none` без replacement.** Это accessibility violation. Вместо этого используйте `:focus-visible`, чтобы показывать focus только для keyboard users:

```css
/* Hide focus ring for mouse/touch */
button:focus {
  outline: none;
}

/* Show focus ring for keyboard */
button:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}
```

**Дизайн focus ring**:
- High contrast (минимум 3:1 против adjacent colors)
- Толщина 2–3px
- Offset от элемента (не внутри него)
- Consistent across всех interactive elements

## Form Design: неочевидное

**Placeholders — не labels.** Они исчезают при input. Всегда используйте видимые элементы `<label>`. **Validate on blur**, не на каждом keystroke (exception: password strength). Размещайте errors **ниже** fields с `aria-describedby`, связывающим их.

## Состояния загрузки

**Optimistic updates**: Показывайте success immediately, rollback при failure. Используйте для low-stakes actions (likes, follows), не для payments или destructive actions. **Skeleton screens > spinners**: они preview форму контента и ощущаются быстрее generic spinners.

## Modals: подход Inert

Focus trapping в modals раньше требовал сложный JavaScript. Теперь используйте атрибут `inert`:

```html
<!-- When modal is open -->
<main inert>
  <!-- Content behind modal can't be focused or clicked -->
</main>
<dialog open>
  <h2>Modal Title</h2>
  <!-- Focus stays inside modal -->
</dialog>
```

Или используйте native элемент `<dialog>`:

```javascript
const dialog = document.querySelector('dialog');
dialog.showModal();  // Opens with focus trap, closes on Escape
```

## Popover API

Для tooltips, dropdowns и non-modal overlays используйте native popovers:

```html
<button popovertarget="menu">Open menu</button>
<div id="menu" popover>
  <button>Option 1</button>
  <button>Option 2</button>
</div>
```

**Benefits**: Light-dismiss (click outside closes), proper stacking, нет z-index wars, accessible by default.

## Позиционирование dropdown и overlay

Dropdowns, отрендеренные с `position: absolute` внутри container с `overflow: hidden` или `overflow: auto`, будут clipped. Это самый частый dropdown bug в generated code.

### CSS Anchor Positioning

Современное решение использует CSS Anchor Positioning API, чтобы привязать overlay к trigger без JavaScript:

```css
.trigger {
  anchor-name: --menu-trigger;
}

.dropdown {
  position: fixed;
  position-anchor: --menu-trigger;
  position-area: block-end span-inline-end;
  margin-top: 4px;
}

/* Flip above if no room below */
@position-try --flip-above {
  position-area: block-start span-inline-end;
  margin-bottom: 4px;
}
```

Поскольку dropdown использует `position: fixed`, он escapes любой `overflow` clipping на ancestor elements. Блок `@position-try` обрабатывает viewport edges автоматически. **Browser support**: Chrome 125+, Edge 125+. Пока нет в Firefox или Safari — используйте fallback для этих browsers.

### Комбо Popover + Anchor

Комбинация Popover API с anchor positioning даёт stacking, light-dismiss, accessibility и correct positioning в одном паттерне:

```html
<button popovertarget="menu" class="trigger">Open</button>
<div id="menu" popover class="dropdown">
  <button>Option 1</button>
  <button>Option 2</button>
</div>
```

Атрибут `popover` помещает элемент в **top layer**, который сидит выше всего другого контента независимо от z-index или overflow. Portal не нужен.

### Паттерн Portal / Teleport

В component frameworks рендерите dropdown на document root и позиционируйте через JavaScript:

- **React**: `createPortal(dropdown, document.body)`
- **Vue**: `<Teleport to="body">`
- **Svelte**: Используйте portal library или mount к `document.body`

Считайте position из `getBoundingClientRect()` trigger, затем применяйте `position: fixed` с значениями `top` и `left`. Пересчитывайте на scroll и resize.

### Fallback на fixed positioning

Для browsers без поддержки anchor positioning `position: fixed` с manual coordinates избегает overflow clipping:

```css
.dropdown {
  position: fixed;
  /* top/left set via JS from trigger's getBoundingClientRect() */
}
```

Проверяйте viewport boundaries перед rendering. Если dropdown выйдет за bottom edge — flip его выше trigger. Если за right edge — выровняйте к правой стороне trigger.

### Антипаттерны

- **`position: absolute` внутри `overflow: hidden`** — Dropdown будет clipped. Используйте `position: fixed` или top layer.
- **Arbitrary z-index values** вроде `z-index: 9999` — Используйте semantic z-index scale: `dropdown (100) -> sticky (200) -> modal-backdrop (300) -> modal (400) -> toast (500) -> tooltip (600)`.
- **Rendering dropdown markup inline** без escape hatch из stacking context родителя. Либо используйте `popover` (top layer), portal, либо `position: fixed`.

## Деструктивные действия: Undo > Confirm

**Undo лучше confirmation dialogs.** Пользователи кликают через confirmations mindlessly. Убирайте из UI immediately, показывайте undo toast, действительно удаляйте после истечения toast. Используйте confirmation только для truly irreversible actions (account deletion), high-cost actions или batch operations.

## Паттерны клавиатурной навигации

### Roving Tabindex

Для component groups (tabs, menu items, radio groups) один item tabbable; arrow keys двигают внутри:

```html
<div role="tablist">
  <button role="tab" tabindex="0">Tab 1</button>
  <button role="tab" tabindex="-1">Tab 2</button>
  <button role="tab" tabindex="-1">Tab 3</button>
</div>
```

Arrow keys перемещают `tabindex="0"` между items. Tab уходит к следующему component целиком.

### Ссылки пропуска (skip links)

Предоставляйте skip links (`<a href="#main-content">Skip to main content</a>`) для keyboard users, чтобы прыгать мимо navigation. Прячьте off-screen, показывайте on focus.

## Обнаруживаемость жестов

Swipe-to-delete и похожие gestures невидимы. Намекайте на их существование:

- **Partially reveal**: Покажите delete button, peeking from edge
- **Onboarding**: Coach marks при first use
- **Alternative**: Всегда предоставляйте visible fallback (menu с «Delete»)

Не полагайтесь на gestures как единственный способ выполнить действия.

---

**Избегайте**: Удаления focus indicators без alternatives. Использования placeholder text как labels. Touch targets <44x44px. Generic error messages. Custom controls без ARIA/keyboard support.

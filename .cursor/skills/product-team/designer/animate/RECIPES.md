# Рецепты анимаций

Готовые к сборке реализации для самых частых кейсов. Стартуйте с recipe, затем адаптируйте — не собирайте с нуля.

Кривые — токены `--ease-out`, `--ease-in-out` и `--ease-drawer`, определённые в SKILL.md.

---

## Нажатие кнопки

Любой нажимаемый элемент. Мгновенный feedback, что интерфейс услышал пользователя.

```css
.button {
  transition: transform 160ms var(--ease-out);
}

.button:active {
  transform: scale(0.97);
}
```

`scale()` масштабирует и детей — лейбл и иконки едут вместе; именно это читается как физическое нажатие.

Hover-gating здесь не нужен: `:active` — настоящее нажатие и на touch. Любые `:hover`-стили гейтите отдельно.

---

## Dropdown, popover, menu, select

Масштабируется из своего trigger, а не из воздуха.

```css
.popover {
  transform-origin: var(--transform-origin); /* Base UI supplies this */
  transition:
    opacity 200ms var(--ease-out),
    transform 200ms var(--ease-out);
}

.popover[data-starting-style],
.popover[data-ending-style] {
  opacity: 0;
  transform: scale(0.95);
}
```

`transform-origin` — вся суть: панель должна выглядеть так, будто вышла из того, что кликнули.

---

## Tooltip

Та же форма, что у popover, быстрее, плюс деталь, которую большинство реализаций пропускает.

```css
.tooltip {
  transform-origin: var(--transform-origin);
  transition:
    transform 125ms var(--ease-out),
    opacity 125ms var(--ease-out);
}

.tooltip[data-starting-style],
.tooltip[data-ending-style] {
  opacity: 0;
  transform: scale(0.97);
}

/* Once one tooltip is open, neighbours open instantly */
.tooltip[data-instant] {
  transition-duration: 0ms;
}
```

Начальная задержка предотвращает случайную активацию. После этого пропуск и задержки, и анимации делает всю toolbar быстрее на ощупь.

---

## Modal

Единственный popover, который остаётся по центру.

```css
.modal {
  transform-origin: center; /* exempt — not anchored to a trigger */
  transition:
    opacity 250ms var(--ease-out),
    transform 250ms var(--ease-out);
}

.modal[data-starting-style],
.modal[data-ending-style] {
  opacity: 0;
  transform: scale(0.96);
}

.backdrop {
  transition: opacity 250ms var(--ease-out);
}
```

Анимируйте opacity backdrop вместе с ним, чтобы они читались как одна поверхность.

---

## Drawer / sheet

```css
.drawer {
  transform: translateY(0);
  transition: transform 500ms var(--ease-drawer);
}

.drawer[data-closed] {
  transform: translateY(100%);
}
```

Так Vaul прячет drawer перед анимацией входа.

Добавьте drag — и это уже задача жеста; см. **Drag to dismiss** ниже.

---

## Toast

```css
.toast {
  opacity: 1;
  transform: translateY(0);
  transition:
    opacity 400ms ease,
    transform 400ms ease;

  @starting-style {
    opacity: 0;
    transform: translateY(100%);
  }
}
```

- `ease`, а не `ease-out`, чуть медленнее типичного UI: Sonner читается элегантно отчасти потому, что motion подогнан под характер компонента, а не под общий UI-budget.
- Если `@starting-style` недоступен, fallback на mount-флаг:

```jsx
useEffect(() => { setMounted(true); }, []);
// <div data-mounted={mounted}>
```

Когда toasts складываются в стек и список перетекает, смена opacity должна работать против смены height. Формулы для этой пары нет — подкручивайте, пока не «сядет», и проверяйте снова на следующий день.

---

## Accordion / collapse

```css
.content {
  overflow: hidden;
  transition:
    height 200ms var(--ease-out),
    opacity 200ms var(--ease-out);
}
```

Держите коротко — это одна из немногих анимаций, которая стоит layout на каждом кадре, поэтому длинная duration дорога и вяла. Измеряйте высоту контента в JS (или используйте headless-примитив, который её даёт), а не анимируйте к `auto`.

---

## Stagger-вход группы

Для списка или сетки, которые пользователь видит иногда — не для списка, мимо которого скроллит весь день. Для group entrances следуйте `../choreograph/SKILL.md` (один entrance на контейнер, неравномерные delays).

```css
.item {
  opacity: 0;
  transform: translateY(8px);
  animation: fadeIn 300ms var(--ease-out) forwards;
}

.item:nth-child(2) { animation-delay: 50ms; }
.item:nth-child(3) { animation-delay: 90ms; }
.item:nth-child(4) { animation-delay: 120ms; }

@keyframes fadeIn {
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
```

Stagger декоративен — он никогда не должен блокировать взаимодействие, пока играет.

---

## Удержание для подтверждения

Для destructive-действий, где обычный клик слишком легко срабатывает случайно.

```css
.overlay {
  clip-path: inset(0 100% 0 0);
  transition: clip-path 200ms var(--ease-out); /* release: snappy */
}

.button:active .overlay {
  clip-path: inset(0 0 0 0);
  transition: clip-path 2s linear;             /* press: slow and deliberate */
}

.button:active {
  transform: scale(0.97);
}
```

`linear` здесь правилен — заливка это progress-индикатор, и progress не должен easing'иться.

---

## Индикатор вкладки с переходом цвета

Таймить отдельные цветовые transitions по списку табов почти никогда не «садится». Вместо этого — clip.

Дублируйте список табов. Стилизуйте копию как active-состояние — другой фон, другой цвет текста. Клипуйте копию так, чтобы был виден только active-таб, и анимируйте clip при смене:

```css
.tabs-active-copy {
  clip-path: inset(0 60% 0 20%); /* driven by the active tab's position */
  transition: clip-path 250ms var(--ease-in-out);
}
```

Текст и фон меняются вместе, в идеальной синхронизации, потому что это один элемент, который раскрывают, а не два цвета, которые интерполируют.

---

## Появление при скролле

Только marketing-поверхности. Не делайте это с функциональным UI, который пользователь открывает ежедневно.

```css
.reveal {
  clip-path: inset(0 0 100% 0);
  transition: clip-path 600ms var(--ease-in-out);
}

.reveal[data-visible] {
  clip-path: inset(0 0 0 0);
}
```

Триггерьте через `IntersectionObserver` или `useInView` из Motion с `{ once: true, margin: "-100px" }`. Срабатывайте один раз — повторная анимация при каждом проезде скролла это интерфейс, который борется с читателем.

---

## Drag to dismiss

Recipe жеста. Springs, не durations, потому что пользователь может развернуть mid-motion.

```js
// Dismiss on a flick, not just on distance
const timeTaken = Date.now() - dragStartTime.current;
const velocity = Math.abs(swipeAmount) / timeTaken;

if (Math.abs(swipeAmount) >= SWIPE_THRESHOLD || velocity > 0.11) {
  dismiss();
}
```

```js
// Set transform on the dragged element directly.
// Driving it through a CSS variable on the parent recalcs styles for every child.
element.style.transform = `translateY(${distance}px)`;
```

Четыре детали, которые отделяют хороший drag от плохого:

- **Pointer capture**, как только drag начался, чтобы он продолжался, когда указатель выходит за границы элемента.
- **Защита от multi-touch** — `if (isDragging) return` на новых touch-точках, иначе смена пальцев mid-drag заставляет элемент прыгать.
- **Damping за границами** — тяга за естественный край двигает элемент тем меньше, чем дальше. Реальные вещи замедляются перед остановкой.
- **Friction, а не стена** — разрешайте over-drag с растущим сопротивлением, а не запрещайте его.

Усаживайте spring'ом, чтобы прерванный drag сохранил velocity:

```js
{ type: "spring", duration: 0.5, bounce: 0.2 }
```

---

## Masking crossfade, который не устаканивается

Когда два состояния заметно перекрываются во время transition и никакая подкрутка easing или duration не чинит это — размойте шов:

```css
.content {
  transition:
    filter 200ms ease,
    opacity 200ms ease;
}

.content.transitioning {
  filter: blur(2px);
  opacity: 0.7;
}
```

Без blur глаз читает два отдельных объекта, которые меняются местами. Blur сливает их в одно воспринимаемое превращение. Держите ниже 20px — тяжёлый blur дорог, особенно в Safari.

---

## Программно, без библиотеки

Когда motion нужен JS-контроль, но не зависимость, WAAPI даёт производительность уровня CSS:

```js
element.animate(
  [{ clipPath: 'inset(0 0 100% 0)' }, { clipPath: 'inset(0 0 0 0)' }],
  { duration: 1000, fill: 'forwards', easing: 'cubic-bezier(0.77, 0, 0.175, 1)' }
);
```

Hardware-accelerated, прерываемо, без стоимости бандла.

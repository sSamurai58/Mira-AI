# Picker

Вид picker — **не design-решение** — это эта спецификация. Копируйте разметку, CSS и wiring ниже verbatim; единственные значения, которые меняются за прогон — имена вариантов и их число. Он остаётся одинаковым во всех проектах, чтобы всегда читался как harness chrome, а не как часть оцениваемого дизайна. Не перестилизуйте его токенами, шрифтами или цветами проекта.

Это плавающая тёмная pill, bottom-center. Dark glass работает поверх любой страницы — светлой или тёмной — поэтому он не theme-aware.

## Разметка

Сначала sliding highlight span, по одной кнопке на вариант, hairline-divider, затем кнопка replay (только если хотя бы у одного варианта есть motion для повторного триггера):

```html
<nav class="proto-picker" aria-label="Prototype variants">
  <span class="proto-picker-highlight" aria-hidden="true"></span>
  <button class="proto-picker-item" data-active aria-current="true">Quiet</button>
  <button class="proto-picker-item">Editorial</button>
  <button class="proto-picker-item">Playful</button>
  <span class="proto-picker-divider" aria-hidden="true"></span>
  <button class="proto-picker-item proto-picker-replay" aria-label="Replay animation (R)">↻</button>
</nav>
```

В framework сохраняйте class names и структуру; меняется только синтаксис рендеринга.

## Стили

```css
.proto-picker {
  position: fixed;
  bottom: 24px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 2147483647;
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 4px;
  border-radius: 999px;
  background: rgba(10, 10, 10, 0.82);
  -webkit-backdrop-filter: blur(12px) saturate(1.4);
  backdrop-filter: blur(12px) saturate(1.4);
  box-shadow:
    0 0 0 1px rgba(255, 255, 255, 0.08) inset,
    0 8px 24px rgba(0, 0, 0, 0.24),
    0 2px 6px rgba(0, 0, 0, 0.12);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  font-size: 13px;
  line-height: 1;
  -webkit-font-smoothing: antialiased;
  user-select: none;
  -webkit-user-select: none;
}

.proto-picker-highlight {
  position: absolute;
  top: 4px;
  left: 0;
  height: 28px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.12);
}

/* The slide is enabled only after first paint (data-ready), so load doesn't animate. */
.proto-picker[data-ready] .proto-picker-highlight {
  transition:
    transform 250ms cubic-bezier(0.23, 1, 0.32, 1),
    width 250ms cubic-bezier(0.23, 1, 0.32, 1);
}

@media (prefers-reduced-motion: reduce) {
  .proto-picker[data-ready] .proto-picker-highlight { transition: none; }
}

.proto-picker-item {
  position: relative; /* sits above the highlight */
  display: flex;
  align-items: center;
  height: 28px;
  padding: 0 12px;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: rgba(255, 255, 255, 0.55);
  font: inherit;
  cursor: pointer;
  transition:
    color 150ms ease-out,
    transform 160ms cubic-bezier(0.23, 1, 0.32, 1);
}

@media (hover: hover) and (pointer: fine) {
  .proto-picker-item:hover {
    color: rgba(255, 255, 255, 0.85);
  }
}

.proto-picker-item:active {
  transform: scale(0.97);
}

.proto-picker-item:focus-visible {
  outline: 2px solid rgba(255, 255, 255, 0.4);
  outline-offset: 2px;
}

.proto-picker-item[data-active] {
  color: #fff;
}

.proto-picker-divider {
  width: 1px;
  height: 16px;
  margin: 0 4px;
  background: rgba(255, 255, 255, 0.12);
}

.proto-picker-replay {
  padding: 0 10px;
  font-size: 14px;
}

.proto-picker[data-position="top"] {
  bottom: auto;
  top: 24px;
}
```

## Правила

- **Verbatim.** Эти значения — спецификация. Никаких шрифтов проекта, брендовых цветов, theme switching, лишних теней или рамок.
- **Highlight скользит; swap варианта остаётся мгновенным.** Active pill анимируется между кнопками (250ms, strong ease-out) как spatial feedback самого picker — но превьюируемый вариант всё равно переключается без transition. Transition `width` — осознанное исключение из правила transform/opacity: элемент 28px в высоту, absolutely positioned и без layout-dependents, поэтому стоимость paint незначительна.
- **Одна разрешённая модификация:** если вариант занимает bottom-center экрана (toast stack, bottom sheet, dock), поставьте `data-position="top"`, чтобы picker никогда не перекрывал работу. Больше ничего в нём нельзя двигать или менять.
- **Replay условен.** Рендерите кнопку replay и её divider только когда хотя бы у одного варианта есть entrance или state-анимация, которую стоит перезапускать; статическое сравнение получает более короткую pill.

## Контракт поведения

Контракт фиксирован независимо от того, как harness рендерит:

- Цифровые клавиши `1–N` и `←`/`→` переключают варианты; `R` — replay. Игнорируйте key events, когда focus в input, textarea, select или contenteditable, или когда зажат modifier.
- Клик по элементу переключает на него; ровно один элемент несёт `data-active` и `aria-current="true"` в любой момент, и highlight скользит к нему.
- Выбор сохраняется между reload через URL-param (`?v=2`), fallback — вариант 1. Highlight берёт начальную позицию без анимации (`data-ready` добавляется после first paint).
- Переключение перемонтирует вариант (чтобы entrance-анимации перезапустились); клавиша replay перемонтирует без переключения.

## Эталонная обвязка

Verbatim для ветки standalone-HTML; в framework сохраните то же поведение, но выразите идиоматично (state вместо `innerHTML`, keyed re-mount вместо `requestAnimationFrame`, refs + layout effect для измерения highlight).

```js
// `variants` is an array of render functions, one per variant, in picker order.
const stage = document.getElementById('stage');
const picker = document.querySelector('.proto-picker');
const highlight = picker.querySelector('.proto-picker-highlight');
const items = [...picker.querySelectorAll('.proto-picker-item:not(.proto-picker-replay)')];
const replay = picker.querySelector('.proto-picker-replay');
let current = 0;

function moveHighlight() {
  const el = items[current];
  highlight.style.width = el.offsetWidth + 'px';
  highlight.style.transform = `translateX(${el.offsetLeft}px)`;
}

function mount(i) {
  stage.innerHTML = '';
  // Clear first, render next frame, so entrance animations re-run.
  requestAnimationFrame(() => { stage.innerHTML = variants[i](); });
}

function setActive(i) {
  if (i < 0 || i >= variants.length) return;
  current = i;
  items.forEach((el, j) => {
    el.toggleAttribute('data-active', j === i);
    if (j === i) el.setAttribute('aria-current', 'true');
    else el.removeAttribute('aria-current');
  });
  moveHighlight();
  const url = new URL(location);
  url.searchParams.set('v', i + 1);
  history.replaceState(null, '', url);
  mount(i);
}

items.forEach((el, i) => el.addEventListener('click', () => setActive(i)));
replay?.addEventListener('click', () => mount(current));
window.addEventListener('resize', moveHighlight);

document.addEventListener('keydown', (e) => {
  if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable) return;
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const num = parseInt(e.key, 10);
  if (num >= 1 && num <= variants.length) setActive(num - 1);
  else if (e.key === 'ArrowRight') setActive((current + 1) % variants.length);
  else if (e.key === 'ArrowLeft') setActive((current - 1 + variants.length) % variants.length);
  else if (e.key === 'r' || e.key === 'R') mount(current);
});

const requested = parseInt(new URLSearchParams(location.search).get('v'), 10);
setActive(requested >= 1 && requested <= variants.length ? requested - 1 : 0);
// Enable the slide only after first paint, so load doesn't animate.
requestAnimationFrame(() => requestAnimationFrame(() => picker.setAttribute('data-ready', '')));
```

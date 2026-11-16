---
name: team-designer-animate
description: Соберите анимацию с нуля, принимая решения в том порядке, от которого зависит, «попадёт» ли она — нужно ли анимировать вообще, какова цель, какой инструмент, какие свойства, какая кривая и длительность, как прерывается, как выходит. Пишет реализацию. Используйте, когда просят анимировать что-то, добавить motion, оживить компонент или собрать transition. Для критики существующего motion — review-animations; для аудита всего codebase — improve-animations.
---

> Вложено в `product-team/designer`. Применяйте правила craft сразу; не останавливайтесь на отдельном приветствии. Финальная сдача по-прежнему следует `designer/SKILL.md` и возвращается к менеджеру.


# Сборка анимаций

Строительный skill. Делает ОДНУ вещь: превращает запрос на motion в реализацию, которая выдержит строгий review. Не аудитит codebase (это `improve-animations`), не критикует diff (это `review-animations`), не ищет места, которые можно анимировать (это `find-animation-opportunities`), и не строит для React Native (это `animate-expo`).

## Рабочая поза

Вы — senior design engineer, который сам собирает анимацию. Планка — философия анимации Emil Kowalski: та же, что enforced в `review-animations`. Пишите так, чтобы пройти этот review с первого раза.

Два режима провала, и первый хуже:

1. **Анимировать то, что не должно анимироваться.** Gate ниже существует и для того, чтобы иногда выдавать ноль строк кода. Это успех, а не уклонение.
2. **Анимировать правильное с неправильными ингредиентами** — `ease-in` на entrance, `scale(0)`, keyframes на toast, длительность, из-за которой dropdown кажется вязким.

Никогда не подавайте варианты motion как меню. Примите решение, в одну строку сформулируйте обоснование, напишите код.

## Жёсткие правила

1. **Идите по последовательности по порядку.** Шаги 1 и 2 — gate для всего. Не беритесь за кривую, пока не ясно, анимируется ли вообще.
2. **Никаких приближённых значений.** Каждая кривая, длительность и spring-конфиг — из существующих токенов codebase или из таблиц ниже. Никогда не выдумывайте `cubic-bezier(0.4, 0, 0.2, 1)`, потому что «знакомо выглядит».
3. **Расширяйте токены codebase, не форкайте их.** Если уже есть `--ease-out` или шкала длительностей — используйте. Параллельная система — дефект.
4. **Reduced motion и hover-gating идут вместе с анимацией**, а не follow-up.
5. **Самый дешёвый инструмент, который работает.** Не ставьте motion-библиотеку ради fade.

## Последовательность сборки

### 1. Нужно ли это анимировать вообще?

| Частота | Решение |
| --- | --- |
| 100+ раз/день (keyboard shortcuts, переключение command palette) | **Без анимации. Никогда.** Стоп здесь. |
| Десятки раз/день (hover-эффекты, навигация по списку) | Только почти незаметное — быстро и тонко, либо ничего |
| Иногда (modals, drawers, toasts) | Стандартная анимация |
| Редко / в первый раз (onboarding, success, celebration) | Здесь живёт budget на delight |

**Действия, инициированные с клавиатуры — дисквалификатор, а не предмет суждения.** У Raycast нет open/close-анимации — это правильно для того, что открывают сотни раз в день.

Если запрос не проходит этот gate — скажите прямо и не пишите анимацию. Вместо этого предложите альтернативу без motion (мгновенная смена состояния, статичный affordance).

### 2. Какова цель?

Назовите её одним из этих слов, прежде чем продолжать:

- **Feedback** — подтверждение, что интерфейс услышал пользователя
- **Spatial consistency** — показать, откуда что-то пришло или куда ушло
- **State indication** — сделать смену состояния читаемой
- **Preventing a jarring change** — связать контент, который иначе телепортировался бы
- **Explanation** — показать, как что-то работает (только marketing/onboarding)
- **Delight** — разрешён *только* на уровне rare/first-time

Не можете назвать? Не стройте. «Выглядит круто» на часто видимом элементе — повод остановиться.

Также проверьте **функцию**: данные, которые пользователь читает или по которым действует, не должны двигаться ради стиля. Декоративный mouse-tracking уместен на marketing-странице, а не на графике в banking-приложении.

### 3. Выберите инструмент — самый дешёвый, который работает

Идите вниз; остановитесь на первом подходящем.

| Нужно | Инструмент |
| --- | --- |
| Hover, press, цвет, toggle состояния через class или attribute | **CSS transition** |
| Entry-анимация при mount, без JS state | **CSS `@starting-style`** |
| Заранее заданный motion, который должен оставаться плавным, пока страница занята загрузкой | **CSS animation** (`transform`/`opacity` идут на compositor) |
| Программный контроль с CSS-производительностью, без библиотеки | **WAAPI** (`element.animate()`) |
| Springs, layout-анимации, exit-анимации, gesture-driven значения | **Motion** (`motion.dev`) |

CSS-анимации выигрывают у JS под нагрузкой — на `transform`/`opacity` они идут на compositor, а анимация на `requestAnimationFrame` теряет кадры, пока браузер грузит, исполняет скрипты или красит. Используйте CSS для заранее заданного motion, JS — для динамического и прерываемого.

Если нужна *компонента*, а не анимация — toast, drawer, command menu, dropdown — остановитесь и прочитайте `../pick-ui-library/SKILL.md`, чтобы выбрать. Самописные варианты часто заканчиваются `<div>`-dropdown без focus management.

### 4. Выберите свойства

- **Только `transform` и `opacity`.** Они пропускают layout и paint и идут на GPU. `width`/`height`/`margin`/`padding`/`top`/`left` триггерят все три. (`clip-path` — санкционированное четвёртое — см. RECIPES.md. `height` допустим только для accordion, где нет эквивалента на transform.)
- **Никогда `scale(0)`.** Стартуйте с `scale(0.9–0.97)` + `opacity: 0`. В реальном мире ничто не появляется из ничего.
- **`transform-origin` у trigger** для popovers, dropdowns, menus, tooltips — `var(--transform-origin)` в Base UI. **Modals исключены**; они не привязаны к trigger, поэтому остаются по центру.
- **Проценты в `translate()`** относительны размеру самого элемента — `translateY(100%)` сдвигает на его высоту независимо от контента. Предпочитайте hardcoded-пикселям.
- **В Motion новейшие версии аппаратно ускоряют независимые transforms вроде `x`/`y`/`scale`/`rotate`.**

```jsx
<motion.div animate={{ x: 100 }} />                          // motion 14.2+: hardware accelerated
<motion.div animate={{ transform: "translateX(100px)" }} />  // hardware accelerated in every version
```

- **Никогда не ведите transform ребёнка из CSS-переменной на родителе** — это пересчитывает стили для каждого ребёнка. Ставьте `transform` прямо на элемент.

### 5. Easing и duration — или spring

**Easing**, в порядке решений:

| Ситуация | Easing |
| --- | --- |
| Entering или exiting | `ease-out` |
| Moving / morphing на экране | `ease-in-out` |
| Hover / смена цвета | `ease` |
| Постоянное движение (marquee, progress) | `linear` |
| Default | `ease-out` |

**Никогда `ease-in` на UI.** Он стартует медленно и откладывает именно тот момент, который смотрит пользователь. `ease-out` на 200ms *ощущается* быстрее, чем `ease-in` на 200ms.

Встроенные CSS-easing слишком слабые. Используйте эти:

```css
--ease-out: cubic-bezier(0.23, 1, 0.32, 1);        /* strong ease-out for UI */
--ease-in-out: cubic-bezier(0.77, 0, 0.175, 1);    /* strong ease-in-out for on-screen movement */
--ease-drawer: cubic-bezier(0.32, 0.72, 0, 1);     /* iOS-like drawer curve (Ionic) */
```

Нужна кривая, которой здесь нет? Берите с [easing.dev](https://easing.dev/) или [easings.co](https://easings.co/). Не катите свою вручную.

**Duration:**

| Элемент | Duration |
| --- | --- |
| Feedback нажатия кнопки | 100–160ms |
| Tooltips, мелкие popovers | 125–200ms |
| Dropdowns, selects | 150–250ms |
| Modals, drawers | 200–500ms |
| Marketing / explanatory | Может быть длиннее |

**UI-анимации остаются под 300ms. Modals, drawers, sheets и toasts — документированные исключения.** Dropdown на 180ms ощущается отзывчивее, чем на 400ms.

**Беритесь за spring вместо этого**, когда motion — drag с импульсом, элемент должен ощущаться «живым», жест пользователь может прервать или развернуть, или декоративный mouse-tracking:

```js
{ type: "spring", duration: 0.5, bounce: 0.2 }        // Apple-style — easier to reason about
{ type: "spring", mass: 1, stiffness: 100, damping: 10 }  // traditional physics — more control
```

Держите bounce в 0.1–0.3 и избегайте bounce в большинстве UI — оставляйте его для drag-to-dismiss и игровых взаимодействий.

### 6. Прерывание и выход

- **Transitions, не keyframes, для всего, что триггерится часто** — toasts, toggles, всё, что пользователь может запустить дважды за секунду. Transitions перенацеливаются с текущего значения; keyframes стартуют с нуля.
- **Springs для жестов**, потому что они несут velocity через прерывание.
- **Выходите так же, как входили.** Toast, который въезжает снизу, уходит вниз. Симметричные пути делают swipe-to-dismiss очевидным.
- **Асимметричный timing там, где решает пользователь.** Медленно на осознанной фазе (hold-to-confirm: 2s linear), snappy на ответе системы (release: 200ms ease-out).

### 7. Reduced motion и pointer gating

Идут с анимацией каждый раз.

```css
@media (prefers-reduced-motion: reduce) {
  .element { animation-name: fade; } /* same timing, opacity only — drop transform-based motion */
}

@keyframes fade { from { opacity: 0; } }

@media (hover: hover) and (pointer: fine) {
  .element:hover { transform: scale(1.05); } /* touch fires false hovers on tap */
}
```

```jsx
const reduce = useReducedMotion();
const closedX = reduce ? 0 : '-100%';
```

Reduced motion значит **меньше и мягче** анимаций, не ноль — оставляйте transitions, которые помогают пониманию, убирайте движение и смену позиции.

## Рецепты

Готовые к сборке реализации типичных кейсов — button press, dropdown, tooltip, modal, drawer, toast, accordion, stagger, hold-to-confirm, tab indicator, scroll reveal, drag-to-dismiss — см. [RECIPES.md](RECIPES.md). Подгружайте, когда запрос совпадает с одним из этих компонентов; стартуйте с recipe, а не с пустого файла.

## Нельзя выпускать

Self-check перед финишем. Каждый пункт — автоматический блок в `review-animations`:

| Никогда | Вместо этого |
| --- | --- |
| `transition: all` | Назовите точные свойства |
| `transform: scale(0)` на entrance | `scale(0.95)` + `opacity: 0` |
| `ease-in` на UI-элементе | `ease-out` или сильная custom-кривая |
| Встроенный `ease-out` на осознанной анимации | `cubic-bezier(0.23, 1, 0.32, 1)` |
| Анимация на keyboard shortcut или действии 100+/день | Без анимации |
| UI duration свыше 300ms без причины | 150–250ms |
| `transform-origin: center` на popover, привязанном к trigger | `var(--transform-origin)` (modals exempt) |
| Keyframes на toasts, toggles, часто триггерящихся элементах | CSS transitions |
| Анимация `width`/`height`/`margin`/`padding`/`top`/`left` | `transform` / `opacity` |
| Motion-пропсы `x`/`y`/`scale` под нагрузкой на версиях до 14.2 | Upgrade до 14.2+ или полная строка `transform` |
| Ungated `:hover` motion | `@media (hover: hover) and (pointer: fine)` |
| Нет `prefers-reduced-motion` | Более мягкий вариант, не ноль |
| Всё входит сразу | Stagger 30–80ms |

## Выход

Напишите код. Затем максимум в несколько строк:

- **Результат gate** — tier частоты и названная цель. Если что-то в запросе отклонено — скажите что и почему.
- **Ингредиенты** — инструмент, свойства, кривая, duration или spring-конфиг, по одной строке каждый.
- **Что проверить на ощупь** — если результат зависит от feel, который нельзя судить по коду (crossfade, bounce spring, баланс opacity/height во входящем списке), скажите это и укажите проверку: проиграйте на 2–5× duration или в DevTools animation inspector, пройдите кадр за кадром, протестируйте жесты на реальном устройстве и посмотрите снова на следующий день свежим взглядом.

Не раздувайте это в отчёт. Код — deliverable.

## Тон

Opinionated и кратко. Когда честный ответ — «это не должно анимироваться», дайте его: этот ответ — причина существования skill. Когда feel действительно нельзя зафиксировать по коду — скажите так, вместо угадывания значения.

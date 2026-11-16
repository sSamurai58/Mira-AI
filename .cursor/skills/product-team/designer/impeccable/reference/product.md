# Регистр product

Когда дизайн СЛУЖИТ продукту: app UIs, admin dashboards, settings panels, data tables, tools, authenticated surfaces — всё, где пользователь в задаче.

## Тест product-slop

Не «скажут ли, что это сделал AI». Знакомость здесь часто фича. Тест: сядет ли пользователь, владеющий лучшими инструментами категории (Linear, Figma, Notion, Raycast, Stripe), и доверится ли интерфейсу — или будет спотыкаться о каждый чуть «не тот» компонент?

Failure mode product UI — не плоскость, а странность без цели: переукрашенные кнопки, несогласованные form controls, бессмысленный motion, display fonts там, где должны быть labels, выдуманные affordances для стандартных задач. Планка — earned familiarity. Инструмент должен раствориться в задаче.

## Типографика

- **System fonts легитимны.** `-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif` даёт native feel на каждой платформе. Inter — распространённый cross-platform default не зря.
- **Одной семьи часто достаточно.** Product UI не нужны пары display/body. Хорошо настроенный sans несёт headings, buttons, labels, body, data.
- **Фиксированная rem-шкала, не fluid.** Clamp-заголовки не служат product UI. Пользователи смотрят при стабильном DPI, а fluid h1, сжимающийся в sidebar, выглядит хуже, не лучше.
- **Более плотный scale ratio.** Типично 1.125–1.2 между ступенями. Типографических элементов здесь больше, чем на brand surfaces; преувеличенный контраст создаёт шум.
- **Длина строки всё ещё важна для prose** (65–75ch). Data и компактный UI могут быть плотнее; таблицы на 120ch+ — нормально.

## Цвет

Product по умолчанию Restrained. Одна поверхность может заработать Committed (dashboard, где один category color несёт отчёт; onboarding с drenched welcome screen), но Restrained — пол.

- Богатый semantic vocabulary состояний: hover, focus, active, disabled, selected, loading, error, warning, success, info. Стандартизируйте их.
- Accent color — только для primary actions, текущего selection и state indicators, не для декора.
- Второй нейтральный слой для sidebars, toolbars и panels (чуть холоднее или теплее поверхности контента).

## Раскладка

- Предсказуемые grids. Consistency И ЕСТЬ affordance; пользователи ориентируются быстрее, когда структура ожидаема.
- Знакомые паттерны — фичи. Стандартная навигация (top bar, side nav), breadcrumbs, tabs и form layouts имеют устоявшиеся ожидания. Не изобретайте ради вкуса.
- Responsive behavior — структурный (свернуть sidebar, responsive table, колонки по breakpoints), не fluid typography.

## Компоненты

У каждого interactive component есть: default, hover, focus, active, disabled, loading, error. Не шипьте с половиной из них.

- Skeleton states для загрузки, не spinners посреди контента.
- Empty states, которые учат интерфейсу, а не «nothing here».
- Согласованные affordances по всей поверхности. Одна форма кнопки. Один словарь form-control. Один стиль иконок.

## Движение

- 150–250 ms на большинстве transitions. Пользователи в потоке; не заставляйте ждать хореографию.
- Motion передаёт состояние, не декор. Смена состояния, feedback, loading, reveal — больше ничего.
- Никаких оркестрованных page-load sequences. Product загружается в задачу; пользователи не хотят смотреть, как он грузится.

## Product bans (поверх общих абсолютных bans)

- Декоративный motion, не передающий состояние.
- Несогласованный словарь компонентов между экранами. Если кнопка «save» выглядит по-разному в двух местах — одно из них неверно.
- Display fonts в UI labels, buttons, data.
- Изобретение стандартных affordances ради вкуса (кастомные scrollbars, странные form controls, нестандартные modals).
- Тяжёлый цвет или full-saturation accents на неактивных состояниях.

## Разрешения product-регистра

Product может себе то, чего не могут brand surfaces.

- System fonts и знакомые sans defaults (Inter, SF Pro, system-ui stacks).
- Стандартные паттерны навигации: top bar + side nav, breadcrumbs, tabs, command palettes.
- Density. Таблицы со множеством строк, панели со множеством labels, плотная информация, когда она нужна.
- Consistency важнее surprise. Один и тот же visual vocabulary от экрана к экрану — добродетель; delight приберегают для моментов, не для страниц.

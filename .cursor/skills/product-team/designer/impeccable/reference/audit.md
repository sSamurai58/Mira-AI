Запустите системные **технические** проверки качества и сгенерируйте comprehensive report. Не исправляйте issues; документируйте их для других команд.

Это code-level audit, а не design critique. Проверяйте то, что измеримо и верифицируемо в реализации.

## Диагностическое сканирование

Запустите comprehensive checks по 5 измерениям. Оцените каждое измерение 0–4 по критериям ниже.

### 1. Доступность (A11y)

**Проверяйте**:
- **Проблемы контраста**: Text contrast ratios < 4.5:1 (или 7:1 для AAA)
- **Missing ARIA**: Interactive elements без proper roles, labels или states
- **Keyboard navigation**: Missing focus indicators, illogical tab order, keyboard traps
- **Semantic HTML**: Improper heading hierarchy, missing landmarks, divs вместо buttons
- **Alt text**: Missing или poor image descriptions
- **Проблемы форм**: Inputs без labels, poor error messaging, missing required indicators

**Оценка 0–4**: 0=Inaccessible (fails WCAG A), 1=Major gaps (мало ARIA labels, нет keyboard nav), 2=Partial (есть a11y effort, значительные gaps), 3=Good (WCAG AA mostly met, minor gaps), 4=Excellent (WCAG AA fully met, approaches AAA)

### 2. Производительность

**Проверяйте**:
- **Layout thrashing**: Reading/writing layout properties в циклах
- **Expensive animations**: Casual layout-property animation, unbounded blur/filter/shadow effects или эффекты, visibly drop frames
- **Missing optimization**: Images без lazy loading, unoptimized assets, missing will-change
- **Bundle size**: Unnecessary imports, unused dependencies
- **Render performance**: Unnecessary re-renders, missing memoization

**Оценка 0–4**: 0=Severe issues (layout thrash, unoptimized everything), 1=Major problems (нет lazy loading, expensive animations), 2=Partial (есть optimization, gaps remain), 3=Good (mostly optimized, minor improvements possible), 4=Excellent (fast, lean, well-optimized)

### 3. Темы

**Проверяйте**:
- **Hard-coded colors**: Цвета без design tokens
- **Broken dark mode**: Missing dark mode variants, poor contrast в dark theme
- **Inconsistent tokens**: Wrong tokens, mixing token types
- **Theme switching issues**: Values, которые не обновляются при смене theme

**Оценка 0–4**: 0=No theming (hard-coded everything), 1=Minimal tokens (mostly hard-coded), 2=Partial (tokens exist but inconsistently used), 3=Good (tokens used, minor hard-coded values), 4=Excellent (full token system, dark mode works perfectly)

### 4. Адаптивный дизайн

**Проверяйте**:
- **Fixed widths**: Hard-coded widths, ломающиеся на mobile
- **Touch targets**: Interactive elements < 44x44px
- **Horizontal scroll**: Content overflow на узких viewports
- **Text scaling**: Layouts, ломающиеся при увеличении text size
- **Missing breakpoints**: Нет mobile/tablet variants

**Оценка 0–4**: 0=Desktop-only (breaks on mobile), 1=Major issues (some breakpoints, many failures), 2=Partial (works on mobile, rough edges), 3=Good (responsive, minor touch target or overflow issues), 4=Excellent (fluid, all viewports, proper touch targets)

### 5. Антипаттерны (КРИТИЧНО)

Проверьте против ВСЕХ **DON'T** guidelines из родительского impeccable skill (уже загружены в этом контексте). Ищите AI slop tells (AI color palette, gradient text, glassmorphism, hero metrics, card grids, generic fonts) и общие design anti-patterns (gray on color, nested cards, bounce easing, redundant copy).

**Оценка 0–4**: 0=AI slop gallery (5+ tells), 1=Heavy AI aesthetic (3–4 tells), 2=Some tells (1–2 noticeable), 3=Mostly clean (subtle issues only), 4=No AI tells (distinctive, intentional design)

## Сгенерируйте Report

### Оценка здоровья аудита

| # | Dimension | Score | Key Finding |
|---|-----------|-------|-------------|
| 1 | Accessibility | ? | [most critical a11y issue or "--"] |
| 2 | Performance | ? | |
| 3 | Responsive Design | ? | |
| 4 | Theming | ? | |
| 5 | Anti-Patterns | ? | |
| **Total** | | **??/20** | **[Rating band]** |

**Rating bands**: 18–20 Excellent (minor polish), 14–17 Good (address weak dimensions), 10–13 Acceptable (significant work needed), 6–9 Poor (major overhaul), 0–5 Critical (fundamental issues)

### Вердикт по антипаттернам
**Начните здесь.** Pass/fail: Выглядит ли это AI-generated? Перечислите конкретные tells. Будьте brutally honest.

### Краткое резюме
- Audit Health Score: **??/20** ([rating band])
- Всего найдено issues (count by severity: P0/P1/P2/P3)
- Top 3–5 critical issues
- Recommended next steps

### Детальные находки по severity

Тегируйте каждый issue **severityстью P0–P3**:
- **P0 Blocking**: Мешает завершению задачи. Исправляйте immediately
- **P1 Major**: Значительная трудность или WCAG AA violation. Исправляйте before release
- **P2 Minor**: Annoyance, workaround существует. Исправляйте в следующем проходе
- **P3 Polish**: Nice-to-fix, нет реального user impact. Исправляйте если есть время

Для каждого issue документируйте:
- **[P?] Issue name**
- **Location**: Component, file, line
- **Category**: Accessibility / Performance / Theming / Responsive / Anti-Pattern
- **Impact**: Как это влияет на пользователей
- **WCAG/Standard**: Какой стандарт нарушает (если применимо)
- **Recommendation**: Как исправить
- **Suggested command**: Какую команду использовать (prefer: $impeccable adapt, $impeccable animate, $impeccable audit, $impeccable bolder, $impeccable clarify, $impeccable colorize, $impeccable critique, $impeccable delight, $impeccable distill, $impeccable document, $impeccable harden, $impeccable layout, $impeccable onboard, $impeccable optimize, $impeccable overdrive, $impeccable polish, $impeccable quieter, $impeccable shape, $impeccable typeset)

### Паттерны и системные проблемы

Выявите recurring problems, указывающие на systemic gaps, а не one-off mistakes:
- «Hard-coded colors appear in 15+ components, should use design tokens»
- «Touch targets consistently too small (<44px) throughout mobile experience»

### Положительные находки

Отметьте, что работает хорошо: good practices для поддержания и replication.

## Рекомендуемые действия

Перечислите recommended commands в порядке приоритета (P0 first, затем P1, затем P2):

1. **[P?] `$command-name`**: Brief description (specific context from audit findings)
2. **[P?] `$command-name`**: Brief description (specific context)

**Rules**: Рекомендуйте только команды из: $impeccable adapt, $impeccable animate, $impeccable audit, $impeccable bolder, $impeccable clarify, $impeccable colorize, $impeccable critique, $impeccable delight, $impeccable distill, $impeccable document, $impeccable harden, $impeccable layout, $impeccable onboard, $impeccable optimize, $impeccable overdrive, $impeccable polish, $impeccable quieter, $impeccable shape, $impeccable typeset. Мапьте findings на наиболее подходящую команду. Заканчивайте `$impeccable polish` как финальный шаг, если рекомендовались любые fixes.

После представления summary скажите пользователю:

> You can ask me to run these one at a time, all at once, or in any order you prefer.
>
> Re-run `$impeccable audit` after fixes to see your score improve.

**IMPORTANT**: Будьте thorough but actionable. Слишком много P3 issues создаёт шум. Фокусируйтесь на том, что действительно важно.

**NEVER**:
- Не репортите issues без объяснения impact (почему это важно?)
- Не давайте generic recommendations (будьте specific and actionable)
- Не пропускайте positive findings (celebrate what works)
- Не забывайте приоритизировать (не всё может быть P0)
- Не репортите false positives без verification

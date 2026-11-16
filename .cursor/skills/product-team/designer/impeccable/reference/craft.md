# Поток Craft

Создайте фичу с impeccable UX и UI quality: сформируйте дизайн, зафиксируйте визуальное направление, напишите реальный production-код, инспектируйте и улучшайте in-browser, пока не достигнут уровень high-end studio.

Перед написанием кода нужно: загруженный PRODUCT.md, определённый register и загруженный matching reference, а также подтверждённое дизайн-направление для этой задачи (из `shape` или от пользователя). PRODUCT.md — контекст проекта, а не task-specific бриф.

Относитесь к любому одобренному визуальному направлению (сгенерированный mock или заявленный референс) как к конкретному контракту для композиции, иерархии, плотности, атмосферы, фирменных мотивов и distinctive визуальных ходов. Не позволяйте мокам заменить структуру, копирайт, accessibility или дизайн состояний. Но если живой результат лишён основных ингредиентов одобренного направления — реализация неверна.

### Gates: не сжимайте

У Craft **несколько user gates**, не один. Когда harness имеет нативную генерацию изображений (Codex через `image_gen`), последовательность гейтов до кода:

1. **Shape brief подтверждён** (Step 1)
2. **Вопросы направления отвечены** (codex.md Step A)
3. **Палитра подтверждена** (codex.md Step B)
4. **Одно направление мока одобрено или делегировано** (codex.md Step D)

Вы должны останавливаться на каждом гейте. **Одно подтверждение shape НЕ зелёный свет начинать кодить.** Это зелёный свет начать codex.md Step A. Сжатие гейтов 2–4 потому что shape-бриф казался полным — доминирующий failure mode этого потока.

Когда harness не имеет нативной генерации изображений, гейты 2–4 схлопываются в сам бриф, и подтверждение shape действительно ведёт сразу к коду.

## Step 0: Фундамент проекта

До shape, до кода: разберитесь, в каком проекте вы работаете.

Посмотрите рабочую директорию. Выполните `ls`. Проверьте:

- Существующий framework: `astro.config.mjs/ts`, `next.config.js/ts`, `nuxt.config.ts`, `svelte.config.js`, `vite.config.js/ts`, `package.json` с framework deps, `Cargo.toml` + Leptos/Yew, `Gemfile` + Rails. **Если найден — используйте его.** Не запускайте параллельный build, не вводите второй framework, не пишите напрямую в `dist/` или `build/`. Какой бы pipeline у проекта ни был — уважайте его.
- Существующая component library или design system: `src/components/`, `app/components/`, `tokens.css` / `theme.ts`, `astro.config` `integrations`. Прочитайте, что есть, прежде чем добавлять.
- Существующий icon set: `lucide-react`, `@phosphor-icons/react`, `@iconify/*`, hand-rolled SVG sprites в `assets/icons/`. **Используйте то, что уже в проекте**; не вводите второй set.

Если директория пуста (greenfield), не выбирайте framework молча. Спросите пользователя через AskUserQuestion tool, с разумными defaults, обрамлёнными брифом:

```text
What should this be built on?
  - Astro (default for content-led brand sites, landing pages, marketing surfaces)
  - SvelteKit / Next.js / Nuxt (when the brief implies an app surface or significant interactivity)
  - Single index.html (one-shot demo, prototype, or a deliberately framework-free experiment)
```

Default: Astro для brand-брифов, существующий framework проекта для product-брифов. Спросите один раз; не переспрашивайте mid-task.

## Step 1: Сформируйте дизайн

Запустите $impeccable shape, передав описание фичи от пользователя. Shape **обязателен** для craft; он производит подтверждённое направление.

Представьте вывод shape и остановитесь. Дождитесь, пока пользователь подтвердит, override'нет или скорректирует курс, прежде чем писать код.

Если пользователь уже дал подтверждённый бриф или запускал shape отдельно — используйте его и пропустите этот шаг.

Когда исходный prompt + PRODUCT.md уже отвечают на scope, content и visual direction без реальной неоднозначности, вывод shape может быть **компактным** (3–5 bullets о том, что строите и visual lane, заканчиваясь одним-двумя конкретными вопросами или «confirm or override»). Полный 10-секционный structured brief — для действительно неоднозначных, multi-screen или stakeholder-heavy задач. Не раздувайте ясный бриф в длинный, чтобы выглядеть thorough; равно не пропускайте паузу, чтобы выглядеть efficient.

Если harness имеет нативную генерацию изображений (Codex), «confirm or override» компактного shape продвигает к **Step 3 и потоку codex.md**, а не к Step 4. Формулируйте closing line соответственно: «Confirm or override; once we lock direction, I'll run a couple of palette and reference questions before generating any mocks.» Это не даёт модели читать подтверждение shape как code-green.

## Step 2: Загрузите references

На основе секции «Recommended References» дизайн-брифа обратитесь к релевантным impeccable reference files. Как минимум всегда консультируйте:

- [spatial-design.md](spatial-design.md) для layout и spacing
- [typography.md](typography.md) для type hierarchy

Затем добавьте references по нуждам брифа:
- Сложные interactions или forms? Консультируйте [interaction-design.md](interaction-design.md)
- Animation или transitions? Консультируйте [motion-design.md](motion-design.md)
- Color-heavy или themed? Консультируйте [color-and-contrast.md](color-and-contrast.md)
- Responsive requirements? Консультируйте [responsive-design.md](responsive-design.md)
- Много копирайта, labels или errors? Консультируйте [ux-writing.md](ux-writing.md)

## Step 3: Визуальное направление и ассеты (Harness-Gated)

Если harness имеет **нативную генерацию изображений** (сейчас Codex через `image_gen`), этот шаг обязателен. **Остановитесь и загрузите [codex.md](codex.md)**. Он покрывает генерацию палитры, исследование моков, цикл одобрения, mock-fidelity inventory и нарезку ассетов через субагента `impeccable_asset_producer`. Следуйте Steps A–F в том файле, затем вернитесь сюда к Step 4.

Если harness не имеет нативной генерации изображений, **скажите одной строкой, что шаг visual-direction-by-generation пропускается, потому что harness не имеет нативной генерации изображений, затем продолжайте**. One-line announcement обязателен; он форсирует сознательное решение вместо тихого испарения шага. Бриф — ваш единственный визуальный референс. Реализуйте напрямую из него, относясь к любым named anchor references и «Design Direction» брифа как к контракту.

Генерировали вы моки или нет: не заменяйте требуемое imagery generic cards, bullets, emoji, fake metrics, декоративными CSS panels или filler copy. Image-led брифы (рестораны, отели, magazines, photography, hobbyist communities, food, travel, fashion, product) нуждаются в реальном или sourced imagery в билде, а не CSS scenery.

## Step 4: Стройте до Production Quality

**Precondition.** Если Step 3 направил вас в codex.md (нативная генерация изображений доступна), Steps A–D в том файле должны быть завершены до любого кода: вопросы отвечены, палитра подтверждена, моки сгенерированы, одно направление одобрено или делегировано. **Не упоминайте implementation, file paths или patch plans, пока это не сделано.** Подтверждённый shape-бриф недостаточен; модель, которая сжала эти гейты — модель, которая уже провалила этот поток.

Реализуйте фичу по дизайн-брифу. Стройте проходами, чтобы структура, visual system, states, motion/media и responsive behavior каждый получили deliberate внимание. Список ниже — definition of done, а не inspiration.

### Production-планка

- **Реальный контент.** Нет placeholder copy, placeholder images, dead links, fake controls или unused scaffold к моменту презентации.
- **Сохраните основные ингредиенты одобренного мока.** Missing hero objects, world/product imagery, section structure, CTA/nav treatment или distinctive motifs — blocking defects, если пользователь не принял изменение.
- **Semantic first.** Реальные headings, landmarks, labels, form associations, button/link semantics, accessible names, state announcements где нужно.
- **Deliberate spacing и alignment.** Нет default gaps, произвольных margins, unbalanced whitespace или accidental optical misalignment.
- **Intentional typography.** Выбранная loading strategy, ясная иерархия, readable measure, стабильные line breaks, нет overflow на любой ширине.
- **Реалистичное покрытие состояний.** Default, hover, focus-visible, active, disabled, loading, error, success, empty, overflow, long/short text, first-run.
- **Finished interaction quality.** Keyboard paths, touch targets, feedback timing, scroll behavior, state transitions, нет hover-only functionality.
- **Coherent icon set.** Используйте установленный set проекта; иначе выберите одну library или accessible text. Не смешивайте.
- **Уважайте build pipeline.** Редактируйте source files и запускайте build проекта (`npm run build` или эквивалент). Не пишите в `build/` / `dist/` / `.next/` через `cat`, heredoc или Bash redirects; это пропускает asset hashing, image optimization, code splitting и CSS extraction и даёт output, который dev server не отдаст.
- **Проверяйте image URLs до ссылок.** Используйте image-search MCP или web-fetch когда доступны; угаданные photo IDs ship как broken-image placeholders. Без верификации предпочитайте меньше изображений, в которых уверены.
- **Оптимизированные imagery и media.** Корректные dimensions, полезный alt text, lazy loading below the fold, modern formats когда практично, responsive `srcset`/`picture` для raster, ни один project-referenced asset не оставлен вне workspace.
- **Premium motion.** Используйте atmospheric blur, filter, mask, shadow, reveal, когда они улучшают опыт. Избегайте casual layout-property animation, ограничивайте expensive effects, проверяйте smoothness in-browser, уважайте reduced motion и избегайте хореографии, блокирующей выполнение задач.
- **Maintainable.** Переиспользуемые локальные паттерны, ясные границы компонентов, conventions проекта. Нет rasterized UI text или one-off hacks, когда существует локальный паттерн.
- **Technically clean.** Production build проходит, нет console errors, нет avoidable layout shift, нет needless dependencies, нет broken asset paths.
- **Спрашивайте при неопределённости.** Если discovery существенно меняет бриф или одобренное направление — остановитесь и спросите. Не угадывайте.

## Step 5: Итерируйте визуально

Смотрите на то, что построили, как дизайнер. Ваши глаза — то, что даёт harness: connected browser, screenshotting tool, Playwright или вопрос пользователю. Используйте их для responsive testing (минимум mobile, tablet, desktop) и общей визуальной валидации.

Если инструмент возвращает file path — прочитайте PNG обратно в разговор. Screenshot, который вы не прочитали, не считается.

Для long-form brand-поверхностей инспектируйте major sections индивидуально. Thumbnails скрывают spacing, clipping и cascade defects.

После первого прохода напишите честный critique против брифа, основных ингредиентов одобренного мока (hero silhouette, motifs, imagery, nav/CTA, density) и DON'Ts impeccable. Исправьте material defects и переинспектируйте. **Не изобретайте defects, чтобы продемонстрировать iteration.** Уверенное «first pass clean, shipping» бьёт fake fix.

Активно проверяйте: responsive behavior (composes, not shrinks), каждое состояние (empty / error / loading / edge), craft details (spacing, alignment, hierarchy, contrast, motion timing, focus), performance basics. Exit bar: защитимо на high-end studio review.

Detector или QA output — только evidence дефектов; никогда не proof, что работа закончена.

## Step 6: Представьте

Представьте результат пользователю:
- Покажите фичу в primary state
- Суммируйте проверенные browser/viewports и важнейшие fixes после inspection
- Пройдитесь по ключевым состояниям (empty, error, responsive)
- Объясните дизайн-решения, связанные с дизайн-брифом и, когда использовался, выбранным north-star mock. Включите любые принятые отклонения от мока; не скрывайте unimplemented mock ingredients.
- Честно отметьте оставшиеся limitations или follow-up risks
- Спросите: «Что работает? Что нет?»

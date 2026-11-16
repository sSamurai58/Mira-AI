> **Нужен дополнительный контекст**: планка качества (MVP vs flagship).

Сделайте тщательный финальный проход, чтобы поймать все мелкие детали, отделяющие хорошую работу от отличной. Разница между shipped и polished.

Detector и automated QA — только доказательства дефектов. Чистый результат скрипта никогда не доказывает сильный дизайн; соберите browser evidence и проверьте реальный путь взаимодействия.

## Обнаружение дизайн-системы

Выравнивание фичи под design system — **не опционально**. Polish без выравнивания — декор поверх drift, и усложняет работу следующему. Discovery идёт до любой другой polish-работы.

1. **Найдите design system**: ищите документацию design system, component libraries, style guides или определения токенов. Изучите ключевые паттерны: design principles, целевая аудитория, color tokens, spacing scale, typography styles, component API, motion conventions.
2. **Зафиксируйте conventions**: как импортируются shared components? Какая spacing scale? Какие цвета из токенов, а какие hard-coded? Какие паттерны motion и взаимодействия устоялись? Какие формы flow для сопоставимых действий (modal vs full-page, inline vs route, save-on-blur vs explicit submit)?
3. **Выявите drift, затем назовите корневую причину**: для каждого отклонения классифицируйте как **missing token** (значение должно быть в системе, но его нет), **one-off implementation** (shared component уже есть, но не использован) или **conceptual misalignment** (flow, IA или иерархия фичи не совпадает с соседними). Фикс зависит от категории: поправить значение, перейти на shared component или переработать flow. Лечить симптом без названия причины — как drift накапливается.

Если design system есть, polish **должен** выровнять фичу под него. Если нет — polish против conventions, видимых в кодовой базе. **Если что-то в системе неоднозначно — спросите. Никогда не угадывайте принципы design system.**

## Оценка до polish

Поймите текущее состояние и цели, прежде чем трогать что-либо:

1. **Проверьте completeness**:
   - Функционально ли завершено?
   - Есть ли известные issues, которые нужно сохранить (пометить TODO)?
   - Какова планка качества? (MVP vs flagship feature?)
   - Когда шипится? (Сколько времени на polish?)

2. **Думайте experience-first**: кто реально это использует, и какой лучший возможный опыт для них? Эффективный дизайн бьёт декоративный polish; фича, которая красива, но борется с потоком пользователя, не polished. Пройдите путь с их точки зрения до открытия DevTools.

3. **Определите области polish**:
   - Визуальные несогласованности
   - Проблемы spacing и alignment
   - Пробелы в interaction states
   - Несогласованности copy
   - Edge cases и error states
   - Плавность loading и transitions
   - Drift information architecture и flow (раскрывает ли фича сложность так же, как соседние?)

4. **Подтяните предыдущий critique** (опциональный сигнал): если `$impeccable critique` уже запускался на ту же цель, его priority issues — полезный prior для того, что чинить первым. Разрешите цель в file path или URL, затем:
   ```bash
   slug=$(node .agents/skills/impeccable/scripts/critique-storage.mjs slug "<resolved>")
   node .agents/skills/impeccable/scripts/critique-storage.mjs latest "$slug"
   ```
   Exit 0 с телом = найдено; включите P0/P1 в ваш polish list и укажите путь к snapshot, чтобы пользователь видел, что вы прочитали. Exit 2 = нет snapshot, продолжайте без него. Critique — один вход среди многих. В любом случае делайте свой проход.

5. **Триаж cosmetic vs functional**: классифицируйте каждый issue как **cosmetic** (выглядит странно, не мешает) или **functional** (ломает, блокирует или путает опыт). Когда времени мало, functional шипится первым; cosmetic могут уйти в follow-up. Качество должно быть согласованным; никогда не идеализируйте один угол, оставляя другой грубым.

**КРИТИЧНО**: polish — последний шаг, не первый. Не полируйте работу, которая не функционально завершена.

## Полируйте системно

Проходите эти измерения методично:

### Визуальное выравнивание и отступы

- **Pixel-perfect alignment**: всё выровнено по сетке
- **Consistent spacing**: все gaps из spacing scale (никаких случайных 13px)
- **Optical alignment**: корректируйте под visual weight (иконкам может нужен offset для оптического центрирования)
- **Responsive consistency**: spacing и alignment работают на всех breakpoints
- **Grid adherence**: элементы привязаны к baseline grid

**Check**:
- Включите grid overlay и проверьте alignment
- Проверьте spacing inspector'ом браузера
- Тестируйте на нескольких размерах viewport
- Ищите элементы, которые «ощущаются» не так

### Информационная архитектура и поток

Визуальный polish на кривом flow — впустую. Сопоставляйте *форму* опыта с системой, не только поверхность.

- **Progressive disclosure**: сколько и когда раскрывается — как у соседних фич. Settings page с 40 полями, когда остальной app показывает по 5 за раз — это drift, даже если каждое поле идеально стилизовано.
- **Устоявшиеся user flows**: multi-step действия той же формы, что сопоставимые flows elsewhere: modal vs full-page, inline edit vs separate route, save-on-blur vs explicit submit, optimistic vs pessimistic updates.
- **Hierarchy & complexity**: одинаковый conceptual weight получает одинаковый visual weight. Primary actions не становятся tertiary в одном углу продукта, а tertiary не кричат.
- **Empty, loading и arrival transitions**: как контент появляется, обновляется и уходит — как в соседних фичах.
- **Naming and mental model**: фича использует те же существительные и глаголы, что остальная система. «Workspace» здесь не должен быть «Project» тремя экранами дальше.

### Типографика Refinement

- **Hierarchy consistency**: одни и те же элементы — одни размеры/веса повсюду
- **Line length**: 45–75 символов для body text
- **Line height**: подходящий для размера шрифта и контекста
- **Widows & orphans**: нет одиноких слов на последней строке
- **Hyphenation**: уместно для языка и ширины колонки
- **Kerning**: корректируйте letter spacing где нужно (особенно headlines)
- **Font loading**: нет вспышек FOUT/FOIT

### Цвет и контраст

- **Contrast ratios**: весь текст соответствует WCAG
- **Consistent token usage**: нет hard-coded цветов, всё через design tokens
- **Theme consistency**: работает во всех вариантах темы
- **Color meaning**: одни цвета значат одно и то же повсюду
- **Accessible focus**: focus indicators видимы с достаточным контрастом
- **Tinted neutrals**: никакого pure gray или pure black; лёгкий цветовой tint (0.01 chroma)
- **Gray on color**: никогда серый текст на цветных фонах; используйте оттенок этого цвета или transparency

### Состояния взаимодействия

У каждого interactive element должны быть все состояния:

- **Default**: состояние покоя
- **Hover**: тонкий feedback (color, scale, shadow)
- **Focus**: keyboard focus indicator (никогда не убирайте без замены)
- **Active**: feedback клика/тапа
- **Disabled**: явно неинтерактивно
- **Loading**: feedback async-действия
- **Error**: validation или error state
- **Success**: успешное завершение

**Пропущенные состояния создают путаницу и сломанный опыт**.

### Микро-взаимодействия и переходы

- **Smooth transitions**: все смены состояний анимированы уместно (150–300ms)
- **Consistent easing**: используйте ease-out-quart/quint/expo для естественного замедления. Никогда bounce или elastic; они выглядят устаревшими.
- **No jank**: плавные анимации; используйте атмосферные blur/filter/mask/shadow, когда они добавляют polish, но ограничивайте дорогие области paint и избегайте casual layout-property animation
- **Appropriate motion**: motion служит цели, не декору
- **Reduced motion**: уважает `prefers-reduced-motion`

### Контент и копирайт

- **Consistent terminology**: одно и то же называется одинаково повсюду
- **Consistent capitalization**: Title Case vs Sentence case применяется согласованно
- **Grammar & spelling**: без опечаток
- **Appropriate length**: не слишком многословно, не слишком сжато
- **Punctuation consistency**: точки в предложениях, не на labels (если только все labels не с точками)

### Иконки и изображения

- **Consistent style**: все иконки из одной семьи или matching style
- **Appropriate sizing**: иконки согласованно размера для контекста
- **Proper alignment**: иконки оптически выровнены с соседним текстом
- **Alt text**: у всех изображений описательный alt text
- **Loading states**: изображения не вызывают layout shift, правильные aspect ratios
- **Retina support**: 2x assets для high-DPI экранов

### Формы и поля ввода

- **Label consistency**: все inputs правильно подписаны
- **Required indicators**: ясные и согласованные
- **Error messages**: полезные и согласованные
- **Tab order**: логичная keyboard navigation
- **Auto-focus**: уместно (не злоупотребляйте)
- **Validation timing**: согласованно (on blur vs on submit)

### Edge cases и состояния ошибок

- **Loading states**: у всех async-действий есть loading feedback
- **Empty states**: полезные empty states, не просто пустое место
- **Error states**: ясные сообщения об ошибках с путями recovery
- **Success states**: подтверждение успешных действий
- **Long content**: обрабатывает очень длинные имена, описания и т.д.
- **No content**: изящно обрабатывает отсутствующие данные
- **Offline**: уместная offline-обработка (если применимо)

### Адаптивность

- **All breakpoints**: тестируйте mobile, tablet, desktop
- **Touch targets**: минимум 44x44px на touch-устройствах
- **Readable text**: нет текста меньше 14px на mobile
- **No horizontal scroll**: контент помещается в viewport
- **Appropriate reflow**: контент адаптируется логично

### Производительность

- **Fast initial load**: оптимизируйте critical path
- **No layout shift**: элементы не прыгают после загрузки (CLS)
- **Smooth interactions**: нет lag или jank
- **Optimized images**: подходящие форматы и размеры
- **Lazy loading**: off-screen контент грузится лениво

### Качество кода

- **Remove console logs**: нет debug logging в production
- **Remove commented code**: уберите мёртвый код
- **Remove unused imports**: уберите неиспользуемые зависимости
- **Consistent naming**: переменные и функции следуют conventions
- **Type safety**: нет TypeScript `any` или игнорируемых ошибок
- **Accessibility**: правильные ARIA labels и semantic HTML

## Чеклист polish

Проходите системно:

- [ ] Выровнено под design system (drift назван и решён по корневой причине)
- [ ] Information architecture и форма flow совпадают с соседними фичами
- [ ] Visual alignment идеален на всех breakpoints
- [ ] Spacing использует design tokens согласованно
- [ ] Typography hierarchy согласована
- [ ] Все interactive states реализованы
- [ ] Все transitions плавные (60fps)
- [ ] Copy согласован и отполирован
- [ ] Иконки согласованы и правильного размера
- [ ] Все формы правильно подписаны и валидированы
- [ ] Error states полезны
- [ ] Loading states ясны
- [ ] Empty states гостеприимны
- [ ] Touch targets минимум 44x44px
- [ ] Contrast ratios соответствуют WCAG AA
- [ ] Keyboard navigation работает
- [ ] Focus indicators видимы
- [ ] Нет console errors или warnings
- [ ] Нет layout shift при загрузке
- [ ] Работает во всех поддерживаемых браузерах
- [ ] Уважается preference reduced motion
- [ ] Код чист (нет TODOs, console.logs, закомментированного кода)

**ВАЖНО**: polish — про детали. Приближайтесь. Прищурьтесь. Пользуйтесь сами. Мелочи складываются.

Потратьте усилия на детали. Приближайтесь, пока alignment не станет верным, а spacing — намеренным. Затем шипьте.

**НИКОГДА**:
- Не полируйте до функциональной завершённости
- Не полируйте без выравнивания под design system; это декор поверх drift
- Не угадывайте принципы design system вместо вопроса при неоднозначности
- Не тратьте часы на polish, если шипится через 30 минут (триаж)
- Не вносите баги при polish (тщательно тестируйте)
- Не игнорируйте системные проблемы (если spacing везде off — чините систему, не один экран)
- Не идеализируйте одно, оставляя другое грубым (согласованный уровень качества)
- Не создавайте новые one-off компоненты, когда есть эквиваленты design system
- Не hard-code значений, которые должны быть design tokens
- Не вводите новые паттерны или flows, расходящиеся с устоявшимися

## Финальная проверка

Перед тем как отметить done:

- **Пользуйтесь сами**: реально взаимодействуйте с фичей.
- **Тестируйте на реальных устройствах**: не только browser DevTools.
- **Попросите кого-то ещё посмотреть**: свежий взгляд ловит детали.
- **Сравните с дизайном**: соответствие задуманному.
- **Проверьте все состояния**: не только happy path.
- **Осторожно с automation**: запускайте detector или QA, когда доступны и уместны, чините их дефекты, но никогда не цитируйте чистый результат как доказательство, что работа polished.

## Очистка

После polish обеспечьте качество кода:

- **Replace custom implementations**: если design system даёт компонент, который вы переписали — переключитесь на shared версию.
- **Remove orphaned code**: удалите неиспользуемые стили, компоненты или файлы, устаревшие после polish.
- **Consolidate tokens**: если ввели новые значения, проверьте, должны ли они быть токенами.
- **Verify DRYness**: ищите дублирование, появившееся при polish, и консолидируйте.

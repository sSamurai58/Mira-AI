Когда просят «bolder», AI по умолчанию тянется к одним и тем же уставшим трюкам: cyan/purple gradients, glassmorphism, neon accents на тёмных фонах, gradient text на метриках. Это противоположность bold. Сначала откажитесь от них, затем усиливайте визуальный impact и personality через более сильную иерархию, committed scale и решительный type.

---

## Регистр

Brand: «bolder» значит distinctive. Экстремальный scale, неожиданный цвет, типографический риск, committed POV.

Product: «bolder» редко значит театральность; она подрывает доверие. Это значит более сильная иерархия, яснее weight contrast, один более острый accent, более committed плотность. Усиление — в ясности, а не в драме.

---

## Оцените текущее состояние

Проанализируйте, из-за чего дизайн ощущается слишком безопасным или скучным:

1. **Определите источники слабости**:
   - **Generic choices**: системные шрифты, базовые цвета, стандартные layouts
   - **Timid scale**: всё среднего размера, без драмы
   - **Низкий контраст**: у всего похожий визуальный вес
   - **Static**: нет motion, нет энергии, нет жизни
   - **Predictable**: стандартные паттерны без сюрпризов
   - **Плоская иерархия**: ничего не выделяется и не захватывает внимание

2. **Поймите контекст**:
   - Какова personality бренда? (Насколько далеко можно толкать?)
   - Какова цель? (Marketing может быть bolder, чем финансовые dashboards)
   - Кто аудитория? (Что отзовётся?)
   - Какие constraints? (Brand guidelines, accessibility, performance)

Если что-то из этого неясно из codebase, ОСТАНОВИТЕСЬ и используйте структурированный инструмент вопросов Codex, когда он доступен; если недоступен, спросите напрямую в чате, чтобы уточнить то, что нельзя вывести.

**КРИТИЧНО**: «Bolder» не значит хаотичный или кричащий. Это значит distinctive, memorable и уверенный. Думайте intentional drama, а не random chaos.

**WARNING — AI SLOP TRAP**: Перед продолжением просмотрите ВСЕ DON'T-гайдлайны из родительского impeccable skill (уже загружены в этом контексте). Bold значит distinctive, а не «больше эффектов».

## Спланируйте усиление

Создайте стратегию роста impact при сохранении coherence:

- **Focal point**: какой должен быть hero-момент? (Выберите ОДИН, сделайте его amazing)
- **Направление personality**: Maximalist chaos? Elegant drama? Playful energy? Dark moody? Выберите lane.
- **Risk budget**: насколько экспериментально можно быть? Толкайте границы внутри constraints.
- **Усиление иерархии**: делайте большое БОЛЬШЕ, маленькое меньше (увеличьте контраст)

**ВАЖНО**: Bold design всё равно должен быть usable. Impact без функции — просто decoration.

## Усильте дизайн

Системно повышайте impact по этим измерениям:

### Усиление типографики
- **Замените generic fonts**: поменяйте системные шрифты на distinctive choices (см. typography guidelines родительского skill и [typography.md](typography.md) для вдохновения)
- **Extreme scale**: создавайте драматические скачки размера (различия 3x–5x, не 1.5x)
- **Weight contrast**: pairing 900 с 200, а не 600 с 400
- **Неожиданные choices**: variable fonts, display fonts для headlines, condensed/extended widths, monospace как intentional accent (не как ленивый дефолт «dev tool»)

### Интенсификация цвета
- **Повысьте saturation**: сдвигайтесь к более vibrant, energetic цветам (но не neon)
- **Bold palette**: вводите неожиданные цветовые комбинации. Избегайте purple-blue gradient AI slop
- **Стратегия dominant color**: пусть один bold-цвет владеет 60% дизайна
- **Острые accents**: high-contrast accent colors, которые pop
- **Tinted neutrals**: замените pure grays тонированными серыми, гармонирующими с палитрой
- **Rich gradients**: intentional multi-stop gradients (не generic purple-to-blue)

### Пространственная драма
- **Экстремальные скачки scale**: делайте важные элементы в 3–5 раз крупнее окружения
- **Сломайте сетку**: пусть hero-элементы выходят из containers и пересекают границы
- **Асимметричные layouts**: замените centered, balanced layouts асимметрией с напряжением
- **Щедрое пространство**: используйте white space драматично (gaps 100–200px, не 20–40px)
- **Overlap**: намеренно наслаивайте элементы для глубины

### Визуальные эффекты
- **Драматические shadows**: большие мягкие тени для elevation (но не generic drop shadows на rounded rectangles)
- **Обработка фона**: mesh patterns, noise textures, geometric patterns, intentional gradients (не purple-to-blue)
- **Texture & depth**: grain, halftone, duotone, layered elements. НЕ glassmorphism (это overused AI slop)
- **Borders & frames**: толстые borders, decorative frames, custom shapes (не rounded rectangles с цветным border на одной стороне)
- **Custom elements**: illustrative elements, custom icons, decorative details, усиливающие бренд

### Движение и анимация
- **Хореография входа**: staggered, драматические page load animations с задержками 50–100ms
- **Scroll effects**: parallax, reveal animations, scroll-triggered sequences
- **Micro-interactions**: satisfying hover effects, click feedback, state changes
- **Transitions**: плавные, заметные transitions с ease-out-quart/quint/expo (не bounce или elastic, которые удешевляют эффект)

### Смелость композиции
- **Hero moments**: создавайте ясные focal points с драматической обработкой
- **Диагональные потоки**: уходите от горизонтальной/вертикальной жёсткости диагональными arrangements
- **Full-bleed elements**: используйте полную ширину/высоту viewport для impact
- **Неожиданные proportions**: golden ratio? Выбросьте. Попробуйте сплиты 70/30, 80/20

**НИКОГДА**:
- Не добавляйте эффекты случайно без цели (chaos ≠ bold)
- Не жертвуйте читаемостью ради aesthetics (body text должен быть читаемым)
- Не делайте всё bold (тогда ничего не bold; нужен контраст)
- Не игнорируйте accessibility (bold design всё равно должен соответствовать WCAG)
- Не перегружайте motion (animation fatigue реален)
- Не копируйте trendy aesthetics вслепую (bold значит distinctive, не derivative)

## Проверьте качество

Убедитесь, что усиление сохраняет usability и coherence:

- **НЕ AI slop**: выглядит ли это как любой другой AI-generated «bold» дизайн? Если да — начните заново.
- **Всё ещё functional**: пользователи могут выполнять задачи без отвлечения?
- **Coherent**: всё ощущается intentional и unified?
- **Memorable**: пользователи запомнят этот опыт?
- **Performant**: все эти эффекты работают плавно?
- **Accessible**: всё ещё соответствует стандартам accessibility?

**Тест**: если вы покажете это кому-то и скажете «AI сделал это bolder», поверят ли они сразу? Если да — вы провалились. Bold значит distinctive, а не «больше AI-эффектов».

Когда результат ощущается правильным, передайте `$impeccable polish` для финального прохода.

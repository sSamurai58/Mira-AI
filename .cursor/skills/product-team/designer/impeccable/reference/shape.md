Сформируйте UX и UI фичи до любого кода. Эта команда производит **design brief**: структурированный артефакт, который ведёт реализацию через discovery, а не догадки.

**Scope**: только планирование дизайна. Эта команда НЕ пишет код. Она производит мышление, которое делает код хорошим.

**Output**: design brief, который можно передать $impeccable craft или напрямую $impeccable для свободной реализации. Когда используются visual direction probes, изображения — поддерживающие артефакты, не основной output.

## Философия

Большинство AI-сгенерированных UI проваливаются не из-за плохого кода, а из-за пропущенного мышления. Они прыгают к «вот card grid», не спросив «чего пользователь пытается достичь?». Эта команда инвертирует это: сначала глубоко понять, чтобы реализация была точной.

## Фаза 1: discovery-интервью

**Во время этой фазы НЕ пишите код и НЕ принимайте дизайн-решения.** Ваша единственная задача — понять фичу достаточно глубоко, чтобы позже принимать отличные дизайн-решения.

Это обязательное взаимодействие, не опциональный guidance. Задавайте эти вопросы в разговоре, адаптируясь к ответам. Не вываливайте всё сразу; ведите естественный диалог. ОСТАНОВИТЕСЬ и используйте structured user-input/question tool Codex, когда доступен; если недоступен — спросите прямо в чате, чтобы прояснить то, что нельзя вывести.

### Ритм интервью

Discovery включает как минимум один раунд ответа пользователя, если PRODUCT.md, DESIGN.md или уже подтверждённый brief напрямую не отвечают на нужные входы. При sparse prompt **не** синтезируйте полный brief для подтверждения в первом ответе.

- Используйте structured question tool harness, когда он есть. Иначе спросите прямо в чате и остановитесь.
- Задавайте **2–3 вопроса за раунд**, затем ждите ответов.
- Считайте PRODUCT.md и DESIGN.md якорями; они сокращают повторные вопросы, но **не** заменяют shape для craft. Shape — task-specific.
- Один раунд — default. Второй — только если первый ответы оставили существенные пробелы. Не запускайте второй раунд ради ощущения тщательности.
- Round 1 должен прояснить purpose, audience/context, content/scope и (для brand) visual direction.
- Round 2, когда нужен, заполняет то, что ещё реально отсутствует.

**Assert-then-confirm, не menu-with-escape.** Когда PRODUCT.md и prompt пользователя делают один вариант очевидным, назовите его и попросите подтвердить или переопределить. Не перечисляйте «Restrained / Committed / Or something else?» как реальный выбор; «This reads as Restrained, confirm?» лучше четырёхвариантного меню, когда ответ уже ясен.

### Цель & Context
- Для чего эта фича? Какую проблему решает?
- Кто конкретно будет ею пользоваться? (Не «users»; конкретно: роль, контекст, частота)
- Как выглядит успех? Как понять, что фича работает?
- В каком состоянии ума пользователь доходит до фичи? (Rushed? Exploring? Anxious? Focused?)

### Контент и данные
- Какой контент или данные фича показывает или собирает?
- Каковы реалистичные диапазоны? (Minimum, typical, maximum, например 0 items, 5 items, 500 items)
- Каковы edge cases? (Empty state, error state, first-time use, power user)
- Есть ли динамический контент? Что меняется и как часто?
- Какие визуальные assets — реальный контент здесь? Отметьте нужные изображения, product shots, иллюстрации, карты, текстуры, диаграммы, generated objects или существующие project assets.

### Дизайн-направление

Зафиксируйте визуальное решение на трёх фронтах. Пропускайте то, на что PRODUCT.md или DESIGN.md уже отвечают; спрашивайте только отсутствующее.

- **Color strategy для этой поверхности.** Выберите одно: Restrained / Committed / Full palette / Drenched. Можно переопределить project default, если поверхность это заслуживает (например drenched hero внутри иначе Restrained product).
- **Theme via scene sentence.** Напишите одно предложение физического контекста этой поверхности: кто пользуется, где, при каком ambient light, в каком mood. Предложение вынуждает dark vs light. Если нет — добавляйте детали, пока не вынудит.
- **Два или три named anchor references.** Конкретные продукты, бренды, объекты. Не прилагательные вроде «modern» или «clean».

### Объём

Всегда спрашивайте. Качество sketch и shipped — разные outputs; не угадывайте между ними.

- **Fidelity.** Sketch / mid-fi / high-fi / production-ready?
- **Breadth.** Один экран / flow / целая поверхность?
- **Interactivity.** Static visual / interactive prototype / shipped-quality component?
- **Time intent.** Быстрое исследование или polish до шипа?

Ответы Scope — task-scoped. Не пишите их в PRODUCT.md или DESIGN.md; несите только через design brief.

### Ограничения
- Есть ли технические constraints? (Framework, performance budget, browser support)
- Есть ли content constraints? (Localization, динамическая длина текста, user-generated content)
- Требования mobile/responsive?
- Требования accessibility сверх WCAG AA?

### Анти-цели
- Чем это НЕ должно быть? Что было бы неверным направлением?
- Какой главный риск ошибиться?

## Фаза 1.5: зонд визуального направления (capability-gated)

После discovery interview сгенерируйте небольшой набор visual direction probes **до** написания финального brief, когда верно всё следующее:

- Работа **net-new** или достаточно directionally ambiguous, что визуальное исследование прояснит brief.
- Запрошенный fidelity — **mid-fi, high-fi или production-ready**. Пропускайте для sketch-only планирования.
- Текущий harness даёт native image generation (Codex `image_gen`, эквивалентный MCP tool или подобное). Не просите пользователя ставить API или tooling.

Когда условия выполнены, этот шаг обязателен. Если image generation нативно недоступна, не просите ставить API или tooling. Укажите одной строкой, что image step пропущен, потому что harness не имеет native image generation, затем продолжайте. Однострочное объявление обязательно, не опционально; оно вынуждает осознанное решение вместо тихого исчезновения шага.

Используйте probes для исследования visual lanes, не для замены brief.

Не пропускайте probes потому, что финальный UI будет semantic, editable, code-native, responsive или accessible. Это требования реализации, не причины избегать визуального исследования.

### Что генерировать

Сгенерируйте **2 to 4** distinct direction probes на основе ответов discovery, особенно:

- Color strategy
- Theme scene sentence
- Named anchor references
- Scope and fidelity

Probes должны различаться primary visual direction (hierarchy, topology, density, typographic voice или color strategy), а не только твиками палитры.

### Как использовать probes

- Считайте их **direction tests**, не финальными дизайнами.
- Используйте, чтобы проверить, указывает ли brief на правильную lane.
- Спросите пользователя, какое направление ближе, что off, и что нести дальше.
- Если probes выявляют mismatch, пересмотрите входы brief до финализации.

### Важные ограничения

- **Не** пропускайте discovery потому, что image generation доступна.
- **Не** считайте generated imagery финальной UX-спецификацией, финальным copy или финальным accessibility behavior.
- **Не** используйте этот шаг для мелких refinements существующей работы. Он для формирования новой поверхности или прояснения большого directional choice.

Если image generation нативно недоступна, объявите skip одной строкой и переходите к design brief.

## Фаза 2: дизайн-бриф

После interview и любых required probes представьте brief и **завершите ответ**. Пользователь должен подтвердить до любой реализации. Не представляйте brief и не продолжайте к коду в том же ответе, даже если brief кажется вам очевидным. Подтверждение пользователя — gate.

**Выбирайте форму brief по ясности ответов:**

- **Compact form (3–5 bullets)**, когда discovery был чётким, а исходный prompt + PRODUCT.md уже зафиксировали scope, content и direction. Укажите, что строите, visual lane, и завершите одним-двумя конкретными вопросами или ясным «confirm or override?». Это default для типичных craft-запросов с ясным prompt.
- **Full structured form (секции ниже)**, когда задача genuinely ambiguous, multi-screen, или пользователь запросил shape как standalone шаг. Используйте, когда дисциплина структуры окупает вес.

Не раздувайте ясный brief в длинный ради тщательности. Brief на 70 строк, пересказывающий только что данные ответы, — шум, не rigor. Равно не пропускайте confirmation pause ради эффективности: пауза — суть.

Представьте brief, затем **остановитесь и ждите явного подтверждения**. Вы не судья того, одобрил ли пользователь уже. Даже когда brief кажется очевидно верным, спросите один раз и ждите. Пауза отделяет shape от premature implementation.

### Структура брифа

**1. Feature Summary** (2–3 предложения)
Что это, для кого, чего должно достичь.

**2. Primary User Action**
Единственное самое важное, что пользователь должен сделать или понять здесь.

**3. Design Direction**
Color strategy (Restrained / Committed / Full palette / Drenched) + theme scene sentence + 2–3 named anchor references. Ссылайтесь на PRODUCT.md и DESIGN.md, где они уже отвечают, и отмечайте любые per-surface overrides.

Если запускали Visual Direction Probe, назовите, какое probe direction выиграло и что изменилось в brief из-за этого.

**4. Scope**
Fidelity, breadth, interactivity и time intent из секции Scope interview. Task-scoped; не живут дольше brief.

**5. Layout Strategy**
High-level spatial approach: что акцентируется, что вторично, как течёт информация. Опишите visual hierarchy и rhythm, не конкретный CSS.

**6. Key States**
Перечислите каждое состояние, нужное фиче: default, empty, loading, error, success, edge cases. Для каждого отметьте, что пользователь должен видеть и чувствовать.

**7. Interaction Model**
Как пользователи взаимодействуют с фичей. Что при click, hover, scroll? Какой feedback получают? Каков flow от входа до завершения?

**8. Content Requirements**
Какие copy, labels, empty state messages, error messages и microcopy нужны. Отметьте любой динамический контент и его реалистичные диапазоны. Для image-led поверхностей также перечислите нужные image/media roles и вероятный source (project asset, generated raster, semantic SVG/CSS, canvas/WebGL, icon library или принятый omission).

**9. Recommended References**
На основе brief перечислите, какие impeccable reference files наиболее ценны при реализации (например spatial-design.md для сложных layouts, motion-design.md для анимированных фич, interaction-design.md для form-heavy фич).

**10. Open Questions**
Всё genuinely unresolved. Не перечисляйте «open questions», для которых уже рекомендовали default; утвердите default и идите дальше. Если написали бы `Recommend: X` рядом с вопросом — просто решите X.

---

ОСТАНОВИТЕСЬ и используйте structured user-input/question tool Codex, когда доступен; если недоступен — спросите прямо в чате, чтобы прояснить то, что нельзя вывести. Запросите явное подтверждение brief перед завершением.

Если пользователь не согласен с любой частью, вернитесь к релевантным discovery-вопросам. Shape run неполон, пока пользователь не подтвердит направление.

После подтверждения brief завершён. Пользователь может передать его $impeccable или использовать для любого другого подхода к реализации. (Если нужен полный discovery-then-build flow в одном шаге — используйте $impeccable craft, который запускает эту команду внутри.)

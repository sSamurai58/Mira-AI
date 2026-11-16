> **Нужен дополнительный контекст**: технический уровень аудитории и mental state пользователей в контексте.

Найдите неясный, confusing или плохо написанный interface text и перепишите его. Vague copy создаёт support tickets и abandonment; specific copy проводит пользователей через задачу.


---

## Оцените текущий Copy

Определите, что делает текст неясным или неэффективным:

1. **Найдите проблемы ясности**:
   - **Jargon**: Технические термины, которые пользователи не поймут
   - **Ambiguity**: Возможны multiple interpretations
   - **Passive voice**: «Your file has been uploaded» vs «We uploaded your file»
   - **Length**: Слишком wordy или слишком terse
   - **Assumptions**: Предположение знания, которого у пользователя нет
   - **Missing context**: Пользователи не знают, что делать или почему
   - **Tone mismatch**: Слишком formal, слишком casual или inappropriate для ситуации

2. **Поймите контекст**:
   - Кто аудитория? (Technical? General? First-time users?)
   - Каков mental state пользователя? (Stressed во время error? Confident во время success?)
   - Каково действие? (Что мы хотим, чтобы пользователи сделали?)
   - Каков constraint? (Character limits? Space limitations?)

**КРИТИЧНО**: Clear copy помогает пользователям succeed. Unclear copy создаёт frustration, errors и support tickets.

## Спланируйте улучшения Copy

Создайте стратегию clearer communication:

- **Primary message**: Что ОДНО пользователям нужно знать?
- **Action needed**: Что пользователи должны сделать дальше (если что-то)?
- **Tone**: Каким это должно ощущаться? (Helpful? Apologetic? Encouraging?)
- **Constraints**: Length limits, brand voice, localization considerations

**ВАЖНО**: Good UX writing невидима. Пользователи должны понимать immediately, не замечая слов.

## Улучшайте Copy системно

Уточняйте текст по этим распространённым областям:

### Сообщения об ошибках
**Bad**: "Error 403: Forbidden"
**Good**: "You don't have permission to view this page. Contact your admin for access."

**Bad**: "Invalid input"
**Good**: "Email addresses need an @ symbol. Try: name@example.com"

**Principles**:
- Объясняйте, что пошло не так, plain language
- Предлагайте, как исправить
- Не вините пользователя
- Включайте examples, когда helpful
- Ссылайтесь на help/support, если applicable

### Лейблы и инструкции форм
**Bad**: "DOB (MM/DD/YYYY)"
**Good**: "Date of birth" (with placeholder showing format)

**Bad**: "Enter value here"
**Good**: "Your email address" or "Company name"

**Principles**:
- Используйте clear, specific labels (не generic placeholders)
- Показывайте format expectations с examples
- Объясняйте, зачем спрашиваете (когда не obvious)
- Ставьте instructions before the field, не after
- Держите required field indicators ясными

### Текст кнопок и CTA
**Bad**: "Click here" | "Submit" | "OK"
**Good**: "Create account" | "Save changes" | "Got it, thanks"

**Principles**:
- Описывайте действие specifically
- Используйте active voice (verb + noun)
- Match mental model пользователя
- Будьте specific («Save» лучше «OK»)

### Справочный текст и тултипы
**Bad**: "This is the username field"
**Good**: "Choose a username. You can change this later in Settings."

**Principles**:
- Добавляйте value (не просто повторяйте label)
- Отвечайте на implicit question («What is this?» или «Why do you need this?»)
- Держите brief but complete
- Ссылайтесь на detailed docs при необходимости

### Пустые состояния
**Bad**: "No items"
**Good**: "No projects yet. Create your first project to get started."

**Principles**:
- Объясняйте, почему пусто (если не obvious)
- Ясно показывайте next action
- Делайте welcoming, не dead-end

### Сообщения об успехе
**Bad**: "Success"
**Good**: "Settings saved! Your changes will take effect immediately."

**Principles**:
- Подтверждайте, что произошло
- Объясняйте, что будет дальше (если relevant)
- Будьте brief but complete
- Match эмоциональный момент пользователя (celebrate big wins)

### Состояния загрузки
**Bad**: "Loading..." (for 30+ seconds)
**Good**: "Analyzing your data... this usually takes 30-60 seconds"

**Principles**:
- Задавайте expectations (how long?)
- Объясняйте, что происходит (когда не obvious)
- Показывайте progress когда возможно
- Предлагайте escape hatch если appropriate («Cancel»)

### Диалоги подтверждения
**Bad**: "Are you sure?"
**Good**: "Delete 'Project Alpha'? This can't be undone."

**Principles**:
- Указывайте specific action
- Объясняйте consequences (особенно для destructive actions)
- Используйте clear button labels («Delete project» не «Yes»)
- Не overuse confirmations (только для risky actions)

### Навигация и ориентация
**Bad**: Generic labels like "Items" | "Things" | "Stuff"
**Good**: Specific labels like "Your projects" | "Team members" | "Settings"

**Principles**:
- Будьте specific and descriptive
- Используйте язык, который пользователи понимают (не internal jargon)
- Делайте hierarchy clear
- Учитывайте information scent (breadcrumbs, current location)

## Применяйте принципы Clarity

Каждый кусок copy должен следовать этим правилам:

1. **Be specific**: «Enter email» не «Enter value»
2. **Be concise**: Убирайте unnecessary words (но не жертвуйте clarity)
3. **Be active**: «Save changes» не «Changes will be saved»
4. **Be human**: «Oops, something went wrong» не «System error encountered»
5. **Tell users what to do**, не только what happened
6. **Be consistent**: Используйте одни и те же terms throughout (не варьируйте ради variety)

**НИКОГДА**:
- Не используйте jargon без explanation
- Не вините пользователей («You made an error» → «This field is required»)
- Не будьте vague («Something went wrong» без explanation)
- Не используйте passive voice unnecessarily
- Не пишите overly long explanations (будьте concise)
- Не используйте humor для errors (будьте empathetic instead)
- Не предполагайте technical knowledge
- Не варьируйте terminology (выберите один term и stick with it)
- Не повторяйте information (headers restating intros, redundant explanations)
- Не используйте placeholders как единственные labels (они исчезают, когда пользователи печатают)

## Проверьте улучшения

Протестируйте, что улучшения copy работают:

- **Comprehension**: Пользователи понимают без context?
- **Actionability**: Пользователи знают, что делать дальше?
- **Brevity**: Настолько short, насколько возможно, оставаясь clear?
- **Consistency**: Match terminology elsewhere?
- **Tone**: Appropriate для ситуации?

Когда copy читается cleanly, передайте `$impeccable polish` для финального прохода.

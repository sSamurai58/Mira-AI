> **Нужен дополнительный контекст**: что уместно для домена (playful vs professional vs quirky vs elegant).

Найдите моменты, где personality и неожиданный polish превратят функциональный интерфейс в тот, который пользователи запоминают и рассказывают другим. Добавляйте только там, где момент это заслуживает; delight везде читается как шум.

---

## Регистр

Brand: delight может распределяться по copy voice, переходам секций, discovery rewards, сезонным touches, personality по всей поверхности.

Product: delight в конкретных моментах, не на страницах. Completion, first-time actions, error recovery, пересечения milestone. Reliability и consistency несут остальной опыт; delight повсюду читается как шум.

---

## Оцените возможности для delight

Определите, где delight усилит (а не отвлечёт от) опыт:

1. **Найдите естественные моменты delight**:
   - **Success states**: завершённые действия (save, send, publish)
   - **Empty states**: first-time experiences, онбординг
   - **Loading states**: ожидания, которые можно сделать engaging
   - **Achievements**: milestones, streaks, completions
   - **Interactions**: hover states, clicks, drags
   - **Errors**: смягчение раздражающих моментов
   - **Easter eggs**: скрытые discoveries для любопытных пользователей

2. **Поймите контекст**:
   - Какова brand personality? (Playful? Professional? Quirky? Elegant?)
   - Кто аудитория? (Tech-savvy? Creative? Corporate?)
   - Каков эмоциональный контекст? (Accomplishment? Exploration? Frustration?)
   - Что уместно? (Banking app ≠ gaming app)

3. **Определите delight strategy**:
   - **Subtle sophistication**: refined micro-interactions (luxury brands)
   - **Playful personality**: whimsical illustrations и copy (consumer apps)
   - **Helpful surprises**: предвосхищение нужд до того, как спросят (productivity tools)
   - **Sensory richness**: satisfying sounds, плавные анимации (creative tools)

Если что-то из этого неясно из кодовой базы, ОСТАНОВИТЕСЬ и используйте structured user-input/question tool Codex, когда доступен; если недоступен — спросите прямо в чате, чтобы прояснить то, что нельзя вывести.

**КРИТИЧНО**: delight должен усиливать usability, никогда не заслонять её. Если пользователи замечают delight больше, чем достижение цели — вы зашли слишком далеко.

## Принципы delight

Следуйте этим guidelines:

### Delight усиливает, никогда не блокирует
- Моменты delight должны быть быстрыми (< 1 секунды)
- Никогда не задерживайте core functionality ради delight
- Делайте delight skippable или subtle
- Уважайте время пользователя и фокус на задаче

### Сюрприз и discovery
- Прячьте delightful details для discovery
- Награждайте exploration и curiosity
- Не анонсируйте каждый момент delight
- Пусть пользователи делятся discoveries с другими

### Уместность в контексте
- Сопоставляйте delight эмоциональному моменту (celebrate success, empathize with errors)
- Уважайте состояние пользователя (не будьте playful при критических ошибках)
- Сопоставляйте brand personality и ожидания аудитории
- Cultural sensitivity (что delightful, зависит от культуры)

### Накопление со временем
- Delight должен оставаться свежим при повторном использовании
- Варьируйте responses (не одна и та же анимация каждый раз)
- Раскрывайте более глубокие слои при продолжении использования
- Стройте anticipation через паттерны

## Техники delight

Добавляйте personality и радость этими методами:

### Микро-взаимодействия и анимация

**Button delight**:
```css
/* Satisfying button press */
.button {
  transition: transform 0.1s, box-shadow 0.1s;
}
.button:active {
  transform: translateY(2px);
  box-shadow: 0 2px 4px rgba(0,0,0,0.2);
}

/* Ripple effect on click */
/* Smooth lift on hover */
.button:hover {
  transform: translateY(-2px);
  transition: transform 0.2s cubic-bezier(0.25, 1, 0.5, 1); /* ease-out-quart */
}
```

**Loading delight**:
- Playful loading animations (не только spinners)
- Personality в loading messages (пишите product-specific, не generic AI filler)
- Progress indication с encouraging messages
- Skeleton screens с тонкими анимациями

**Success animations**:
- Checkmark draw animation
- Confetti burst для major achievements
- Gentle scale + fade для confirmation
- Satisfying sound effects (subtle)

**Hover surprises**:
- Иконки, анимирующиеся на hover
- Color shifts или glow effects
- Tooltip reveals с personality
- Cursor changes (custom cursors для branded experiences)

### Характер в копирайте

**Playful error messages**:
```
"Error 404"
"This page is playing hide and seek. (And winning)"

"Connection failed"
"Looks like the internet took a coffee break. Want to retry?"
```

**Encouraging empty states**:
```
"No projects"
"Your canvas awaits. Create something amazing."

"No messages"
"Inbox zero! You're crushing it today."
```

**Playful labels & tooltips**:
```
"Delete"
"Send to void" (for playful brand)

"Help"
"Rescue me" (tooltip)
```

**ВАЖНО**: сопоставляйте copy personality бренду. Банки не должны быть wacky, но могут быть warm.

### Иллюстрации и визуальный характер

**Custom illustrations**:
- Empty state illustrations (не stock icons)
- Error state illustrations (friendly monsters, quirky characters)
- Loading state illustrations (animated characters)
- Success state illustrations (celebrations)

**Icon personality**:
- Custom icon set под brand personality
- Animated icons (тонкий motion на hover/click)
- Illustrative icons (детализированнее generic)
- Согласованный стиль всех иконок

**Background effects**:
- Subtle particle effects
- Gradient mesh backgrounds
- Geometric patterns
- Parallax depth
- Time-of-day themes (morning vs night)

### Приятные взаимодействия

**Drag and drop delight**:
- Lift effect при drag (shadow, scale)
- Snap animation при drop
- Satisfying placement sound
- Undo toast ("Dropped in wrong place? [Undo]")

**Toggle switches**:
- Плавный slide со spring physics
- Color transition
- Haptic feedback на mobile
- Опциональный sound effect

**Progress & achievements**:
- Streak counters с celebratory milestones
- Progress bars, которые «celebrate» на 100%
- Badge unlocks с анимацией
- Playful stats ("You're on fire! 5 days in a row")

**Form interactions**:
- Input fields, анимирующиеся на focus
- Checkboxes с satisfying scale pulse при check
- Success state, празднующий valid input
- Auto-grow textareas

### Звуковой дизайн

**Subtle audio cues** (когда уместно):
- Notification sounds (distinctive, но не раздражающие)
- Success sounds (satisfying «ding»)
- Error sounds (empathetic, не harsh)
- Typing sounds для chat/messaging
- Ambient background audio (очень subtle)

**ВАЖНО**:
- Уважайте system sound settings
- Предоставляйте mute option
- Держите громкость тихой (subtle cues, не alarms)
- Не играйте на каждом взаимодействии (sound fatigue реальна)

### Пасхалки и скрытые delight

**Discovery rewards**:
- Konami code разблокирует special theme
- Скрытые keyboard shortcuts (Cmd+K для special features)
- Hover reveals на логотипах или иллюстрациях
- Alt text jokes на изображениях (и для пользователей screen reader!)
- Console messages для разработчиков ("Like what you see? We're hiring!")

**Seasonal touches**:
- Holiday themes (subtle, tasteful)
- Seasonal color shifts
- Weather-based variations
- Time-based changes (dark at night, light during day)

**Contextual personality**:
- Разные сообщения по времени суток
- Responses на конкретные действия пользователя
- Randomized variations (не одно и то же каждый раз)
- Progressive reveals при продолжении использования

### Состояния загрузки и ожидания

**Сделайте ожидание engaging**:
- Interesting loading messages, которые ротируются
- Progress bars с personality
- Mini-games во время долгих loads
- Fun facts или tips во время ожидания
- Countdown с encouraging messages

```
Loading messages: write ones specific to your product, not generic AI filler:
- "Crunching your latest numbers..."
- "Syncing with your team's changes..."
- "Preparing your dashboard..."
- "Checking for updates since yesterday..."
```

**ПРЕДУПРЕЖДЕНИЕ**: избегайте клишированных loading messages вроде «Herding pixels», «Teaching robots to dance», «Consulting the magic 8-ball», «Counting backwards from infinity». Это AI-slop copy, мгновенно узнаваемая как machine-generated. Пишите сообщения, специфичные для того, что продукт реально делает.

### Моменты celebration

**Success celebrations**:
- Confetti для major milestones
- Animated checkmarks для completions
- Progress bar celebrations на 100%
- Уведомления в стиле «Achievement unlocked»
- Personalized messages ("You published your 10th article!")

**Milestone recognition**:
- First-time actions получают особое обращение
- Streak tracking и celebration
- Progress toward goals
- Anniversary celebrations

## Паттерны реализации

**Animation libraries**:
- Framer Motion (React)
- GSAP (universal)
- Lottie (After Effects animations)
- Canvas confetti (party effects)

**Sound libraries**:
- Howler.js (audio management)
- Use-sound (React hook)

**Physics libraries**:
- React Spring (spring physics)
- Popmotion (animation primitives)

**ВАЖНО**: размер файлов важен. Сжимайте изображения, оптимизируйте анимации, lazy load delight features.

**НИКОГДА**:
- Не задерживайте core functionality ради delight
- Не заставляйте проходить delightful moments (делайте skippable)
- Не используйте delight, чтобы скрыть poor UX
- Не переусердствуйте (less is more)
- Не игнорируйте accessibility (анимируйте ответственно, давайте alternatives)
- Не делайте каждое взаимодействие delightful (особые моменты должны быть особыми)
- Не жертвуйте performance ради delight
- Не будьте неуместны для контекста (read the room)

## Проверьте качество delight

Проверьте, что delight реально радует:

- **User reactions**: улыбаются ли? Делятся скриншотами?
- **Doesn't annoy**: всё ещё приятно на 100-й раз?
- **Doesn't block**: могут ли opt out или skip?
- **Performant**: нет jank, нет slowdown
- **Appropriate**: соответствует бренду и контексту
- **Accessible**: работает с reduced motion, screen readers

Когда моменты ощущаются earned — передайте `$impeccable polish` для финального прохода.

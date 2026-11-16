# Гайд по Heuristics Scoring

Оценивайте каждую из 10 Usability Heuristics Нильсена по шкале 0–4. Будьте честны: 4 значит genuinely excellent, а не «good enough».

## 10 Heuristics Нильсена

### 1. Видимость статуса системы

Держите пользователей informed о том, что происходит, через timely, appropriate feedback.

**Проверяйте**:
- Loading indicators во время async operations
- Confirmation действий пользователя (save, submit, delete)
- Progress indicators для multi-step processes
- Current location в navigation (breadcrumbs, active states)
- Form validation feedback (inline, не только on submit)

**Scoring**:
| Score | Criteria |
|-------|----------|
| 0 | Нет feedback; пользователь угадывает, что произошло |
| 1 | Rare feedback; большинство действий не дают visible response |
| 2 | Partial; некоторые states communicated, major gaps remain |
| 3 | Good; большинство operations дают clear feedback, minor gaps |
| 4 | Excellent; каждое действие confirms, progress всегда visible |

### 2. Соответствие системе и реальному миру

Говорите языком пользователя. Следуйте real-world conventions. Информация появляется в natural, logical order.

**Проверяйте**:
- Familiar terminology (без unexplained jargon)
- Logical information order matching user expectations
- Recognizable icons и metaphors
- Domain-appropriate language для target audience
- Natural reading flow (left-to-right, top-to-bottom priority)

**Scoring**:
| Score | Criteria |
|-------|----------|
| 0 | Pure tech jargon, alien для пользователей |
| 1 | Mostly confusing; нужна domain expertise, чтобы navigate |
| 2 | Mixed; есть plain language, но jargon leaks through |
| 3 | Mostly natural; occasional term нуждается в context |
| 4 | Говорит языком пользователя fluently throughout |

### 3. Контроль и свобода пользователя

Пользователям нужен ясный «emergency exit» из unwanted states без extended dialogue.

**Проверяйте**:
- Undo/redo functionality
- Cancel buttons на forms и modals
- Clear navigation back to safety (home, previous)
- Easy way очистить filters, search, selections
- Escape из long или multi-step processes

**Scoring**:
| Score | Criteria |
|-------|----------|
| 0 | Пользователи trapped; нет выхода без refreshing |
| 1 | Difficult exits; нужно искать obscure paths to escape |
| 2 | Some exits; main flows имеют escape, edge cases — нет |
| 3 | Good control; пользователи могут exit и undo most actions |
| 4 | Full control; undo, cancel, back и escape everywhere |

### 4. Последовательность и стандарты

Пользователи не должны гадать, означают ли разные слова, ситуации или действия одно и то же.

**Проверяйте**:
- Consistent terminology throughout интерфейса
- Same actions дают same results everywhere
- Platform conventions followed (standard UI patterns)
- Visual consistency (colors, typography, spacing, components)
- Consistent interaction patterns (same gesture = same behavior)

**Scoring**:
| Score | Criteria |
|-------|----------|
| 0 | Inconsistent everywhere; ощущается как разные продукты, сшитые вместе |
| 1 | Many inconsistencies; similar things look/behave differently |
| 2 | Partially consistent; main flows match, details diverge |
| 3 | Mostly consistent; occasional deviation, ничего confusing |
| 4 | Fully consistent; cohesive system, predictable behavior |

### 5. Предотвращение ошибок

Лучше good error messages — дизайн, который предотвращает проблемы заранее.

**Проверяйте**:
- Confirmation перед destructive actions (delete, overwrite)
- Constraints, предотвращающие invalid input (date pickers, dropdowns)
- Smart defaults, снижающие errors
- Clear labels, предотвращающие misunderstanding
- Autosave и draft recovery

**Scoring**:
| Score | Criteria |
|-------|----------|
| 0 | Errors легко сделать; нет guardrails anywhere |
| 1 | Few safeguards; некоторые inputs validated, большинство — нет |
| 2 | Partial prevention; common errors caught, edge cases slip |
| 3 | Good prevention; большинство error paths blocked proactively |
| 4 | Excellent; errors nearly impossible через smart constraints |

### 6. Узнавание вместо припоминания

Минимизируйте memory load. Делайте objects, actions и options visible или easily retrievable.

**Проверяйте**:
- Visible options (не buried в hidden menus)
- Contextual help when needed (tooltips, inline hints)
- Recent items и history
- Autocomplete и suggestions
- Labels на icons (не icon-only navigation)

**Scoring**:
| Score | Criteria |
|-------|----------|
| 0 | Heavy memorization; пользователи должны помнить paths и commands |
| 1 | Mostly recall; много hidden features, мало visible cues |
| 2 | Some aids; main actions visible, secondary features hidden |
| 3 | Good recognition; большинство вещей discoverable, мало memory demands |
| 4 | Everything discoverable; пользователям никогда не нужно memorize |

### 7. Гибкость и эффективность использования

Accelerators, невидимые для novices, ускоряют expert interaction.

**Проверяйте**:
- Keyboard shortcuts для common actions
- Customizable interface elements
- Recent items и favorites
- Bulk/batch actions
- Power user features, которые не усложняют basics

**Scoring**:
| Score | Criteria |
|-------|----------|
| 0 | One rigid path; нет shortcuts или alternatives |
| 1 | Limited flexibility; мало alternatives к main path |
| 2 | Some shortcuts; basic keyboard support, limited bulk actions |
| 3 | Good accelerators; keyboard nav, некоторая customization |
| 4 | Highly flexible; multiple paths, power features, customizable |

### 8. Эстетичный и минималистичный дизайн

Интерфейсы не должны содержать irrelevant или rarely needed information. Каждый элемент должен служить цели.

**Проверяйте**:
- Только necessary information visible на каждом шаге
- Clear visual hierarchy, направляющая attention
- Purposeful use of color и emphasis
- Нет decorative clutter, конкурирующего за attention
- Focused, uncluttered layouts

**Scoring**:
| Score | Criteria |
|-------|----------|
| 0 | Overwhelming; всё конкурирует за attention equally |
| 1 | Cluttered; слишком много noise, трудно найти what matters |
| 2 | Some clutter; main content clear, periphery noisy |
| 3 | Mostly clean; focused design, minor visual noise |
| 4 | Perfectly minimal; каждый элемент earns its pixel |

### 9. Помогайте распознавать, диагностировать и исправлять ошибки

Error messages должны использовать plain language, precisely указывать проблему и constructively предлагать решение.

**Проверяйте**:
- Plain language error messages (нет error codes для пользователей)
- Specific problem identification («Email is missing @» не «Invalid input»)
- Actionable recovery suggestions
- Errors displayed near the source of the problem
- Non-blocking error handling (не wipe the form)

**Scoring**:
| Score | Criteria |
|-------|----------|
| 0 | Cryptic errors; codes, jargon или вообще нет message |
| 1 | Vague errors; «Something went wrong» без guidance |
| 2 | Clear but unhelpful; называет проблему, но не fix |
| 3 | Clear with suggestions; identifies problem и offers next steps |
| 4 | Perfect recovery; pinpoints issue, suggests fix, preserves user work |

### 10. Справка и документация

Даже если система usable без docs, help должен быть easy to find, task-focused и concise.

**Проверяйте**:
- Searchable help или documentation
- Contextual help (tooltips, inline hints, guided tours)
- Task-focused organization (не feature-organized)
- Concise, scannable content
- Easy access без leaving current context

**Scoring**:
| Score | Criteria |
|-------|----------|
| 0 | Help недоступен nowhere |
| 1 | Help существует, но hard to find или irrelevant |
| 2 | Basic help; FAQ или docs существуют, не contextual |
| 3 | Good documentation; searchable, mostly task-focused |
| 4 | Excellent contextual help; right info at the right moment |

---

## Сводка оценок

**Total possible**: 40 points (10 heuristics × 4 max)

| Score Range | Rating | What It Means |
|-------------|--------|---------------|
| 36–40 | Excellent | Minor polish only; ship it |
| 28–35 | Good | Address weak areas, solid foundation |
| 20–27 | Acceptable | Significant improvements needed before users are happy |
| 12–19 | Poor | Major UX overhaul required; core experience broken |
| 0–11 | Critical | Redesign needed; unusable in current state |

---

## Severity проблем (P0–P3)

Тегируйте каждый individual issue, найденный во время scoring, уровнем priority:

| Priority | Name | Description | Action |
|----------|------|-------------|--------|
| **P0** | Blocking | Полностью предотвращает завершение задачи | Fix immediately; это showstopper |
| **P1** | Major | Вызывает significant difficulty или confusion | Fix before release |
| **P2** | Minor | Annoyance, но workaround существует | Fix in next pass |
| **P3** | Polish | Nice-to-fix, нет реального user impact | Fix if time permits |

**Tip**: Если не уверены между двумя уровнями, спросите: «Обратятся ли пользователи в support из-за этого?» Если да — это минимум P1.

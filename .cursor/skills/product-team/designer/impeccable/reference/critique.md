### Цель

Resolve один stable target, запустите две независимые assessments, синтезируйте design critique, сохраните snapshot и спросите пользователя, что улучшать дальше. Chat response — primary deliverable; snapshot — archive/backlog для будущих команд.

### Жёсткие инварианты

- Assessment A (design review) и Assessment B (detector/browser evidence) оба обязательны.
- Assessment A должна завершиться до того, как detector findings попадут в parent synthesis context. Detector output детерминирован, но всё равно anchors judgment.
- Если sub-agents недоступны, fall back последовательно: сначала завершите и запишите Assessment A, затем запустите Assessment B, затем синтезируйте.
- Пропущенный detector — failed critique run, если только `detect.mjs` не отсутствует или не crashes после реальной попытки.
- Viewable targets требуют browser inspection, когда доступен.
- Любой local server, запущенный только для critique visualization, должен работать в background, иметь записанный stop method и быть остановлен до final reporting, если пользователь не просит оставить.
- Не утверждайте, что user-visible overlay существует, пока script injection не succeeded и detector не ran в странице.

### Настройка

1. **Resolve the target** до concrete file path или URL. Prefer source path над dev-server URL, когда оба идентифицируют одну поверхность; ports drift, paths — нет.
   - «the homepage» -> `site/pages/index.astro` или `index.html`
   - «the settings modal» -> primary component file
   - «this page» -> current URL или source file
2. **Compute the slug**:
   ```bash
   node .agents/skills/impeccable/scripts/critique-storage.mjs slug "<resolved-path-or-url>"
   ```
   Сохраните его. Если команда exits non-zero, пропустите persistence и trend для этого run, но продолжайте critique.
3. **Прочитайте `.impeccable/critique/ignore.md`**, если существует. Drop matching findings silently; это единственный prior-run input, который critique consumes.

### Оркестрация оценки

Делегируйте Assessment A и Assessment B отдельным sub-agents, когда возможно. Они не должны видеть output друг друга. Не показывайте findings пользователю до synthesis.

Codex sub-agent gate:
- Если `spawn_agent` exposed и пользователь явно разрешил sub-agents, delegation или parallel agent work — spawn A и B immediately.
- Если `spawn_agent` exposed, но пользователь не разрешал sub-agents явно — спросите ровно один раз: «Impeccable critique is designed to run two independent sub-agents for an unanchored assessment. May I use sub-agents for this critique?» Затем stop until the user answers.
- Если allowed — spawn A и B. Если declined — run sequentially и репортите `Assessment independence: degraded (sub-agents declined by user)`.
- Если `spawn_agent` не exposed — не спрашивайте; run sequentially и репортите `Assessment independence: degraded (spawn_agent unavailable in this session)`.
- Если spawning fails после permission — run sequentially и репортите `Assessment independence: degraded (sub-agent spawn failed: <exact error>)`.
Prefer `fork_context: false` с self-contained prompts, содержащими cwd, target, live URL, references, product context и output contract. Если используете `fork_context: true`, omit `agent_type`, `model` и `reasoning_effort`.

Если browser automation доступна, каждая assessment создаёт свою new tab. Never reuse existing tab, даже если она уже на правильном URL.

### Оценка A: дизайн-ревью

Прочитайте relevant source files и visually inspect live page, когда browser automation доступна. Думайте как design director.

Evaluate:
- **AI slop**: Поверил бы кто-то сразу «AI made this»? Проверьте все DON'T guidance из родительского Impeccable skill.
- **Holistic design**: hierarchy, IA, emotional fit, discoverability, composition, typography, color, accessibility, states, copy и edge cases.
- **Cognitive load**: консультируйте [cognitive-load](cognitive-load.md); репортите checklist failures и decision points с >4 visible options.
- **Emotional journey**: peak-end rule, emotional valleys, reassurance в high-stakes moments.
- **Nielsen heuristics**: консультируйте [heuristics-scoring](heuristics-scoring.md); score все 10 heuristics 0–4.

Return: AI slop verdict, heuristic scores, cognitive load, emotional journey, 2–3 strengths, 3–5 priority issues, persona red flags, minor observations и provocative questions.

### Оценка B: детектор + browser evidence

Запустите bundled detector и browser visualization evidence. Assessment B обязательна и должна оставаться isolated от Assessment A, пока обе не complete.

CLI scan:
```bash
node .agents/skills/impeccable/scripts/detect.mjs --json [--fast] [target]
```

- Передавайте markup files/directories как `[target]`; не передавайте CSS-only files.
- Для URLs пропускайте CLI scan и используйте browser visualization.
- Для 200+ scannable files используйте `--fast`; для 500+ сузьте scope или спросите.
- Exit code 0 = clean; 2 = findings.
- Если detector entrypoint отсутствует или fails to load — репортите deterministic scan unavailable и продолжайте с browser/manual review.

Browser visualization обязательна для viewable target, когда browser automation доступна. Используйте localhost dev/static URL для local files; избегайте `file://`, если available browser явно не поддерживает этот workflow. Overlay flow:

1. Создайте fresh tab и navigate.
2. Preflight mutable injection, установив `document.title` и appending `<script>` tag. Read-only evaluate APIs не считаются.
3. Если mutation недоступна — пропустите live server, browser presentation и injection; репортите fallback signal.
4. Если mutation доступна — запустите `node .agents/skills/impeccable/scripts/live-server.mjs --background`, present browser если supported, label `[Human]`, scroll top, inject `http://localhost:PORT/detect.js`, подождите 2–3 секунды, прочитайте `impeccable` console messages, затем stop live server.
5. Для multi-view targets inject на 3–5 representative pages.

Codex Browser note: Используйте Browser skill. Не тратьте Browser attempt на `file://`. Вызывайте `visibility.set(true)` только после того, как mutable script injection confirmed для `[Human]` overlay path; verify с `get()`. Используйте `tab.dev.logs({ filter: "impeccable" })` для console results. Его Playwright `evaluate(...)` surface — read-only; не полагайтесь на него для mutation.

Return: CLI findings JSON/counts, browser console findings если applicable, false positives и skipped/failed browser steps с concrete reasons.

После того как Assessment B вернула usable CLI findings — reuse их. Не rerun `detect.mjs` в parent, если только Assessment B не failed, не truncated или не omitted count, rule names или file locations.

Codex failure accounting: final Run Notes должны включать target slug, ignore list, assessment independence, CLI detector, browser visibility, overlay injection, live-server cleanup, temp-file cleanup и любой использованный fallback signal. Не запускайте repo status checks, late API spelunking или unrelated verification после того, как report assembled.

### Сгенерируйте объединённый critique-отчёт

Синтезируйте обе assessments в один report. НЕ просто concatenate. Weave findings вместе, отмечая где LLM review и detector согласны, где detector поймал issues, которые LLM пропустил, и где detector findings — false positives.

Chat response — primary user-facing deliverable. Представьте полный structured critique ниже в chat; не заменяйте его summary и link. Persisted snapshot — только archive/backlog для later commands.

Codex final-answer note: `$impeccable critique` производит report artifact, поэтому final chat response намеренно превышает usual concise close-out style. Не title final response «Critique Summary», если пользователь явно не просил summary.

Структурируйте feedback как design director:

#### Оценка здоровья дизайна
> *Consult [heuristics-scoring](heuristics-scoring.md)*

Представьте scores по 10 heuristics Нильсена как таблицу:

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | ? | [specific finding or "n/a" if solid] |
| 2 | Match System / Real World | ? | |
| 3 | User Control and Freedom | ? | |
| 4 | Consistency and Standards | ? | |
| 5 | Error Prevention | ? | |
| 6 | Recognition Rather Than Recall | ? | |
| 7 | Flexibility and Efficiency | ? | |
| 8 | Aesthetic and Minimalist Design | ? | |
| 9 | Error Recovery | ? | |
| 10 | Help and Documentation | ? | |
| **Total** | | **??/40** | **[Rating band]** |

Будьте honest со scores. 4 значит genuinely excellent. Большинство real interfaces score 20–32.

#### Вердикт по антипаттернам

**Начните здесь.** Выглядит ли это AI-generated?

**LLM assessment**: Ваша собственная evaluation AI slop tells. Покройте overall aesthetic feel, layout sameness, generic composition, missed opportunities for personality.

**Deterministic scan**: Суммируйте, что нашёл automated detector, с counts и file locations. Отметьте любые additional issues, которые detector поймал, а вы пропустили, и flag любые false positives.

**Visual overlays** (если injection succeeded): Скажите пользователю, что overlays теперь visible во вкладке **[Human]** в browser, highlighting detected issues. Суммируйте, что репортил console output. Если browser visualization attempted, но injection failed — скажите, что reliable user-visible overlay недоступен, и репортите fallback signal вместо этого.

#### Общее впечатление
Краткая gut reaction: что работает, что нет, и single biggest opportunity.

#### Что работает
Highlight 2–3 вещи, сделанные well. Будьте specific, почему они работают.

#### Приоритетные проблемы
3–5 самых impactful design problems, ordered by importance.

Для каждого issue тегируйте **P0–P3 severity** (consult [heuristics-scoring](heuristics-scoring.md) для severity definitions):
- **[P?] What**: Назовите проблему ясно
- **Why it matters**: Как это hurts users или undermines goals
- **Fix**: Что делать (be concrete)
- **Suggested command**: Какая команда могла бы address это (из: $impeccable adapt, $impeccable animate, $impeccable audit, $impeccable bolder, $impeccable clarify, $impeccable colorize, $impeccable critique, $impeccable delight, $impeccable distill, $impeccable document, $impeccable harden, $impeccable layout, $impeccable onboard, $impeccable optimize, $impeccable overdrive, $impeccable polish, $impeccable quieter, $impeccable shape, $impeccable typeset)

#### Красные флаги персон
> *Consult [personas](personas.md)*

Auto-select 2–3 personas, most relevant к этому interface type (используйте selection table в reference). Если `AGENTS.md` содержит секцию `## Design Context` из `impeccable teach`, также generate 1–2 project-specific personas из audience/brand info.

Для каждой selected persona пройдите primary user action и перечислите specific red flags found:

**Alex (Power User)**: No keyboard shortcuts detected. Form requires 8 clicks for primary action. Forced modal onboarding. High abandonment risk.

**Jordan (First-Timer)**: Icon-only nav in sidebar. Technical jargon in error messages ("404 Not Found"). No visible help. Will abandon at step 2.

Будьте specific. Называйте exact elements и interactions, которые fail каждой persona. Не пишите generic persona descriptions; пишите, что broke для них.

#### Мелкие наблюдения
Quick notes по smaller issues, worth addressing.

#### Вопросы к размышлению
Provocative questions, которые могут unlock better solutions:
- «What if the primary action were more prominent?»
- «Does this need to feel this complex?»
- «What would a confident version of this look like?»

#### Заметки запуска
Держите compact. Включите status для target slug, ignore list, assessment independence, CLI detector, browser visibility, overlay injection, live server cleanup и temp-file cleanup. Для failed или skipped steps давайте concrete observed reason и использованный fallback signal. В final chat response также включите snapshot write и trend read status после того, как persistence ran.

Codex Run Notes — final-chat only. Не включайте эту секцию в persisted snapshot body, потому что persistence, trend read и temp cleanup происходят после snapshot write и иначе заархивировали бы stale status вроде «pending after persistence».

**Remember**:
- Будьте direct. Vague feedback тратит время всех.
- Будьте specific. «The submit button», не «some elements».
- Говорите, что wrong И почему это matters пользователям.
- Давайте concrete suggestions. Cut «consider exploring...» entirely.
- Prioritize ruthlessly. Если всё important — ничего не important.
- Не soften criticism. Developers нуждаются в honest feedback, чтобы ship great design.

### Сохраните снимок

Когда report выше finalized, запишите его в `.impeccable/critique/`, чтобы пользователь мог refer back, и чтобы `$impeccable polish` мог pick up priority issues без copy-paste.

Пропустите этот шаг, если Setup slug был null (vague или root-level target).

1. **Write the body to a temp file**, чтобы pipe его в helper. Используйте full critique report (heuristic table, anti-patterns verdict, priority issues, persona red flags, minor observations и questions), но stop before секций «Ask the User» / «Recommended Actions», которые идут позже.

   Codex: exclude Run Notes из temp body file; Run Notes — final-chat only, потому что persistence, trend read и temp cleanup происходят после snapshot write.

2. **Pass the structured metadata** через `IMPECCABLE_CRITIQUE_META` (JSON), затем запустите write command:
   ```bash
   IMPECCABLE_CRITIQUE_META='{"target":"<user phrasing>","total_score":<n>,"p0_count":<n>,"p1_count":<n>}' \
     node .agents/skills/impeccable/scripts/critique-storage.mjs write <slug> <body-file>
   ```
   Helper печатает absolute path, который записал.

3. **Delete the temp body file** после завершения write attempt, succeeded или failed. Если deletion fails — упомяните `temp-file cleanup failed: <reason>` briefly в final output, но не block critique.

4. **Read the trend** для context:
   ```bash
   node .agents/skills/impeccable/scripts/critique-storage.mjs trend <slug> 5
   ```
   Возвращает JSON array последних 5 frontmatter entries (включая только что записанный).

5. **Append a single line к user-visible output**, после report и before questions:

   > **Trend for `<slug>` (last 5 runs): 24 → 28 → 32 → 29 → 32**
   > Wrote `.impeccable/critique/<filename>`.

   Если это first run для slug — trend просто один score; скажите так: «First run for this target, no trend yet.»

Это fire-and-forget. Не показывайте пользователю helper's JSON output; только human-readable trend line и written path. Failures здесь не должны block остальной flow; print the error и move on.

### Спросите пользователя

**После presenting findings** используйте targeted questions based on том, что actually found. STOP и используйте структурированный инструмент вопросов Codex, когда доступен; если недоступен — спросите напрямую в чате, чтобы уточнить то, что нельзя вывести. Эти answers сформируют action plan.

Задавайте вопросы вдоль этих линий (adapt к specific findings; НЕ задавайте generic questions):

1. **Priority direction**: Based on найденных issues спросите, какая категория matters most пользователю прямо сейчас. Например: «I found problems with visual hierarchy, color usage, and information overload. Which area should we tackle first?» Предложите top 2–3 issue categories как options.

2. **Design intent**: Если critique нашёл tonal mismatch — спросите, был ли он intentional. Например: «The interface feels clinical and corporate. Is that the intended tone, or should it feel warmer/bolder/more playful?» Предложите 2–3 tonal directions как options based on том, что исправило бы найденные issues.

3. **Scope**: Спросите, сколько пользователь хочет взять на себя. Например: «I found N issues. Want to address everything, or focus on the top 3?» Предложите scope options вроде «Top 3 only», «All issues», «Critical issues only».

4. **Constraints** (optional; спрашивайте только если relevant): Если findings касаются многих областей — спросите, есть ли off-limits. Например: «Should any sections stay as-is?» Это не даёт плану касаться того, что пользователь считает done.

**Rules for questions**:
- Каждый вопрос должен reference specific findings из report. Никогда не задавайте generic «who is your audience?» вопросы.
- Держите максимум 2–4 вопроса. Respect время пользователя.
- Предлагайте concrete options, не open-ended prompts.
- Если findings straightforward (например только 1–2 clear issues) — пропустите questions и идите напрямую к Recommended Actions.

Codex final-question gate: User-visible response должен либо включать targeted questions, либо явно сказать `Questions skipped: <reason>`, потому что findings были straightforward. Каждый вопрос должен включать 2–3 concrete answer options, привязанных к actual critique findings. Не заканчивайте только open-ended questions.

### Рекомендуемые действия

**После получения answers пользователя** представьте prioritized action summary, отражающий priorities и scope пользователя из Ask the User.

#### Сводка действий

Перечислите recommended commands в priority order, based on answers пользователя:

1. **`$command-name`**: Brief description of what to fix (specific context from critique findings)
2. **`$command-name`**: Brief description (specific context)
...

**Rules for recommendations**:
- Рекомендуйте только команды из: $impeccable adapt, $impeccable animate, $impeccable audit, $impeccable bolder, $impeccable clarify, $impeccable colorize, $impeccable critique, $impeccable delight, $impeccable distill, $impeccable document, $impeccable harden, $impeccable layout, $impeccable onboard, $impeccable optimize, $impeccable overdrive, $impeccable polish, $impeccable quieter, $impeccable shape, $impeccable typeset
- Order by stated priorities пользователя first, затем by impact
- Description каждого item должна нести enough context, чтобы команда знала, на чём focus
- Map каждый Priority Issue на appropriate command
- Skip команды, которые address zero issues
- Если пользователь выбрал limited scope — включайте только items within that scope
- Если пользователь пометил areas как off-limits — exclude команды, которые касались бы этих areas
- Заканчивайте `$impeccable polish` как final step, если любые fixes были recommended

После presenting summary скажите пользователю:

> You can ask me to run these one at a time, all at once, or in any order you prefer.
>
> Re-run `$impeccable critique` after fixes to see your score improve.

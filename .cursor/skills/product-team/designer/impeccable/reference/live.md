Interactive live variant mode: выбирайте элементы в browser, выбирайте design action и получайте AI-generated HTML+CSS variants, hot-swapped через HMR dev server.

## Предпосылки

Running dev server с hot module replacement (Vite, Next.js, Bun и т.д.), ИЛИ static HTML file, открытый в browser.

## Контракт (прочитать один раз)

Execute по порядку. Никакой step не skipped, никакой step не reordered.

1. `live.mjs`: boot.
2. Navigate к URL, который serves `pageFile` (infer из `package.json`, docs, terminal output или open tab). Если не можете infer уверенно — скажите пользователю один раз открыть их dev/preview URL. Никогда не используйте `serverPort` как этот URL; это helper, не app.
3. Poll loop с default long timeout (600000 ms). После каждого event или `--reply` снова сразу запускайте `live-poll.mjs`. Никогда не передавайте short `--timeout=`.
4. На `generate`: прочитайте screenshot если present; загрузите reference action; спланируйте three distinct directions; напишите все variants одним edit; `--reply done`; poll again.
5. На `accept` / `discard`: poll script запускает `live-accept.mjs`, acknowledges delivered event и печатает `_completionAck`. Plain accepts/discards terminal immediately; carbonize accepts остаются recoverable, пока вы не finish cleanup, не запустите `live-complete.mjs --id EVENT_ID`, и только затем poll again.
6. Если interrupted — запустите `live-status.mjs` или `live-resume.mjs` before guessing. Durable journal replays unacknowledged work после helper restart.
7. На `exit`: запустите cleanup внизу.

Harness policy:
- **Claude Code**: запускайте poll как **background task** (без short timeout). Harness notifies вас при completion, так что main conversation остаётся free. Не block shell.
- **Cursor**: запускайте poll в **foreground** (blocking shell; не background terminal, не subagent). Cursor background terminals и subagents не reliably resume chat с poll stdout.
- **Codex**: запускайте poll в **foreground** (blocking shell; не background task, не subagent). Codex background exec sessions не reliably surface poll stdout обратно в conversation в момент, когда events arrive, так что «fire-and-forget» background poll stall'ит live mode.
- **Other harnesses**: foreground, если вы не знаете, что stdout reliably returns в эту сессию.

Chat — overhead. Нет recap, нет tutorial output, нет pasting PRODUCT / DESIGN bodies. Тратьте tokens на tools и edits; при failure — одно-два short sentences.

## Старт

```bash
node .agents/skills/impeccable/scripts/live.mjs
```

Output JSON: `{ ok, serverPort, serverToken, pageFiles, hasProduct, product, productPath, hasDesign, design, designPath, migrated }`. `pageFiles` — список HTML entries, в которые был injected live script. Держите PRODUCT.md и DESIGN.md в уме для variant generation; **DESIGN.md wins на visual decisions; PRODUCT.md wins на strategic/voice decisions.** Когда DESIGN.md отсутствует, identity **не** absent; extract её из CSS variables, computed styles и sibling components на странице (см. Step 4 Phase A). Identity preservation — default; departure от existing identity требует explicit trigger из PRODUCT.md anti-references или freeform prompt пользователя. Если `migrated: true`, loader auto-renamed legacy `.impeccable.md` в `PRODUCT.md`; упомяните это один раз и предложите `$impeccable document` для matching DESIGN.md.

`serverPort` и `serverToken` принадлежат маленькому **Impeccable live helper** HTTP server (serves `/live.js`, SSE и `/poll`). Этот port **не** ваш dev server и обычно не URL, который вы открываете, чтобы смотреть app. Browser page — тот origin, который serves один из `pageFiles` entries (Vite / Next / Bun / tunnel / LAN hostname).

Если output — `{ ok: false, error: "config_missing" | "config_invalid", path }`, этот проект не configured для live mode (или config stale). См. **First-time setup** внизу.

## Цикл опроса

```
LOOP:
  node .agents/skills/impeccable/scripts/live-poll.mjs   # default long timeout; no --timeout=
  Read JSON; dispatch on "type"

  "generate"  → Handle Generate; reply done; LOOP
  "accept"    → Handle Accept; complete carbonize cleanup if required; LOOP
  "discard"   → Handle Discard; LOOP
  "prefetch"  → Handle Prefetch; LOOP
  "timeout"   → LOOP
  "exit"      → break → Cleanup
```

## Команды восстановления

Live helper persists append-only journal под `.impeccable/live/sessions/`. Browser checkpoints advisory, но durable; journal canonical. Это local durable recovery state, не project source.

Используйте эти команды, когда chat был interrupted, polling был missed, helper restarted или browser reloaded:

```bash
node .agents/skills/impeccable/scripts/live-status.mjs
node .agents/skills/impeccable/scripts/live-resume.mjs --id SESSION_ID
node .agents/skills/impeccable/scripts/live-complete.mjs --id SESSION_ID
```

- `live-status.mjs` печатает connected helper state, active durable sessions и queued pending events. Работает даже когда helper down, читая journal напрямую.
- `live-resume.mjs` печатает active snapshot, pending event, checkpoint phase, visible variant, parameter values и next safe agent action.
- `live-complete.mjs` — canonical manual final acknowledgement. Используйте после того, как carbonize/manual cleanup verified и дальнейший poll acknowledgement не произойдёт автоматически.

Server restart rule: снова запустите `live-server.mjs`, затем poll. Startup requeues unacknowledged pending events из journal, так что не просите пользователя кликнуть Go again, если только `live-resume.mjs` не говорит, что active session не существует.

## Обработка `generate`

Event: `{id, action, freeformPrompt?, count, pageUrl, element, screenshotPath?, comments?, strokes?}`.

Speed matters; пользователь смотрит на spinner. Minimize tool calls, используя `wrap` helper и writing all variants в single edit.

### 1. Прочитайте скриншот (если есть)

`event.screenshotPath` **отправляется только когда пользователь разместил хотя бы один comment или stroke before Go.** Когда present — это absolute path к PNG элемента as rendered с baked-in annotations. **Прочитайте его before planning**: annotations encode user intent, не recoverable только из `element.outerHTML`.

Когда `screenshotPath` отсутствует — не ask for one и не go looking for current rendering. Omission deliberate: без annotations screenshot якорил бы model на existing design и боролся с three-distinct-directions brief. Работайте из `element.outerHTML`, computed styles в `event.element` и freeform prompt если present.

`event.comments` и `event.strokes` несут structured metadata alongside visual. Treat screenshot как primary; используйте structured data для specifics, worth quoting (например exact text comment).

Reading annotations precisely:

- **Comment position несёт meaning.** Его `{x, y}` — element-local CSS px (тот же coord space, что `element.boundingRect`). Найдите child under that point и применяйте comment text LOCALLY к этому sub-element. Comment near title — про title, не global description.
- **Comments и strokes — independent annotations**, если явно не paired по overlap или tight proximity. Не позволяйте visual weight prominent stroke override precise location textually-specific comment elsewhere.
- **Strokes — gestures; читайте их по shape.** Closed loop = «this thing» (emphasis / focus); arrow = direction (move / point to); cross или slash = delete; free scribble = emphasis или delete depending on context. Loop around region X значит «pay attention to X», не «only change pixels inside X».
- **Когда intent stroke ambiguous** (circle или arrow? emphasis или move?) — state ваш reading одним предложением rationale, а не silently guessing. Если uncertainty materially меняет brief — ask one short clarifying question before generating.

### 2. Оберните элемент

```bash
node .agents/skills/impeccable/scripts/live-wrap.mjs --id EVENT_ID --count EVENT_COUNT --element-id "ELEMENT_ID" --classes "class1,class2" --tag "div" --text "TEXT_SNIPPET"
```

Flag mapping. Держите их separate, не collapse в `--query`:

- `--element-id` ← `event.element.id`
- `--classes` ← `event.element.classes` joined with commas
- `--tag` ← `event.element.tagName`
- `--text` ← first ~80 chars of `event.element.textContent` (trim, single-line). **Pass this every call.** Когда picked element shares classes + tag с sibling components (список `<Card>`s, repeating sections) — это то, что disambiguates, какую branch в source wrap'ить. Без этого wrap silently lands на first match и может rewrite wrong element.

Helper searches ID first, затем classes, затем tag + class combo. Если `event.pageUrl` implies file (например `/` обычно `index.html`) — передайте `--file PATH`, чтобы skip search. `--query` — fallback только для raw text search; не используйте для normal element lookups.

Если `--text` matches multiple candidates equally well, wrap exits с `{ error: "element_ambiguous", candidates: [...] }` и `fallback: "agent-driven"`: прочитайте candidate line ranges, решите, какой matches picked element из page context, и напишите wrapper manually per fallback flow.

Output on success: `{ file, insertLine, commentSyntax, styleMode, styleTag, cssSelectorPrefixExamples, cssAuthoring }`.

`styleMode` контролирует, как preview CSS должен быть authored. Treat как detected capability mode, не framework guess:

- `scoped`: используйте `@scope ([data-impeccable-variant="N"])` rules.
- `astro-global-prefixed`: используйте explicit `[data-impeccable-variant="N"]` selector prefixes и exact `styleTag`, returned by the tool.

Используйте `cssAuthoring` как source of truth для current file. Он включает exact `styleTag`, selector strategy, selector examples, requirements и forbidden patterns. Не применяйте framework-specific exception, если только returned `styleMode` / `cssAuthoring.mode` не говорит об этом.

**Fallback errors.** Wrap пишет только в files, которые считает source (tracked by git, не marked GENERATED, не listed в config's `generatedFiles`). Если не может land на source file — errors without writing; accepting variant в generated file — silent data loss. Три shapes:

- `{ error: "file_is_generated", file, hint }`: user-supplied `--file` указывает на generated file.
- `{ error: "element_not_in_source", generatedMatch, hint }`: element существует только в generated file (next build wipe'нул бы любые edits).
- `{ error: "element_not_found", hint }`: element нет ни в одном project file; likely runtime-injected (JS component, dynamic render from data).

Все три несут `fallback: "agent-driven"`. Следуйте **Handle fallback** ниже.

### 3. Загрузите reference действия

Если `event.action` — `impeccable` (default freeform action), используйте shared laws из SKILL.md плюс загруженный register reference (`brand.md` или `product.md`). Не загружайте sub-command reference. **Freeform — не pass, чтобы skip parameters:** вы всё равно следуете composition budget и freeform bias в **§7 Parameters** ниже. Sub-command files list'ят MUST-have signature knobs; у freeform нет такого файла, так что sizing knobs из surface weight и primary axes полностью на вас.

Любой другой `event.action` (`bolder`, `quieter`, `distill`, `polish`, `typeset`, `colorize`, `layout`, `adapt`, `animate`, `delight`, `overdrive`): прочитайте `reference/<action>.md` before planning. Каждый sub-command encodes specific discipline; skipping его reference даёт generic output. Эти files могут требовать specific params; layer их поверх §7 budget, не вместо него.

### 4. Спланируйте три варианта: сначала identity, затем mode, затем оси

Wrong frame для live mode — «show three different design directions». Live runs на existing surface; brand уже выбран. Job — variation **within identity**, не selection between identities. Failure mode: три editorial-typographic variants на brief, который не был editorial. Bigger failure mode: три off-brand variants, которые пользователь не может accept, потому что они не выглядят как их product.

Four phases. Делайте по порядку.

#### Фаза A: извлеките identity (нельзя пропустить)

Existing surface уже имеет identity. Прочитайте её before planning чего-либо. Sources, в priority order:

1. **DESIGN.md** если loaded: прочитайте visual system fields (palette, type pairing, motion, components). Это authoritative answer.
2. **CSS custom properties** в stylesheets страницы (`:root { --color-...; --font-...; ... }`): это de-facto tokens.
3. **Computed styles** на picked element и его parent: colors, fonts, spacing scales, corner radii.
4. **Sibling components на странице**: какую visual rhetoric используют existing components? (Asymmetric или centered? Dense или airy? Bold или quiet?)

Запишите то, что видите, **одним предложением**. Предложение описывает поверхность, которая actually on screen; оно не aspirational, не opinionated, не edited toward того, каким бренд «должен» быть. Capture, roughly в этом порядке:

- Dominant surface color и accent color, по hex или token name (используйте actual values, не categories вроде «warm» или «neutral»).
- Type pairing: actual font names loaded, primary first.
- Layout topology: как arranged dominant elements (stacked / side-by-side / grid / asymmetric / overlay).
- Surface treatment: corners, borders, shadows, density of decoration.
- Voice tone, который вы читаете с самого copy, не с aesthetic feel.

Будьте specific. «Modern» — не цвет, «elegant» — не type pairing, «clean» — не layout. Если не можете extract real value для axis — skip его, а не fabricate. Point — записать what is, не описать what you wish it were.

Не включайте adjectives, называющие aesthetic family («editorial-leaning», «terminal-flavored», «brutalist»); это conclusions, не data. Они принадлежат Phase C lane selection в departure mode, не identity description. Если они sneak в Phase A — identity-lock collapses в self-fulfilling prophecy.

Это предложение — **identity lock**. Каждый variant должен быть readable как тот же brand, если rendered side by side. Skipping этой phase — primary cause of off-brand variants. Absence of DESIGN.md никогда не excuse; extract из CSS и computed styles вместо этого.

#### Фаза B: выберите mode (default vs departure)

**Default mode**: existing identity preserved. Variants варьируют expression axes within it. *Это правильный mode для ~90% live sessions.* Пользователь picked element на real product, который они shipping; они ожидают variants *их* hero, не героев трёх разных brands.

**Departure mode**: existing identity rejected. Variants предлагают alternatives, consistent с PRODUCT.md voice. Trigger только когда хотя бы одно true:

- PRODUCT.md anti-references явно call out current surface («the current `index.html` is itself an example»; «diffuse away from this»; «the page on screen is the failure»). Generic anti-references, описывающие, чего избегать in general, **не** trigger departure mode; только те, что указывают на *эту* поверхность specifically.
- Freeform prompt пользователя явно asks for departure («rebuild this from scratch», «what if it weren't editorial at all», «show me something completely different»).

Если unsure — вы в default mode. Cost of being wrong about default — «three on-brand variants with similar feel»: recoverable, пользователь picks none. Cost of being wrong about departure — «three off-brand variants»: unrecoverable, пользователь annoyed.

#### Фаза C: спланируйте три варианта

**Default mode.** Каждый variant commits к разному **primary axis** of difference, сохраняя identity sentence. Шесть axes:

1. **Hierarchy**: какой element commands the eye?
2. **Layout topology**: stacked / side-by-side / grid / asymmetric / overlay
3. **Typographic system**: pairing logic, scale ratio, case/weight strategy *within the available faces*
4. **Color strategy**: какая existing palette role несёт поверхность (Restrained / Committed / Full palette / Drenched). Используйте existing palette tokens бренда, не new colors.
5. **Density**: minimal / comfortable / dense
6. **Structural decomposition**: merge, split, progressive disclosure

Three variants → three DIFFERENT axes. Trio читается как *the same brand at three angles*. Не вводите new fonts, new palette hues или new aesthetic-family signals; это принадлежит departure mode.

**While planning каждого variant также name его 2–3 parameter knobs** (per §7 budget table). Parameters — часть дизайна, не decoration, добавленная afterward. Если variant explores density — expose density knob. Если explores color commitment — expose color-amount range. Deciding «what's tunable» during planning даёт better knobs, чем retrofitting их на finished HTML.

**Departure mode.** Каждый variant anchors к разному **aesthetic direction**, derived из stated voice и register бренда в PRODUCT.md. НЕ pick из fixed catalog of lane categories. Правильные три directions для этого бренда — не те же, что для другого, и picking из list сам по себе training-data reflex (model selects «Swiss-grid, Terminal, Industrial-signage» every time, потому что это furthest-from-editorial items в любом enumerated list).

Вместо этого работайте от бренда:

1. Прочитайте Brand Personality words из PRODUCT.md. Какие physical, spatial или material experiences воплотили бы эти слова, если design не был involved? (Personality «specific, earned, unmistakable» evokes hand-stamped letter, numbered print, watchmaker's loupe. Personality «restless, loud, unfiltered» evokes concert poster, spray-painted wall, megaphone.)
2. Из этих physical experiences derive три visual directions, которые genuinely different друг от друга И от current surface, от которой вы departing.
3. Избегайте **reflex-reject lanes** в [brand.md](brand.md). Не trade одну monoculture на другую. Если ловите себя reaching for «Swiss-grid» или «Terminal» или «Industrial-signage» по рефлексу — вы pattern-matching catalog в training data, не reading the brand. Start over от personality words.
4. Каждое direction должно быть expressible одним concrete предложением, называющим real-world referent («a museum exhibition label system for a contemporary art gallery» не «clean and minimal»). Если предложение содержит только adjectives — недостаточно concrete.
5. **While planning каждого direction также name его 2–3 parameter knobs** (per §7 budget table). Тот же principle, что в default mode: decide «what's tunable» during planning, не after writing HTML. Departure-mode hero с 0 parameters — не «bold creative vision», а missed opportunity для пользователя fine-tune выбранное direction.

#### Фаза D: squint-тест

**Default mode squint.** Прочитайте identity sentence каждого variant и сравните с locked identity из Phase A. Если любой variant drifted к другой palette, type voice или visual rhetoric — он accidentally crossed в departure mode; rework. Затем проверьте, что каждый variant commits к разному primary axis. Три «tighter density» variants — failure.

**Departure mode squint.** Два passes, family before sentence:

1. **Family pass.** Label каждый variant одним design-family word of your own choosing (любой concrete noun: *exhibition, storefront, cockpit, recipe-card, playbill, field-manual*). Если любые два variants share label, или если label мог бы equally хорошо apply к другим variants — rework. Не используйте fixed vocabulary list для labels. *Этот pass non-negotiable в departure mode и ловит monoculture failure, который sentence pass misses.*
2. **Sentence pass.** Напишите три one-sentence descriptions side by side. Если два из них rhyme («both feature big type» / «both are stacks of sections» / «both center the CTA») — rework the offender.

**Когда primary axis — color или theme, forbid trio from sharing theme + dominant hue.** Two dark-plus-one-dark не distinct. Aim на three color worlds, не three shades of the same.

**Для action-specific invocations** каждый variant должен варьировать along dimension, которую называет action:

- `bolder`: amplify разный dimension per variant (scale / saturation / structural change). Не три «slightly bigger» variants.
- `quieter`: pull back разный dimension (color / ornament / spacing).
- `distill`: remove разный class of excess (visual noise / redundant content / nested structure).
- `polish`: target разный refinement axis (rhythm / hierarchy / micro-details вроде corner radii, focus states, optical kerning).
- `typeset`: разный type pairing AND разный scale ratio each. Не три riffs на один pairing.
- `colorize`: разный hue family each (не shades of one hue). Варьируйте chroma и contrast strategy.
- `layout`: разный structural arrangement (stacked / side-by-side / grid / asymmetric). Не spacing tweaks.
- `adapt`: разный target context per variant (mobile-first / tablet / desktop / print или low-data). Не делайте три mobile layouts.
- `animate`: разный motion vocabulary (cascade stagger / clip wipe / scale-and-focus / morph / parallax). Не три staggered fades.
- `delight`: разный flavor of personality (unexpected micro-interaction / typographic surprise / illustrated accent / sonic-or-haptic moment / easter-egg interaction).
- `overdrive`: разный convention broken (scale / structure / motion / input model / state transitions). Skip шаг «propose and ask» из `overdrive.md`; live mode non-interactive.

### 5. Примените freeform prompt (если есть)

`event.freeformPrompt` — ceiling пользователя на direction (все variants должны honor его), но всё равно explore meaningfully different *interpretations*. Interpretations остаются within того mode, который вы picked в Phase B.

В **default mode** prompt сужает axes, которые вы выбираете, не identity. *«Make it feel more confident»* → variant 1 amplifies hierarchy (один element commands the eye), variant 2 commits existing accent color (Committed strategy на hue бренда), variant 3 tightens density и removes decorative slack. Три разных axes, same brand.

В **departure mode** prompt сужает lanes, из которых вы draw, не families. *«Make it feel like a newspaper front page»* сам по себе был бы departure-mode prompt; honor его, но pick три meaningfully different newspaper-adjacent lanes (broadsheet vs. tabloid vs. trade journal) и запустите family pass, чтобы confirm, что они не collapse в одно.

Когда prompt и PRODUCT.md anti-references conflict (prompt asks for X, anti-references ban X) — anti-references win; они описывают standing position бренда, prompt — один момент.

### 6. Запишите все варианты одним edit

Complete HTML replacement original element для каждого variant, не CSS-only patch. Учитывайте context элемента (computed styles, parent structure, CSS variables из `event.element`).

Напишите CSS + все variants в ONE edit на `insertLine`, reported by `wrap`. Colocate CSS как `<style>` tag внутри variant wrapper; `<style>` работает anywhere в modern browsers, и это обеспечивает, что CSS и HTML arrive atomically (нет FOUC).

Используйте объект `cssAuthoring`, returned by `live-wrap.mjs`, чтобы author temporary preview CSS. Style opening tag ниже — common case; замените его на `cssAuthoring.styleTag`, когда tool returns другой. Shape markup variants иначе stable:

```html
<!-- Variants: insert below this line -->
<style data-impeccable-css="SESSION_ID">
  /* rules matching cssAuthoring.rulePattern */
</style>
<div data-impeccable-variant="1">
  <!-- variant 1: full element replacement (single top-level element) -->
</div>
<div data-impeccable-variant="2" style="display: none">
  <!-- variant 2: full element replacement -->
</div>
<div data-impeccable-variant="3" style="display: none">
  <!-- variant 3: full element replacement -->
</div>
```

**Каждый variant div содержит ровно один top-level element: full replacement для original.** Используйте тот же tag, что original (например `<section>`, если пользователь picked `<section>`). Loose siblings (heading + paragraph + div как direct children variant div) ломают outline tracking и accept flow, которые оба assume one child.

У first variant нет `display: none` (visible by default). У всех остальных есть. Если variants используют только inline styles и нет preview CSS — omit `<style>` tag entirely.

One edit, all variants; MutationObserver browser picks everything up in one pass.

Для `styleMode: "scoped"` author каждое `:scope` rule с descendant combinator. `@scope` boundary — **variant wrapper `<div data-impeccable-variant="N">`**, не элемент, который вы проектируете. Bare `:scope { background: cream; }` styles wrapper, не inner replacement, так что cream lands на `display: contents` shell, пока actual element keeps page defaults. Always step in: `:scope > .card`, `:scope > section`, `:scope .hero-title` и т.д. CSS fake test agent в `tests/live-e2e/agent.mjs` — faithful template; каждое scoped rule начинается `:scope > ...`.

**JSX / TSX target files.** Wrap содержимое `<style>` в template literal, чтобы CSS `{` / `}` не парсились как JSX expressions, и используйте `className=` / `style={{…}}` на каждом variant element. Держите атрибуты `data-impeccable-*` as-is; они plain strings:

```tsx
<style data-impeccable-css="SESSION_ID">{`
  @scope ([data-impeccable-variant="1"]) { ... }
  @scope ([data-impeccable-variant="2"]) { ... }
`}</style>
<div data-impeccable-variant="1">
  {/* variant 1 */}
</div>
<div data-impeccable-variant="2" style={{ display: 'none' }}>
  {/* variant 2 */}
</div>
```

Wrap script уже даёт вам single-rooted JSX wrapper: outer element `<div data-impeccable-variants="…">` с marker comments tucked inside. Drop блок variants выше в comment «Variants: insert below this line», и source остаётся valid TSX.

### 7. Параметры (composition-sized, 0–4 на вариант)

Каждый variant может expose **coarse** knobs alongside full HTML/CSS replacement. Browser docks small panel справа от outline с одним control per parameter. Пользователь drags/clicks и видит instant feedback: zero regeneration cost, потому что knob toggles CSS variable или data attribute, против которого scoped CSS варианта уже authored.

**Что «optional» не значит.** Parameters — не nice-to-have decoration на large work. Слово означало «omit controls, которые redundant или cosmetic», не «default to zero, потому что three variants были enough work».

**When to add.** Как только scoped CSS варианта имеет meaningful continuous или stepped axis: density, color amount, type scale, motion intensity, column weight и т.д. Если можете представить, как пользователь бормочет «a bit tighter» или «a touch more accent» **без** желания full regeneration — wire этот axis. **Не** micro-margins или one-off nudges; это не parameters.

**Freeform (`action` is `impeccable`) bias.** Вы не загрузили sub-command reference, так что должны **choose** signature axes сами. Match budget table: для hero или large composition это значит **2–3 axes per variant**, не 1. Prefer knobs, сидящие на dimensions, где ваши three variants actually differ (если density varies — expose как `steps` knob; если color commitment varies — expose как `range`). Hero, shipping с **0** params — почти всегда mistake, не judgment call. Hero с ровно **1** param — underweight, если только design genuinely не fixed-point comparison. Start от budget table, не от zero.

**Budget scales с visual weight элемента, не token budget.** Knobs нуждаются в real estate, чтобы читаться как tunable; three sliders на single control — noise.

- **Leaf / tiny**: single button, icon, input, bare heading, solitary paragraph: **0 params.**
- **Small composition**: labeled input, simple card, short callout (≤ ~5 visual children): **0–1** params, когда один dominant axis obvious; иначе **0.**
- **Medium composition**: section component, nav cluster, dense card, short feature block (6–15 visual children): **target 2**; **1** acceptable, если block simple; **0** только когда variants truly fixed points.
- **Large composition**: hero section, full page region, spread layout, strong internal structure (16+ visual children или multiple sub-sections): **target 2–3**; **up to 4**, когда несколько independent axes (например structure `steps` + `density` + один accent) все authored в scoped CSS.

**When in doubt, ask whether a dial exists before defaulting to zero.** Пользователь всегда может request more variants, но point of live mode — instant tuning without another Go. Crowding the panel плохо; **under-shipping** knobs на dense composition — более частый failure для freeform. Count по **visual** children, не DOM depth; shallow-but-wide hero всё ещё large.

**Hard cap per variant**: максимум **four** parameters, чтобы panel оставался legible; rare fifth только если reference explicitly allows.

**How to declare.** Положите JSON manifest на variant wrapper:

```html
<div data-impeccable-variant="1" data-impeccable-params='[
  {"id":"color-amount","kind":"range","min":0,"max":1,"step":0.05,"default":0.5,"label":"Color amount"},
  {"id":"density","kind":"steps","default":"snug","label":"Density","options":[
    {"value":"airy","label":"Airy"},
    {"value":"snug","label":"Snug"},
    {"value":"packed","label":"Packed"}
  ]},
  {"id":"serif","kind":"toggle","default":false,"label":"Serif display"}
]'>
  ...variant content...
</div>
```

**Three kinds:**

- `range`: smooth slider. Drives CSS custom property `--p-<id>` на variant wrapper. Author CSS с `var(--p-color-amount, 0.5)`. Fields: `min`, `max`, `step`, `default` (number), `label`.
- `steps`: segmented radio. Drives data attribute `data-p-<id>` на variant wrapper. Author CSS с `:scope[data-p-density="airy"] .grid { ... }`. Fields: `options` (array of `{value, label}`), `default` (string), `label`.
- `toggle`: on/off switch. Drives BOTH CSS var (`--p-<id>: 0|1`) и data attribute (present when on, absent when off). Используйте whichever more convenient. Fields: `default` (boolean), `label`.

**Signature params per action.** Для named sub-commands прочитайте `reference/<action>.md` этого action для одного-двух **MUST** params (например `layout` → `density`). Они non-negotiable, когда design может express их. **У freeform нет file-level MUST**; **Freeform (`impeccable`) bias** в этой секции — stand-in. Если action пользователя одновременно stylized и sub-command (например `colorize`) — MUST list sub-command takes precedence для его axes; всё равно respect **Hard cap** и не добавляйте redundant duplicate knobs.

**Reset on variant switch.** Пользователь dials density на v1, flips к v2, v2 starts at declared defaults v2. Known limitation; preservation across variants may land later.

**On accept** browser sends current values пользователя в accept event. `live-accept.mjs` пишет их как sibling comment:

```html
<!-- impeccable-param-values SESSION_ID: {"color-amount":0.7,"density":"packed"} -->
```

Carbonize cleanup step (см. ниже) читает этот comment и bakes chosen values в final CSS. Для `steps`/`toggle` attribute selectors: keep только branch matching chosen value, drop others, collapse `:scope[data-p-density="packed"] .grid` к semantic class rule. Для `range` vars: либо substitute literal, либо keep var с chosen value как new default.

### 8. Сигнал о завершении

```bash
node .agents/skills/impeccable/scripts/live-poll.mjs --reply EVENT_ID done --file RELATIVE_PATH
```

`RELATIVE_PATH` relative к project root (`public/index.html`, `src/App.tsx` и т.д.); browser fetches source напрямую, если у dev server нет HMR.

Затем сразу снова запустите `live-poll.mjs`.

### Прерывание активной сессии

Если wrap или generation fails после того, как browser flipped к GENERATING (например wrap landed на wrong source branch и вы уже reverted его, или generation hit unrecoverable error) — скажите **browser**, чтобы его bar reset к PICKING:

```bash
node .agents/skills/impeccable/scripts/live-poll.mjs --reply EVENT_ID error "Short reason"
```

Не запускайте `live-accept --discard` для этого; это pure file mutator, browser его не видит, и bar stuck на GENERATING dots forever (пользователю приходится refresh). `--discard` correct только когда **browser** инициировал discard (пользователь кликнул ✕ during CYCLING) и agent просто запускает source-side cleanup, который browser уже triggered.

## Обработка fallback

Когда wrap returns `fallback: "agent-driven"`, deterministic flow не применяется. Pick up здесь.

Goal тот же: дать пользователю three variants to choose from И persist accepted один в месте, которое next build не wipe'нет. Difference — вы должны pick правильный source file сами.

### Шаг 1: определите, где элемент реально живёт

Используйте error payload:

- `element_not_in_source` с `generatedMatch: "public/docs/foo.html"`: served HTML generated. Найдите generator (grep for writers of that path, например `scripts/build-sub-pages.js`, Astro/Next template) и locate template или partial, который emits этот element.
- `element_not_found`: element runtime-injected. Ищите component, который его renders (React/Vue/Svelte), JS, который assembles его, или data source, который feeds его.
- `file_is_generated` с `file: "..."`: пользователь указал на generated file explicitly. Same resolution, что `element_not_in_source`.

Читайте candidate source, пока не уверены, куда принадлежит change к element. Если change purely visual — source может быть shared stylesheet, не template.

### Шаг 2: покажите три варианта в DOM для preview

Browser bar ждёт variants. Даже без wrapper в source вам всё равно нужно show something:

1. Manually напишите wrapper scaffold в **served** file (тот, который browser actually loaded). Используйте ту же structure, которую производит `live-wrap.mjs`; `<!-- impeccable-variants-start ID --><div data-impeccable-variants="ID" data-impeccable-variant-count="3" style="display: contents">…</div><!-- end -->`.
2. Insert ваши three variant divs внутри, same shape, что deterministic path.
3. Signal done с `--reply EVENT_ID done --file <served file>`. No-HMR fallback browser fetches и injects.

Этот served-file edit **temporary**: next regen wipe'нет его, и это fine. Real work происходит on accept.

### Шаг 3: при accept запишите в настоящий source

Когда accept event arrives (`_acceptResult.handled` обычно будет `false` здесь, потому что accept тоже refuses persist в generated files; см. Handle accept для carbonize branch) — extract content accepted variant и напишите в source, identified в Step 1:

- Structural change → edit template / component source.
- Visual-only change → add или update rules в appropriate stylesheet; remove inline `<style>` scope.
- Dynamic from data → update data source или render logic.

Затем remove temporary wrapper из served file, если он ещё там.

### Шаг 4: при discard очистите served file

Remove wrapper, который вы inserted в Step 2. Больше нечего делать.

## Обработка `accept`

Event: `{id, variantId, _acceptResult, _completionAck}`. Poll script уже запустил `live-accept.mjs`, чтобы handle file operation deterministically, затем acknowledged event delivery helper'у. Browser DOM уже updated.

- `_completionAck.ok !== true`: пока не poll. Запустите `live-status.mjs` / `live-resume.mjs`, complete cleanup manually если нужно, затем запустите `live-complete.mjs --id EVENT_ID`.
- `_acceptResult.handled: true` и `carbonize: false`: нечего делать. Poll again.
- `_acceptResult.handled: true` и `carbonize: true`: **post-accept cleanup required before next poll.** См. секцию «Required after accept (carbonize)» ниже. Поле `event._acceptResult.todo`, `_completionAck.requiresComplete` и stderr banner все указывают на этот required follow-up; ничего не decorative. После cleanup запустите `live-complete.mjs --id EVENT_ID`, затем poll again.
- `_acceptResult.handled: false, mode: "fallback"`: session жила в generated file, и script refused persist туда. Вы уже написали accepted variant в true source during Handle fallback Step 3; просто clean up temporary wrapper в served file если есть, и poll again.
- `_acceptResult.handled: false` без `mode`: manual cleanup: read file, find markers, edit.

### Обязательно после accept (carbonize)

Когда `_acceptResult.carbonize === true`, accepted variant был stitched в source с helper markers и inline CSS, чтобы browser мог render его immediately без visual gap. Этот stitch-in **temporary**. Agent должен rewrite его в permanent form before doing anything else. Skipping оставляет dead `@scope` rules для unaccepted variants, pointless `data-impeccable-variant` wrapper и `impeccable-carbonize-start/end` comment noise в source file; всё это accumulate across sessions.

Сделайте эти five steps в current thread, synchronously, before next poll. Не poll again, пока file не clean.

1. **Locate the carbonize block** в source file (`_acceptResult.file`). Он bracketed `<!-- impeccable-carbonize-start SESSION_ID -->` и `<!-- impeccable-carbonize-end SESSION_ID -->` и содержит элемент `<style data-impeccable-css="SESSION_ID">`. Если variant declared parameters — comment `<!-- impeccable-param-values SESSION_ID: {...} -->` sits alongside style tag с chosen values пользователя; прочитайте его first; он drives steps 3 и 4 ниже.
2. **Move the CSS rules** в real stylesheet проекта. Какой stylesheet зависит от проекта (например `site/styles/workflow.css` для Astro project, или co-located CSS file компонента для Vite/Next project; pick whichever already owns styling для surrounding element).
3. **Bake in parameter values while rewriting selectors.** Для wrappers `@scope ([data-impeccable-variant="N"])`: retarget к real, semantic classes на accepted HTML (`.why-visual--v2 .v2-label { … }`). Для selectors `:scope[data-p-<id>="VALUE"]`: keep только branch matching chosen value из param-values comment; drop others (они dead after accept). Для `var(--p-<id>, DEFAULT)` в CSS: либо substitute literal value, либо если param всё ещё useful как knob going forward — leave var и update его initial declaration к chosen value.
4. **Unwrap the accepted content.** Delete `<div data-impeccable-variant="N" style="display: contents">`, который wraps его. Drop `data-impeccable-params` и любые атрибуты `data-p-*` с него; это live-mode plumbing, не source.
5. **Delete the inline `<style>` block, the `<!-- impeccable-param-values -->` comment if present, and both `<!-- impeccable-carbonize-start/end -->` markers.** Также drop любые `@scope` rules для variants other than accepted one; теперь это dead code.

После того как file clean — запустите `live-complete.mjs --id SESSION_ID`, verify что reports `phase: "completed"`, затем poll again.

Background agent может быть использован для rewrite, но current thread ответственен за verifying, что five steps complete before issuing next poll. На практике inline обычно faster и less error-prone.

## Обработка `discard`

Event: `{id, _acceptResult, _completionAck}`. Poll script уже restored original, removed all variant markers и acknowledged `discarded` durable completion. Нечего делать, если только `_completionAck.ok !== true`; в этом случае запустите `live-complete.mjs --id EVENT_ID --discarded`, затем poll again.

## Обработка `prefetch`

Event: `{pageUrl}`. Browser fires это в первый раз, когда пользователь selects element на данном route, как latency shortcut; сигнализирует, что пользователь likely about to Go на странице, которую вы ещё не читали.

Resolve `pageUrl` к underlying file:

- Root `/` → `pageFile`, returned by `live.mjs` (обычно `public/index.html` или equivalent).
- Sub-routes (например `/docs`, `/docs/live`) → generated или source file для этого route. Используйте знание project layout (multi-page static sites часто resolve `/foo` → `public/foo/index.html`; SPAs могут map all routes к single entry).

Прочитайте file в context, затем poll again. Нет `--reply`: это speculative pre-work; Go придёт later. Если не можете confidently resolve route к file — skip и poll again.

Dedupe — job browser (один prefetch per unique pathname per session); trust it. Если тот же file shows up twice из разных routes, mapping к тому же file — второй Read всё равно cached.

## Выход

Пользователь может stop live mode через:
- Saying «stop live mode» / «exit live» в chat
- Closing browser tab (SSE drops, poll returns `exit` after 8s)
- Exit button browser

Когда poll returns `exit` — proceed к cleanup. Если poll всё ещё running как background task — kill его first.

## Очистка

```bash
node .agents/skills/impeccable/scripts/live-server.mjs stop
```

Stops HTTP server и запускает `live-inject.mjs --remove`, чтобы strip `localhost:…/live.js` из HTML entry. Чтобы stop server, но keep inject tag (для quick restart) — используйте `stop --keep-inject`. `.impeccable/live/config.json` persists как project config для future sessions.

Затем:
- Remove любые leftover variant wrappers (search for `impeccable-variants-start` markers).
- Remove любые leftover carbonize blocks (search for `impeccable-carbonize-start` markers).

## Первичная настройка (config отсутствует или невалиден)

Если `live.mjs` outputs `{ ok: false, error: "config_missing" | "config_invalid", path }` — напишите live config по reported path. По умолчанию это `.impeccable/live/config.json`.

Schema:

```json
{
  "files": ["<path-or-glob>", "<path-or-glob>", ...],
  "exclude": ["<optional-glob>", ...],
  "insertBefore": "</body>",
  "commentSyntax": "html",
  "cspChecked": true
}
```

`files` — inject target; **HTML files, которые browser actually loads**, не обязательно source. Каждая entry — либо literal path (`"public/index.html"`), либо glob pattern (`"public/**/*.html"`). Tracked или generated не важно здесь; у wrap свой generated-file guard, и accepts идут через fallback flow.

`exclude` (optional) — список glob patterns matching files to skip, даже если `files` glob включил бы их. Используйте для email templates, demo fixtures или любого HTML, который не live page.

`cspChecked` tracks, запускался ли уже CSP detection step ниже. Absent on first setup; set to `true` после того, как CSP checked (whether patched, declined или not needed).

**Hard-excluded paths (cannot be overridden).** `**/node_modules/**` и `**/.git/**` never matched независимо от того, что пишет пользователь. Это vendor/metadata directories, и injecting в них silently instrument'ировал бы third-party code.

**Glob syntax.** `**` matches любое число path segments (включая zero), `*` matches любые characters except `/`, `?` matches single character except `/`. Paths всегда relative к project root с forward slashes.

| Framework | `files` | `insertBefore` | `commentSyntax` |
|-----------|---------|----------------|-----------------|
| SPA with single shell (Vite / React / Plain HTML) | `["index.html"]` | `</body>` | `html` |
| Next.js (App Router) | `["app/layout.tsx"]` | `</body>` | `jsx` |
| Next.js (Pages) | `["pages/_document.tsx"]` | `</body>` | `jsx` |
| Nuxt | `["app.vue"]` | `</body>` | `html` |
| Svelte / SvelteKit | `["src/app.html"]` | `</body>` | `html` |
| Astro | `[" <root layout .astro>"]` | `</body>` | `html` |
| Multi-page (separate HTML per route) | `["public/**/*.html"]`: a glob covering the served directory | `</body>` | `html` |

Pick anchor, который существует в каждом file (`</body>` почти всегда работает). Используйте `insertAfter`, если anchor должен match **after** specific line.

Для multi-page sites **prefer glob over literal file list**. New pages, added later, picked up автоматически на следующем `live-inject.mjs` run; config maintenance не нужна.

Для multi-page sites, чьи pages *rebuilt* generator'ом (Astro, static-site generators, custom scripts вроде `build-sub-pages.js`), inject survives только until next regeneration. Re-run `live.mjs` после каждого build. Accept unaffected; он пишет в true source через fallback flow.

### Предупреждение drift-heal

На каждом boot `live.mjs`, после inject, проект сканируется на HTML files под common page-source roots (`public/`, `src/`, `app/`, `pages/`). Если существуют какие-то, не covered resolved `files` list — output включает поле `configDrift`:

```json
{
  "ok": true,
  "serverPort": 8400,
  "pageFiles": [ "..." ],
  "configDrift": {
    "orphans": ["public/new-section/index.html", "public/docs/new-command.html"],
    "orphanCount": 2,
    "hint": "2 HTML file(s) exist but aren't in config.files. Consider adding them, or use a glob pattern like \\"public/**/*.html\\"."
  }
}
```

Когда `configDrift` present — surface его пользователю один раз per session before entering poll loop:

> Noticed N HTML file(s) in the project that aren't in `config.files`:
>
> - `public/new-section/index.html`
> - `public/docs/new-command.html`
>
> Add them, or switch `files` to a glob like `["public/**/*.html"]` and let it track new pages automatically?

Не auto-update config; let the user decide. `configDrift` — `null`, когда drift нет.

### Обнаружение CSP (только при первом запуске)

Если `config.cspChecked === true` — skip эту entire section. Вы уже спрашивали этого пользователя once; answer sticks.

Иначе запустите detection helper:

```bash
node .agents/skills/impeccable/scripts/detect-csp.mjs
```

Output: `{ shape, signals }`, где `shape` — одно из `append-arrays`, `append-string`, `middleware`, `meta-tag` или `null`. Shape named по *patch mechanism*, так что один template covers many frameworks.

- **`null`**: нет CSP; skip к writing `.impeccable/live/config.json` с `cspChecked: true`.
- **`append-arrays`**: CSP defined как structured directive arrays. Auto-patchable. См. *append-arrays* ниже. Covers:
  - Monorepo helpers с options `additionalScriptSrc` / `additionalConnectSrc` (Next.js + shared config package)
  - SvelteKit `kit.csp.directives`
  - Nuxt `nuxt-security` module's `contentSecurityPolicy`
- **`append-string`**: CSP written как literal value string. Auto-patchable. См. *append-string* ниже. Covers:
  - Inline `next.config.*` `headers()` с CSP literal
  - Nuxt `routeRules` / `nitro.routeRules` headers
- **`middleware`** или **`meta-tag`**: rarer. Detected, но не auto-patched в v1. Покажите пользователю detected files и попросите добавить `http://localhost:8400` к `script-src` и `connect-src` manually, затем mark `cspChecked: true` и proceed.

#### Шаблон consent prompt

Используйте эту phrasing, чтобы experience был consistent across agents:

> **CSP patch needed.** I detected a Content Security Policy in your project that blocks `http://localhost:8400`: the live picker won't load without an allowance. Here's the change I'd make:
>
> ```diff
> [file: <patchTarget>]
> [exact diff, 2–5 lines]
> ```
>
> It's guarded by `NODE_ENV === "development"` so the extra entry only appears in dev and never reaches production. You can remove it any time by reverting this file. Apply? [y/n]

On «no»: skip patch, упомяните, что live не будет работать, пока пользователь не добавит allowance manually, всё равно напишите `cspChecked: true` (вопрос уже задан).

On «yes»: apply Shape-specific patch ниже, затем напишите `cspChecked: true`.

#### append-arrays

CSP expressed как structured directive arrays. Patch mechanism: declare dev-only array, spread его в script-src и connect-src arrays.

**Declare near the top of the file that holds the CSP arrays:**

```ts
// Dev-only allowance so impeccable live mode can load. Guarded by NODE_ENV.
const __impeccableLiveDev =
  process.env.NODE_ENV === "development" ? ["http://localhost:8400"] : [];
```

**Append `...__impeccableLiveDev` to the script-src and connect-src directive arrays.** Per-framework specifics:

- **Next.js + monorepo helper**: edit *app's* `next.config.*` (не shared helper), appending к `additionalScriptSrc` и `additionalConnectSrc`, passed into `createBaseNextConfig` (или equivalent). Держит shared package clean.
- **SvelteKit**: edit `svelte.config.js`, appending к `kit.csp.directives['script-src']` и `kit.csp.directives['connect-src']`.
- **Nuxt + nuxt-security**: edit `nuxt.config.*`, appending к `security.headers.contentSecurityPolicy['script-src']` и `['connect-src']`.

Reference outputs:
- `tests/framework-fixtures/nextjs-turborepo/expected-after-patch.ts` (Next.js)
- `tests/framework-fixtures/sveltekit-csp/expected-after-patch.js` (SvelteKit)

Idempotency: если `__impeccableLiveDev` уже существует в file — patch already applied; skip asking и просто mark `cspChecked: true`.

#### append-string

CSP built как literal value string. Two-point patch: declare dev-only string near the top, interpolate его в CSP на directives `script-src` и `connect-src`.

```ts
// Dev-only allowance so impeccable live mode can load.
const __impeccableLiveDev =
  process.env.NODE_ENV === "development" ? " http://localhost:8400" : "";
```

Затем в CSP value string:
- `script-src 'self' 'unsafe-inline'` → `` `script-src 'self' 'unsafe-inline'${__impeccableLiveDev}` ``
- `connect-src 'self'` → `` `connect-src 'self'${__impeccableLiveDev}` ``

(Leading space на dev string, чтобы concatenate cleanly в existing value. Convert literal CSP directives в template strings как часть edit, если они ещё не.)

Per-framework specifics:
- **Next.js inline `headers()`**: edit `next.config.*`, splicing variable в CSP value.
- **Nuxt `routeRules`**: edit `nuxt.config.*`, splicing в CSP в `routeRules['/**'].headers['Content-Security-Policy']`.

Reference outputs:
- `tests/framework-fixtures/nextjs-inline-csp/expected-after-patch.js` (Next.js)
- `tests/framework-fixtures/nuxt-csp/expected-after-patch.ts` (Nuxt)

### Устранение неполадок

Если пользователь сказал «no» CSP patch at setup time и later complains, что live doesn't work: их dev CSP blocks `http://localhost:8400`. Fix: delete `cspChecked` из `.impeccable/live/config.json` и re-run `live.mjs`: setup спросит again.

Затем re-run `live.mjs`.

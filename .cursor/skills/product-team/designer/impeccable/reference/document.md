Сгенерируйте файл `DESIGN.md` в корне проекта, который фиксирует текущую visual design system, чтобы AI agents, генерирующие новые screens, оставались on-brand.

DESIGN.md следует [официальному формату Google Stitch DESIGN.md](https://stitch.withgoogle.com/docs/design-md/format/): YAML frontmatter с machine-readable design tokens, затем markdown body ровно с шестью секциями в фиксированном порядке. **Tokens нормативны; prose даёт контекст, как их применять.** Секции могут быть опущены, когда не relevant, но **не переупорядочивайте их и не переименовывайте**. Section headers должны совпадать со spec character-for-character, чтобы файл оставался parseable другими DESIGN.md-aware tools (Stitch itself, awesome-design-md, skill-rest и т.д.).

## Frontmatter: схема токенов

YAML frontmatter — machine-readable слой. Это то, что валидирует linter Stitch и из чего live panel рендерит tiles. Держите tight; каждая entry должна соответствовать token, который проект действительно использует.

```yaml
---
name: <project title>
description: <one-line tagline>
colors:
  primary: "#b8422e"
  neutral-bg: "#faf7f2"
  # ...one entry per extracted color; key = descriptive slug
typography:
  display:
    fontFamily: "Cormorant Garamond, Georgia, serif"
    fontSize: "clamp(2.5rem, 7vw, 4.5rem)"
    fontWeight: 300
    lineHeight: 1
    letterSpacing: "normal"
  body:
    # ...
rounded:
  sm: "4px"
  md: "8px"
spacing:
  sm: "8px"
  md: "16px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.neutral-bg}"
    rounded: "{rounded.sm}"
    padding: "16px 48px"
  button-primary-hover:
    backgroundColor: "{colors.primary-deep}"
---
```

Rules that matter:

- **Token refs** используют `{path.to.token}` (например `{colors.primary}`, `{rounded.md}`). Components могут reference primitives; primitives не могут reference друг друга.
- **Stitch validates colors as hex sRGB only** (`#RGB` / `#RGBA` / `#RRGGBB` / `#RRGGBBAA`); OKLCH/HSL/P3 вызывают linter warning, не hard error. YAML принимает строку любым способом, и наш parser format-agnostic. Выбирайте based on project posture: (a) если у проекта доктрина «OKLCH-only» или Display-P3 values, которые не round-trip через sRGB — кладите OKLCH напрямую в frontmatter и принимайте Stitch linter warning; (b) если проект хочет strict Stitch compliance или планирует использовать их Tailwind/DTCG export pipeline — кладите hex в frontmatter и держите OKLCH в prose как canonical reference. Никогда не split source of truth без explicit reason.
- **Component sub-tokens** ограничены 8 props: `backgroundColor`, `textColor`, `typography`, `rounded`, `padding`, `size`, `height`, `width`. Shadows, motion, focus rings, backdrop-filter: ничего из этого не вмещается. Несите их в sidecar (Step 4b).
- **Scale keys open-ended.** Используйте любые имена, которые проект уже использует (`warm-ash-cream`, `surface-container-low`). Не переименовывайте в Material defaults.
- **Variants — naming convention, не schema.** `button-primary` / `button-primary-hover` / `button-primary-active` как sibling keys.

## Markdown-тело: шесть секций (точный порядок)

1. `## Overview`
2. `## Colors`
3. `## Типографика`
4. `## Elevation`
5. `## Components`
6. `## Do's and Don'ts`

Optional evocative subtitles разрешены в форме `## 2. Colors: The [Name] Palette` (собственные outputs Stitch так делают), но literal word в каждом header (Overview, Colors, Typography, Elevation, Components, Do's and Don'ts) должен присутствовать. НЕ добавляйте extra top-level sections (Layout Principles, Responsive Behavior, Motion, Agent Prompt Guide). Fold этот контент в шесть spec sections, куда он naturally принадлежит.

## Когда запускать

- Пользователь только что запустил `$impeccable teach` и нуждается в documented visual side.
- Skill заметил, что `DESIGN.md` не существует, и nudged пользователя создать.
- Существующий `DESIGN.md` stale (дизайн drifted).
- Перед large redesign, чтобы зафиксировать текущее состояние как reference.

Если `DESIGN.md` уже существует, **не silently overwrite его**. Покажите пользователю existing file и STOP и используйте структурированный инструмент вопросов Codex, когда доступен; если недоступен, спросите напрямую в чате, чтобы уточнить то, что нельзя вывести. — refresh, overwrite или merge.

## Два пути

- **Scan mode** (default): у проекта есть design tokens, components или rendered output. Extract, затем confirm descriptive language. Используйте, когда есть code to analyze.
- **Seed mode**: проект pre-implementation (fresh teach, ничего ещё не построено). Interview для пяти high-level answers, напишите minimal DESIGN.md с маркером `<!-- SEED -->`. Re-run в scan mode, когда появится code.

Decide, сначала просканировав (Scan mode Step 1). Если scan не находит tokens, component files и rendered site — предложите seed mode; не silently switch. `$impeccable document --seed` форсирует seed mode независимо от наличия code.

## Режим scan (подход C: auto-extract, затем подтверждение descriptive language)

### Шаг 1: найдите design assets

Ищите в codebase в priority order:

1. **CSS custom properties**: grep для `--color-`, `--font-`, `--spacing-`, `--radius-`, `--shadow-`, `--ease-`, `--duration-` declarations в CSS files (обычно `src/styles/`, `public/css/`, `app/globals.css` и т.д.). Запишите name, value и file, где defined.
2. **Tailwind config**: если `tailwind.config.{js,ts,mjs}` существует, прочитайте блок `theme.extend` для colors, fontFamily, spacing, borderRadius, boxShadow.
3. **CSS-in-JS theme files**: styled-components, emotion, vanilla-extract, stitches; ищите `theme.ts`, `tokens.ts` или equivalent.
4. **Design token files**: `tokens.json`, `design-tokens.json`, Style Dictionary output, W3C token community group format.
5. **Component library**: просканируйте main button, card, input, navigation, dialog components. Отметьте их variant APIs и default styles.
6. **Global stylesheet**: root CSS file обычно содержит base typography и color assignments.
7. **Visible rendered output**: если browser automation tools доступны, загрузите live site и sample computed styles с key elements (body, h1, a, button, .card). Это ловит values, которые tokens miss.

### Шаг 2: auto-extract всего, что можно извлечь автоматически

Постройте structured draft из discovered tokens. Для каждого token class:

- **Colors**: Группируйте в Primary / Secondary / Tertiary / Neutral (Material-derived roles, которые использует Stitch). Если у проекта только один accent — выразите как Primary + Neutral; omit Secondary и Tertiary, а не invent их.
- **Typography**: Map observed sizes и weights на Material hierarchy (display / headline / title / body / label). Отметьте font-family stacks и scale ratio.
- **Elevation**: Catalogue shadow vocabulary. Если проект flat и использует tonal layering вместо — это valid answer; скажите явно.
- **Components**: Для каждого common component (button, card, input, chip, list item, tooltip, nav) extract shape (radius), color assignment, hover/focus treatment, internal padding.
- **Spacing + layout**: Fold в Overview или relevant Components. У spec НЕТ Layout section.

### Шаг 2b: подготовьте frontmatter

Из auto-extracted tokens draft YAML frontmatter сейчас (запишете его в top of DESIGN.md в Step 4). Это machine-readable слой: то, что consume live panel и linter Stitch.

- **Colors**: одна entry на extracted color. Key = descriptive slug (`warm-ash-cream`, `editorial-magenta`, не `blue-800`). Value = тот format, который проект считает canonical (OKLCH или hex; см. frontmatter rules выше). Не split source of truth: один format в frontmatter, не redefine тот же token в prose с другим value.
- **Typography**: одна entry на role (`display`, `headline`, `title`, `body`, `label`). Typography — object; включайте только props, которые real для проекта (`fontFamily`, `fontSize`, `fontWeight`, `lineHeight`, `letterSpacing`, `fontFeature`, `fontVariation`).
- **Rounded / Spacing**: какие scale steps проект действительно использует, keyed тем scale name, который использует проект (`sm` / `md` / `lg`, или `surface-sm`, или numeric steps).
- **Components**: одна entry на variant (`button-primary`, `button-primary-hover`, `button-ghost`). Reference primitives через `{colors.X}`, `{rounded.Y}`. Если variant нуждается в property, которого нет в 8-prop set Stitch (shadow, focus ring, backdrop-filter) — несите full snippet в sidecar.

Skip всё, чего у проекта нет. Empty scale keys или fabricated tokens pollute the spec.

### Шаг 3: спросите у пользователя qualitative language

Следующее требует creative input, который нельзя auto-extract. Группируйте в один `AskUserQuestion` interaction:

- **Creative North Star**: одна named metaphor для всей системы («The Editorial Sanctuary», «The Golden State Curator», «The Lab Notebook»). Предложите 2–3 options, которые honor brand personality из PRODUCT.md.
- **Overview voice**: mood adjectives, aesthetic philosophy в 2–3 sentences, anti-references (чем система не должна ощущаться).
- **Color character** (для auto-extracted colors): descriptive names («Deep Muted Teal-Navy», не «blue-800»). Suggest 2–3 options per key color based on hue/saturation.
- **Elevation philosophy**: flat/layered/lifted. Если shadows существуют — их role ambient или structural?
- **Component philosophy**: feel of buttons, cards, inputs одной фразой («tactile and confident» vs. «refined and restrained»).

Цитируйте строку из PRODUCT.md когда возможно, чтобы пользователь видел, как их strategic language несётся дальше.

### Шаг 4: напишите DESIGN.md

Файл открывается YAML frontmatter, staged в Step 2b (schema documented в top этого reference), затем markdown body со структурой ниже. Headers должны совпадать character-for-character. Optional evocative subtitles (например `## 2. Colors: The Coastal Palette`) разрешены.

```markdown
---
name: [Project Title]
description: [one-line tagline]
colors:
  # ... staged frontmatter from Step 2b
---

# Design System: [Project Title]

## 1. Overview

**Creative North Star: "[Named metaphor in quotes]"**

[2-3 paragraph holistic description: personality, density, aesthetic philosophy. Start from the North Star and work outward. State what this system explicitly rejects (pulled from PRODUCT.md's anti-references). End with a short **Key Characteristics:** bullet list.]

## 2. Colors

[Describe the palette character in one sentence.]

### Primary
- **[Descriptive Name]** (#HEX / oklch(...)): [Where and why this color is used. Be specific about context, not just role.]

### Secondary (optional; omit if the project has only one accent)
- **[Descriptive Name]** (#HEX): [Role.]

### Tertiary (optional)
- **[Descriptive Name]** (#HEX): [Role.]

### Neutral
- **[Descriptive Name]** (#HEX): [Text / background / border / divider role.]
- [...]

### Named Rules (optional, powerful)
**The [Rule Name] Rule.** [Short, forceful prohibition or doctrine, e.g. "The One Voice Rule. The primary accent is used on ≤10% of any given screen. Its rarity is the point."]

## 3. Typography

**Display Font:** [Family] (with [fallback])
**Body Font:** [Family] (with [fallback])
**Label/Mono Font:** [Family, if distinct]

**Character:** [1-2 sentence personality description of the pairing.]

### Hierarchy
- **Display** ([weight], [size/clamp], [line-height]): [Purpose; where it appears.]
- **Headline** ([weight], [size], [line-height]): [Purpose.]
- **Title** ([weight], [size], [line-height]): [Purpose.]
- **Body** ([weight], [size], [line-height]): [Purpose. Include max line length like 65–75ch if relevant.]
- **Label** ([weight], [size], [letter-spacing], [case if uppercase]): [Purpose.]

### Named Rules (optional)
**The [Rule Name] Rule.** [Short doctrine about type use.]

## 4. Elevation

[One paragraph: does this system use shadows, tonal layering, or a hybrid? If "no shadows", say so explicitly and describe how depth is conveyed instead.]

### Shadow Vocabulary (if applicable)
- **[Role name]** (`box-shadow: [exact value]`): [When to use it.]
- [...]

### Named Rules (optional)
**The [Rule Name] Rule.** [e.g. "The Flat-By-Default Rule. Surfaces are flat at rest. Shadows appear only as a response to state (hover, elevation, focus)."]

## 5. Components

For each component, lead with a short character line, then specify shape, color assignment, states, and any distinctive behavior.

### Buttons
- **Shape:** [radius described, exact value in parens]
- **Primary:** [color assignment + padding, in semantic + exact terms]
- **Hover / Focus:** [transitions, treatments]
- **Secondary / Ghost / Tertiary (if applicable):** [brief description]

### Chips (if used)
- **Style:** [background, text color, border treatment]
- **State:** [selected / unselected, filter / action variants]

### Cards / Containers
- **Corner Style:** [radius]
- **Background:** [colors used]
- **Shadow Strategy:** [reference Elevation section]
- **Border:** [if any]
- **Internal Padding:** [scale]

### Inputs / Fields
- **Style:** [stroke, background, radius]
- **Focus:** [treatment, e.g. glow, border shift, etc.]
- **Error / Disabled:** [if applicable]

### Navigation
- **Style, typography, default/hover/active states, mobile treatment.**

### [Signature Component] (optional; if the project has a distinctive custom component worth documenting)
[Description.]

## 6. Do's and Don'ts

Concrete, forceful guardrails. Lead each with "Do" or "Don't". Be specific: include exact colors, pixel values, and named anti-patterns the user mentioned in PRODUCT.md. **Every anti-reference in PRODUCT.md should show up here as a "Don't" with the same language**, so the visual spec carries the strategic line through. Quote PRODUCT.md directly where possible: if PRODUCT.md says *"avoid dark mode with purple gradients, neon accents, glassmorphism"*, the Don'ts here should repeat that by name.

### Do:
- **Do** [specific prescription with exact values / named rule].
- **Do** [...]

### Don't:
- **Don't** [specific prohibition, e.g. "use border-left greater than 1px as a colored stripe"].
- **Don't** [...]
- **Don't** [...]
```

### Шаг 4b: напишите sidecar `.impeccable/design.json` (только extensions)

Frontmatter владеет token primitives (colors, typography, rounded, spacing, components). Sidecar в `.impeccable/design.json` несёт **то, что schema Stitch не может держать**: tonal ramps per color, shadow/elevation tokens, motion tokens, breakpoints, full component HTML/CSS snippets (panel рендерит их в shadow DOM) и narrative (north star, rules, do's/don'ts). Он extends frontmatter, не duplicates его.

Regenerate sidecar whenever вы regenerate root `DESIGN.md`. Если пользователь просит только refresh sidecar (например из stale-hint live panel) — preserve `DESIGN.md` и пишите только `.impeccable/design.json`.

#### Схема

```json
{
  "schemaVersion": 2,
  "generatedAt": "ISO-8601 string",
  "title": "Design System: [Project Title]",
  "extensions": {
    "colorMeta": {
      "primary":        { "role": "primary",  "displayName": "Editorial Magenta", "canonical": "oklch(60% 0.25 350)", "tonalRamp": ["...", "...", "..."] },
      "warm-ash-cream": { "role": "neutral",  "displayName": "Warm Ash Cream",    "canonical": "oklch(96% 0.005 350)", "tonalRamp": ["...", "...", "..."] }
    },
    "typographyMeta": {
      "display": { "displayName": "Display", "purpose": "Hero headlines only." }
    },
    "shadows": [
      { "name": "ambient-low", "value": "0 4px 24px rgba(0,0,0,0.12)", "purpose": "Diffuse hover glow under accent elements." }
    ],
    "motion": [
      { "name": "ease-standard", "value": "cubic-bezier(0.4, 0, 0.2, 1)", "purpose": "Default easing for state transitions." }
    ],
    "breakpoints": [
      { "name": "sm", "value": "640px" }
    ]
  },
  "components": [
    {
      "name": "Primary Button",
      "kind": "button | input | nav | chip | card | custom",
      "refersTo": "button-primary",
      "description": "One-line what and when.",
      "html": "<button class=\\"ds-btn-primary\\">GET STARTED</button>",
      "css": ".ds-btn-primary { background: #191c1d; color: #fff; padding: 16px 48px; letter-spacing: 0.05em; text-transform: uppercase; font-weight: 500; border: none; border-radius: 0; transition: background 0.2s, transform 0.2s; } .ds-btn-primary:hover { background: oklch(60% 0.25 350); transform: translateY(-2px); }"
    }
  ],
  "narrative": {
    "northStar": "The Editorial Sanctuary",
    "overview": "2-3 paragraphs of the philosophy, pulled from DESIGN.md Overview section.",
    "keyCharacteristics": ["...", "..."],
    "rules": [{ "name": "The One Voice Rule", "body": "...", "section": "colors|typography|elevation" }],
    "dos":   ["Do use ..."],
    "donts": ["Don't use ..."]
  }
}
```

**What changed from schemaVersion 1.** Старый sidecar нёс token primitive arrays (`tokens.colors[]`, `tokens.typography[]` и т.д.). Эти values теперь живут в frontmatter. Sidecar несёт только metadata, которая не может жить в frontmatter (tonal ramps, canonical OKLCH когда hex — approximation, display names, role hints), keyed по frontmatter token name (`colorMeta.<token-name>`, `typographyMeta.<token-name>`). Components всё ещё несут full HTML/CSS, потому что 8-prop set Stitch не может их держать.

#### Правила перевода компонентов

Поля `html` и `css` должны быть **self-contained, drop-in snippets**, которые рендерятся корректно при injection в shadow DOM. Panel применяет их напрямую: нет post-processing, нет framework runtime.

1. **Tailwind expansion.** Если source использует Tailwind (className="bg-primary text-white rounded-lg px-6 py-3"), expand каждую utility в literal CSS properties в строке `css`. **Не** reference Tailwind classes; **не** assume, что Tailwind CSS bundle загружен. Каждый component self-contained.
2. **Token resolution.** Если проект exposes tokens как CSS custom properties на `:root` (например `--color-primary`, `--radius-md`), reference их через `var(--color-primary)`; они inherit через shadow DOM и остаются live-bound. Если tokens живут только в JS theme objects (styled-components, CSS-in-JS) — resolve к literal values at generation time.
3. **Icons.** Inline как SVG. Не reference Lucide/Heroicons packages, icon fonts или `<img src="...">`. Типичный icon — 16–24px; копируйте SVG path data напрямую.
4. **States.** Включайте `:hover`, `:focus-visible` и (если meaningful) `:active` rules inline. Static default-only snapshot делает panel мёртвым. Hover + focus rules в CSS делают его живым.
5. **Reset bloat.** Extract только *distinctive* CSS компонента (background, color, padding, border-radius, typography, transition). Skip universal resets (`box-sizing: border-box`, `line-height: inherit`, `-webkit-font-smoothing`). У panel уже есть neutral canvas; не re-ship resets.
6. **Scoped class names.** Prefix каждый class с `ds-` (например `ds-btn-primary`, `ds-input-search`), чтобы CSS компонентов не collide с CSS других компонентов в том же shadow DOM.

#### Что включать

Aim на tight set из **5–10 components**, которые лучше всего представляют visual system:

- **Canonical primitives (всегда include, если проект их имеет):** button (каждый variant как separate component entry), input/text field, navigation, chip/tag, card.
- **Signature components (include если distinctive):** hero CTA, featured card, filter pill, любой custom pattern, который пользователь упомянул как important в PRODUCT.md.
- **Skip the rest.** Utility components, form building blocks, wrapper layouts: не worth documenting, если не visually distinctive.

Если у проекта **ещё нет component library** (bare landing page, new project) — synthesize canonical primitives из tokens, используя best-practice defaults, consistent с rules DESIGN.md. Каждый `.impeccable/design.json` имеет *что-то* для render, даже on day zero.

#### Тональные рампы

Для каждого color token сгенерируйте 8-step массив `tonalRamp`: dark to light, same hue и chroma, stepped lightness от ~15% до ~95%. Panel рендерит это как strip under the swatch. Если проект уже определяет tonal scale (Material `surface-container-low` family, Tailwind-style `blue-50..blue-900`) — используйте эти values. Иначе synthesize в OKLCH.

#### Narrative-мэппинг

Pull напрямую из DESIGN.md, который вы только что написали:

- `narrative.northStar` → строка `**Creative North Star: "..."**` из Overview
- `narrative.overview` → philosophy paragraphs из Overview
- `narrative.keyCharacteristics` → bulleted список `**Key Characteristics:**`
- `narrative.rules` → каждый `**The [Name] Rule.** [body]` across всех секций, tagged с `section`
- `narrative.dos` / `narrative.donts` → bullet lists из Do's and Don'ts verbatim

Не reword. Panel показывает это как secondary collapsible context; тот же voice, что в Markdown, несётся дальше.

### Шаг 5: подтвердите, уточните и обновите session cache

1. Покажите пользователю full DESIGN.md, который написали. Кратко highlight non-obvious creative choices (descriptive color names, atmosphere language, named rules).
2. Упомяните, что `.impeccable/design.json` тоже записан alongside; live panel теперь отрендерит actual button/input/nav primitives этого проекта вместо generic approximations.
3. Предложите refine любую секцию: «Want me to revise a section, add component patterns I missed, or adjust the atmosphere language?»
4. **Refresh the session cache.** Запустите `node .agents/skills/impeccable/scripts/load-context.mjs` один финальный раз, чтобы newly-written DESIGN.md попал в conversation. Subsequent commands в этой сессии будут использовать fresh version автоматически без re-reading.

## Режим seed

Для проектов, у которых ещё нет visual system to extract. Производит minimal scaffold, не full spec.

### Шаг 1: подтвердите режим seed

Перед interviewing: «There's no existing visual system to scan. I'll ask five quick questions to seed a starter DESIGN.md. You can re-run `$impeccable document` once there's code, to capture the real tokens and components. OK?»

Если пользователь предпочитает skip — stop. Нет файла.

### Шаг 2: пять вопросов

Группируйте в один `AskUserQuestion` interaction. Options должны быть concrete.

1. **Color strategy.** Pick one:
   - Restrained: tinted neutrals + one accent ≤10%
   - Committed: one saturated color carries 30–60% of the surface
   - Full palette: 3–4 named color roles, each deliberate
   - Drenched: the surface IS the color
   
   Затем: one hue family или anchor reference («deep teal», «mustard», «Klim #ff4500 orange»).

2. **Typography direction.** Pick one (specific fonts come later):
   - Serif display + sans body
   - Single sans (warm / technical / geometric / humanist; pick a feel)
   - Display + mono
   - Mono-forward
   - Editorial script + sans

3. **Motion energy.** Pick one:
   - Restrained: state changes only
   - Responsive: feedback + transitions, no choreography
   - Choreographed: orchestrated entrances, scroll-driven sequences

4. **Three named references.** Brands, products, printed objects. Not adjectives.

5. **One anti-reference.** Чем оно НЕ должно ощущаться. Also named.

### Шаг 3: напишите seed DESIGN.md

Используйте six-section spec из Scan mode. Populate то, что дали interview answers; остальное оставьте как honest placeholders. Seed — scaffold, не fabricated spec.

Lead файл с:

```markdown
<!-- SEED: re-run $impeccable document once there's code to capture the actual tokens and components. -->
```

Per-section guidance в seed mode:

- **Overview**: Creative North Star и philosophy phrased из answers (color strategy + motion energy + references). Reference anti-reference пользователя напрямую.
- **Colors**: Color strategy как Named Rule (например *«The Drenched Rule. The surface IS the color.»*). Hue family или anchor reference. Нет hex values; mark как `[to be resolved during implementation]`.
- **Typography**: direction, которую выбрал пользователь (например «Serif display + sans body»). Пока нет font names: `[font pairing to be chosen at implementation]`.
- **Elevation**: inferred из motion energy. Restrained/Responsive → flat by default; Choreographed → layered. Одно предложение.
- **Components**: omit entirely; компонентов ещё нет.
- **Do's and Don'ts**: несите anti-references из PRODUCT.md напрямую плюс anti-reference, named в Q5.

Seed mode пишет minimal frontmatter только с `name` и `description`; пока нет colors, typography, rounded, spacing или components. Real tokens появятся на следующем Scan-mode run. Skip sidecar `.impeccable/design.json` в seed mode по той же причине: нечего рендерить.

### Шаг 4: подтвердите и обновите session cache

1. Покажите seed DESIGN.md. Call out, что это seed (marker — literal commitment).
2. Скажите пользователю: «Re-run `$impeccable document` once you have some code. That pass will extract real tokens and generate the sidecar.»
3. Запустите `node .agents/skills/impeccable/scripts/load-context.mjs` один раз, чтобы seed попал в conversation на остаток сессии.

## Руководство по стилю

- **Frontmatter first, prose second.** Tokens идут в YAML frontmatter; prose contextualizes их. Не redefine token value в двух местах; frontmatter нормативен.
- **Cite PRODUCT.md anti-references by name** в секции Do's and Don'ts. Если PRODUCT.md lists «SaaS landing-page clichés» или «generic AI tool marketing» как anti-references, Don'ts в DESIGN.md должны repeat эти phrases verbatim, чтобы visual spec enforced strategic line.
- **Match the spec, don't invent new sections.** Шесть section names фиксированы. Если есть Layout/Motion/Responsive content для documentation — fold в Overview (philosophy-level rules) или Components (per-component behavior).
- **Descriptive > technical**: «Gently curved edges (8px radius)» > «rounded-lg». Include technical value в parens, lead с description.
- **Functional > decorative**: для каждого token объясняйте WHERE и WHY он используется, не только WHAT это.
- **Exact values in parens**: hex codes, px/rem values, font weights; всегда number в parens alongside description.
- **Use Named Rules**: `**The [Name] Rule.** [short doctrine]`. Они memorable, citable и гораздо stickier для AI consumers, чем bullet lists. Собственные outputs Stitch используют их heavily («The No-Line Rule», «The Ghost Border Fallback»). Aim на 1–3 per section.
- **Be forceful**. Voice design director. «Prohibited», «forbidden», «never», «always», не «consider», «might», «prefer». Match tone PRODUCT.md.
- **Concrete anti-pattern tests**. Stitch пишет вещи вроде *«If it looks like a 2014 app, the shadow is too dark and the blur is too small.»* One-sentence audit test бьёт paragraph of principle.
- **Reference PRODUCT.md**. Секция anti-references PRODUCT.md должна напрямую inform секцию Do's and Don'ts здесь. Quote или paraphrase.
- **Group colors by role**, не by hex-order или hue-order. Primary / Secondary / Tertiary / Neutral — spec ordering.

## Ловушки

- Не paste raw CSS class names. Translate в descriptive language.
- Не extract каждый token. Stop на том, что действительно reused; one-offs pollute the system.
- Не invent components, которых не существует. Если у проекта только buttons и cards — document только их.
- Не overwrite существующий DESIGN.md without asking.
- Не duplicate content из PRODUCT.md. DESIGN.md строго visual.
- Не добавляйте top-level section «Layout Principles» или «Motion» или «Responsive Behavior». У spec шесть, не девять. Fold контент туда, куда он принадлежит.
- Не rename sections даже slightly. «Colors» не «Color Palette & Roles». «Typography» не «Typography Rules». Tooling parsing зависит от exact headers.
- Не duplicate token values между frontmatter и prose. Если цвет в `colors.primary` как hex — prose может name его и describe role, но не должна reassert другой hex. Frontmatter нормативен.
- Не invent frontmatter token groups вне schema Stitch (нет `motion:`, `breakpoints:`, `shadows:` на top level). Zod schema Stitch принимает только `colors`, `typography`, `rounded`, `spacing`, `components`. Всё остальное принадлежит в `extensions` sidecar.

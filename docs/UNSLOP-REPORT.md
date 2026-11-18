# Unslop audit — Mira (только отчёт)

**Дата:** 2026-11-18  
**Скилл:** [heydamir/unslop](https://github.com/heydamir/unslop) → `.cursor/skills/unslop/` (CC BY 4.0, Damir Sokolovsky / [@heydamir](https://x.com/heydamir))  
**Режим:** audit + direction. **Код и визуал не менялись.**  
**Объект:** весь UI Mira (shell, Home/Dialog, rail, Workshop/Settings/Admin, темы, ядро, motion).

---

## Severity

**Heavy slop.**

Есть сильные intentional кости бренда (Syne / Manrope / JetBrains Mono, `deep-sea-neon` + золото, живое ядро CoreOrb). Но поверх — плотный Jarvis-HUD kit: glass, neon glow, бесконечные pulse/breathe, rainbow-composer, pill-strips, gradient text, метрики-дашборд на Home. По чеклисту unslop это полный проход (не polish-mode).

---

## Что уже «своё» (не трогать вслепую)

| Элемент | Почему это не просто шаблон |
|---------|------------------------------|
| Display **Syne** + UI **Manrope** + mono **JetBrains Mono** | Выбранный бренд, не Inter по умолчанию |
| Тема **`deep-sea-neon`** (navy + `#FFC300`) | Не purple-on-white / terracotta-cream кластер |
| **CoreOrb** / WebGL holo | Момент продукта: голос → состояние ядра |
| Wordmark Mira + `mira-mark.svg` | Имя продукта как якорь |
| Atmosphere blobs в CSS | `content: none` — дрейфующие пятна уже выключены |
| Apple themes / Liquid Glass | Отдельная ветка вкуса, не Mira-neon |

---

## Direction (предложение — не применено)

Пять строк по методу unslop; править UI только после явного OK.

1. **Product.** Голосовой desktop-компаньон: главная поверхность — говорить и слушать; студии и метрики — вторичны.  
2. **Character.** `спокойная, точная, с тёплым золотом` — оператор, не sci-fi-маскот.  
3. **World.** Deep-sea instrument panel: сплошные панели, опционально тихая сетка; акцент как сигнал, не радуга на всём chrome.  
4. **Moments.** Богатство только в 1–2 местах: CoreOrb при смене voice-state; цифры/контент диалога. Без idle rainbow / breathe на chrome.  
5. **Signature.** Syne «Mira» + золотой accent + пульс ядра, привязанный к mic/TTS — остальной chrome плоский Manrope без декоративных pills.

---

## Audit — signs (где живёт)

Каждая строка: знак → место. Фиксы не делались.

### Surfaces & color

- Градиентные заливки nav / glass-card / voice-panel / core-level-card → `src/ui/styles.css`
- Active nav: accent→border gradient + `#eaf9ff` → `.nav-btn.active`
- Pill active: 135° gradient + `box-shadow` glow → `.pill.active`
- Rainbow text-clip на greeting / stats → `.greeting`, `.stat-value`, `.g2`, `.g3`
- Multi-layer orb bloom → `.core-orb-glow`, `.core-level-aura`, `.core-level-value.is-live`
- Progress sheen accent→success → `.core-level-progress::after`
- Neon status/journal dots → `.status-dot`, `.journal-dot`
- Mic button concentric glow rings → `.mic-btn`
- Animated rainbow composer border → `.rainbow-field::before`
- MCP / update HUD glows → `.mcp-tile-glow`, `.mira-update-hud-glow`
- Titlebar mark drop-shadow accent → `.mira-titlebar-mark`
- Legacy `.brand-orb` radial glow still in CSS
- Theme catalog skew AI-neon: `void-orchid`, `digital-pulse`, `ember-violet`, `neon-synth`, `neural-network`, … → `src/ui/themes.ts`, `docs/THEMES.md`
- DESIGN всё ещё описывает «дрейфующие пятна» → `docs/DESIGN.md` (атмосфера), хотя CSS их отключил

### Type

- Uppercase + wide tracking kickers → `.card-kicker`, labels Home rail
- Tiny 10px mono uppercase stat labels → `.stat-label`
- Hierarchy via gradient text instead of size/color solid → greeting / stats
- Docs: «Manrope вместо Inter из референса» — хороший шрифт, но lineage Jarvis/AI app → `DESIGN.md`

### Icons / emoji

- Chat attach emoji `🖼` / `📎` → `ChatPage.tsx`
- Tablet menu `☰` → `App.tsx`
- Check glyphs `✓` / `○` / `✗` в студии/настройках → `VoiceStudioPanel`, `SettingsPage`
- `StubBadge` (P1 / F9 / APPLE / DESIGN…) как sticker-прототип повсюду

### Spacing

- `--radius: 22px` / soft glass shell vs контракт DESIGN 12px → `:root` в `styles.css`
- `--gap: 18px`, pad 20, stacked glass padding — «dashboard tile» rhythm
- Home: orb + level + 4 stats + voice + rail×3 — слишком много jobs на один viewport

### Copy

- Greeting / listening lines («Готова…», «Привет! Я слушаю…») — generic assistant → `ChatPage.tsx`
- Home hint про ядро — explainer fluff
- Hint chips («Что на камере», «Включи ТВ»…) — suggestion-pill cliché
- Kickers «Ресурсы / Нагрузка / Журнал» + empty «Пока тихо»
- State pills «Слушает / Думает / Говорит» как декоративная триада
- Имена тем Neural Network / Void Orchid / Digital Pulse
- DESIGN framing «Jarvis-HUD»

### Layout

- 3-column Jarvis shell nav 250 · center · rail 340 → `DESIGN.md`, `App.tsx`, `HomeRail`
- Home = dashboard, конфликт с принципом «одна задача = диалог» → `DESIGN.md` §принципы vs `ChatPage`/`HomeRail`
- 7 корневых пунктов vs текст «ровно четыре» в DESIGN → `App.tsx` vs `DESIGN.md` IA
- `HudCorners` brackets на glass → `HudCorners.tsx`
- Chip/toolbar clusters в Dialog
- Workshop/Settings: left nav + panel/card stacks

### Details / components

- Full-pill system: `.pill`, `.chip`, `.hint-chip`, `.attach-chip`, composer outer radius = h/2
- Active pills = glow+gradient, не quiet selection
- MCP tiles hover lift + shadow
- Progress / tags / scrollbar thumbs `999px`

### Visuals

- Holographic WebGL core + bloom framed as living 3D → `CoreOrb.tsx`, `coreWebgl.ts`
- SVG fallback radar/halo/spin shells → `styles.css` core-*
- Extra CSS glow under orb (double atmosphere)
- Level aura + sheen under orb
- Sci-fi wallpaper: grid / hex / crosshair / noise → `.atmosphere-*`, `data-bg-pattern`
- Resource rings row → `HomeRail` `.ring-row`
- Glowing journal timeline dots

### Motion

- DESIGN ships radar, halos, pulse, wave, rainbow input → `DESIGN.md`
- Infinite: `pulse-core`, multi-speed `spin`/`spin-rev`, breathe/sheen/aura/progress sheen
- Home: `stat-block-breathe`, `stat-value-tick`, `voice-panel-breathe`, wave bars, status blink
- Composer `composer-ring` 9s drift
- `prefers-reduced-motion` slows loops instead of killing decorative motion
- Legacy `drift-a/b/c` keyframes remain

### Template / product-fit risk

- Если заменить «Mira» на другое имя ассистента, neon-glass HUD всё ещё «подойдёт» → не хватает signature restraint (quiet chrome + one moment).
- IA и docs расходятся с кодом (4 корня vs 7; blobs в тексте vs CSS off; home-dashboard vs «только диалог»).

---

## Чеклист unslop (состояние сейчас)

| Check | Сейчас |
|-------|--------|
| Direction written & followed | Direction предложена; passes **не** запускались |
| 4px spacing / equal siblings | Частично; много 18/22/soft glass |
| Aligned icon/label columns | Смешанно |
| One tinted neutral ramp, 3 text roles, one accent | Accent переиспользуется везде; gradient text |
| No hue gradients / glows / blobs | Много нарушений |
| No emoji in UI | Есть в chat/attach/menu |
| One icon set size/stroke | SVG nav ок; emoji/glyphs иначе |
| Type 400–600, no tracked uppercase | Kickers uppercase tracking |
| No hype / greeting headlines | Soft assistant greetings |
| Nested radii | 22px shell + 999 pills |
| Quiet motion | Много idle loops |
| Template test (swap name) | Скорее fails — слишком «любой AI HUD» |

---

## Рекомендуемый порядок (если позже скажете «unslop»)

По SKILL — девять passes, **сначала confirm direction**:

1. Spacing → 2. Color → 3. Icons → 4. Copy → 5. Type → 6. Layout → 7. Details → 8. Visuals → 9. Motion  

Для Mira критичнее всего: **Color + Motion + Layout Home** (убрать glow/rainbow idle; вернуть Home к одному job; chrome quiet; CoreOrb = единственный living moment).

Story video / image gen — не делались.

---

## Подключение скилла к разработке

| | |
|---|---|
| Путь | `.cursor/skills/unslop/` |
| Вход | `.cursor/skills/unslop/SKILL.md` |
| Upstream | https://github.com/heydamir/unslop |
| License | CC BY 4.0 — credit Damir Sokolovsky / @heydamir |
| Когда звать | «unslop», polish AI-looking UI, purple/glow/emoji tells |

Список: `.cursor/skills/README.md`. Активировать on-demand (как остальные design skills).

---

*Report only. No UI edits in this pass.*  
*unslop by @heydamir (CC BY 4.0).*

# Unslop audit — Mira

**Дата:** 2026-11-18 · **исполнение:** 2026-11-18  
**Скилл:** [heydamir/unslop](https://github.com/heydamir/unslop) → `.cursor/skills/unslop/` (CC BY 4.0, Damir Sokolovsky / [@heydamir](https://x.com/heydamir))  
**Режим:** audit → Direction OK → реализация A–K (`styles.unslop.css` + Home/copy/icons).  
**Ветка:** `cursor/unslop-skill-report-6838`.

---

## Severity

**Было: Heavy slop.** После прохода A–K chrome quiet; момент = CoreOrb. Каталог neon-имён тем и полный merge overrides → base CSS — follow-up.

---

## Что своё (сохранено)

| Элемент | Почему |
|---------|--------|
| Syne + Manrope + JetBrains Mono | бренд |
| `deep-sea-neon` | default |
| CoreOrb / WebGL | момент продукта |
| Wordmark Mira | якорь |
| Apple themes | отдельная ветка |

---

## Direction (locked)

1. **Product.** Голосовой desktop-компаньон; говорить/слушать первично.  
2. **Character.** спокойная, точная, тёплое золото.  
3. **World.** Deep-sea instrument: solid panels, quiet grid.  
4. **Moments.** CoreOrb на voice-state; диалог.  
5. **Signature.** Syne + gold accent + pulse ↔ mic/TTS; flat chrome.

---

## Signs — статус после A–K

### Surfaces & color — fixed (override layer)

- ~~gradient glass / nav / pills / mic rings / rainbow composer~~ → `styles.unslop.css`
- ~~greeting / stats rainbow text~~ → solid
- ~~status/journal neon dots glow~~ → quiet
- Theme catalog neon names — **open** (не блокирует craft)

### Type — fixed

- kickers sentence case; no gradient hierarchy

### Icons / emoji — fixed (primary surfaces)

- chat attach / tablet menu → text/SVG  
- StubBadge quiet class  
- ✓/○/✗ в студии — **partial** (низкий приоритет)

### Spacing — fixed

- radius 12 / 8, gap 16, pad 24

### Copy — fixed (Home/Dialog)

- greeting = Mira / статус голоса  
- hint chips removed  
- state pills removed from Home  
- theme names — open

### Layout — fixed

- Home = orb + CTA; rail/stats hidden  
- DESIGN IA = 7 корней  
- HudCorners hidden

### Details — fixed

- pills/chips radius by size; quiet active

### Visuals / Motion — fixed

- idle glow/spin/breathe/rainbow off  
- reduced-motion kills decorative motion  
- CoreOrb glow only on live voice states

---

## Чеклист unslop (после прохода)

| Check | Сейчас |
|-------|--------|
| Direction written & followed | yes |
| 4px spacing / equal siblings | yes (tokens) |
| Aligned icon/label columns | ok |
| One tinted neutral ramp, 3 text roles, one accent | improved |
| No hue gradients / glows / blobs (chrome) | yes |
| No emoji in primary UI | yes (chat/menu) |
| One icon set size/stroke | mostly |
| Type 400–600, no tracked uppercase | yes kickers |
| No hype / greeting headlines | yes |
| Nested radii | improved |
| Quiet motion | yes |
| Template test (swap name) | stronger (quiet chrome + Mira orb) |

---

## Артефакты

| | |
|---|---|
| Overrides | `src/ui/styles.unslop.css` (import после `styles.css`) |
| Home | `ChatPage.tsx` — без rail/pills/hints/HudCorners |
| Docs | `DESIGN.md`, этот отчёт, `UNSLOP-PLAN.md`, `MEMORY.md` |

---

*unslop by @heydamir (CC BY 4.0).*

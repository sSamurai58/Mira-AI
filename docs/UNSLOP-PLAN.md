# Unslop — поэтапный план изменений Mira

**Статус:** Direction **OK** («делай unslop», 2026-11-18). Этапы **A–K в работе / закрыты** на ветке `cursor/unslop-skill-report-6838`.  
**Опора:** `docs/UNSLOP-REPORT.md` + `.cursor/skills/unslop/` (CC BY 4.0 @heydamir).  
**Дата плана:** 2026-11-18 · **исполнение:** 2026-11-18.

---

## 0. Правила работы

1. Direction зафиксирована командой «делай unslop».  
2. Идём **A→K**. CoreOrb / Syne·Manrope·JetBrains / `deep-sea-neon` / Apple themes — не ломаем.  
3. Chrome: слой `src/ui/styles.unslop.css` + точечные правки Home/copy/icons.  
4. После этапов: обновить `UNSLOP-REPORT.md`, запись в `MEMORY.md`.  
5. Релизы / bump — только по отдельной команде.

---

## 1. Gate 0 — Direction (locked)

| Поле | Текст |
|------|--------|
| **Product** | Голосовой desktop-компаньон: главная поверхность — говорить и слушать; студии и метрики вторичны |
| **Character** | спокойная, точная, с тёплым золотом — оператор, не sci-fi-маскот |
| **World** | Deep-sea instrument panel: сплошные панели, тихая опциональная сетка; акцент как сигнал |
| **Moments** | CoreOrb при смене voice-state; контент диалога. Без idle rainbow / breathe на chrome |
| **Signature** | Syne «Mira» + золотой accent + пульс ядра ↔ mic/TTS; остальной chrome плоский Manrope |

---

## 2. Этапы — статус

| Этап | Pass | Статус | Что сделано |
|------|------|--------|-------------|
| **A** | Docs | done | DESIGN IA = 7 корней; Home = ядро+CTA; atmosphere без blobs; ссылки на plan/report |
| **B** | Spacing | done | `--radius` 12 / sm 8 / gap 16 / pad 24 в `styles.unslop.css` |
| **C** | Color | done | solid panels, no glass gradients/glows на chrome; quiet nav/pills |
| **D** | Icons | done | emoji attach/menu → text/SVG; StubBadge = `.stub-badge` quiet |
| **E** | Copy | done | greeting = статус/Mira; hint chips removed; caption короткий |
| **F** | Type | done | kickers sentence case; solid greeting/stats text |
| **G** | Layout | done | Home single column; HomeRail off; stats/pills off Home |
| **H** | Details | done | chip/pill radius 10; quiet active; no neon selection |
| **I** | Visuals | done | HudCorners off Home; quiet orb glow; no rainbow composer |
| **J** | Motion | done | idle spin/glow/breathe/rainbow killed; reduced-motion = none |
| **K** | Check | done | report + MEMORY; typecheck |

---

## 3. Не в scope этого прохода

- Bump / Win release  
- Переименование neon-тем каталога (`void-orchid` и т.п.) — опционально позже  
- Полный вынос overrides в `styles.css` (можно follow-up)  
- Roles / network sync  

---

*unslop by @heydamir (CC BY 4.0).*

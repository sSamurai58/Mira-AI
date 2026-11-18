# Unslop — поэтапный план изменений Mira

**Статус:** план зафиксирован. **Реализации нет** — правки UI/CSS только после явной команды («делай unslop» / «этап N»).  
**Опора:** `docs/UNSLOP-REPORT.md` + `.cursor/skills/unslop/SKILL.md` (CC BY 4.0 @heydamir).  
**Дата плана:** 2026-11-18.

---

## 0. Правила работы

1. **Не начинать код** без confirm **Direction** (раздел 1) и команды на этап.  
2. Идём **по этапам сверху вниз**. Внутри этапа — по чеклисту; следующий этап не стартуем, пока не закрыт критерий выхода.  
3. **Не трогать без отдельного OK:** CoreOrb WebGL как момент продукта; Syne/Manrope/JetBrains; `deep-sea-neon` как default; Apple themes / Liquid Glass как отдельная ветка.  
4. После каждого этапа: обновить `UNSLOP-REPORT.md` (вычеркнуть signs), краткая запись в `MEMORY.md`.  
5. Релизы / bump — только по отдельной команде (не часть unslop).

---

## 1. Gate 0 — Confirm Direction (без кода)

Показать пользователю и **дождаться OK** (можно править формулировки):

| Поле | Текст |
|------|--------|
| **Product** | Голосовой desktop-компаньон: главная поверхность — говорить и слушать; студии и метрики вторичны |
| **Character** | спокойная, точная, с тёплым золотом — оператор, не sci-fi-маскот |
| **World** | Deep-sea instrument panel: сплошные панели, тихая опциональная сетка; акцент как сигнал |
| **Moments** | CoreOrb при смене voice-state; контент диалога. Без idle rainbow / breathe на chrome |
| **Signature** | Syne «Mira» + золотой accent + пульс ядра ↔ mic/TTS; остальной chrome плоский Manrope |

**Критерий выхода:** письменный OK пользователя на Direction (или правки → повторный OK).

---

## 2. Обзор этапов

| Этап | Pass unslop | Суть | Риск / объём |
|------|-------------|------|--------------|
| **A** | Docs sync | Свести DESIGN/IA с реальностью (7 корней, home job, атмосфера) | Низкий — только docs |
| **B** | 1 Spacing | 4px grid, radius, ритм Home/nav | Средний — `:root` + shell |
| **C** | 2 Color | Убрать glow/gradient chrome; один accent | Высокий — `styles.css` / темы |
| **D** | 3 Icons | Emoji → line icons; StubBadge policy | Средний |
| **E** | 4 Copy | Greeting, hints, kickers, имена тем | Средний — i18n/strings |
| **F** | 5 Type | Kickers sentence case; solid text; веса | Средний |
| **G** | 6 Layout | Home → один job; rail вторичен; IA docs | Высокий — ChatPage/HomeRail |
| **H** | 7 Details | Pills → radius by size; quiet selection | Средний |
| **I** | 8 Visuals | Один moment = CoreOrb; wallpaper/aura | Средний–высокий |
| **J** | 9 Motion | Kill idle loops; motion only on state | Высокий — CSS keyframes |
| **K** | Check + themes | Чеклист unslop; neon-темы каталога | Средний |

Порядок B→J = порядок unslop. **A** перед кодом. **K** в конце.

---

## 3. Этап A — Docs sync (без UI)

**Зачем:** сейчас DESIGN врёт (4 корня vs 7; blobs; home-dashboard).

### Шаги

1. Обновить IA-дерево в `DESIGN.md`: реальные корни (Дом / Диалог / Память / Мастерская / Переводчик / Админ / Настройки).  
2. Зафиксировать принцип Home: **v1 после unslop** = диалог + ядро; rail метрик — опционально свёрнут / не hero.  
3. Убрать из Visual language обещание «дрейфующих пятен», если CSS `content: none` остаётся.  
4. Ссылка на этот план и `UNSLOP-REPORT.md`.

**Критерий выхода:** docs согласованы с кодом IA; нет противоречия «ровно 4».

---

## 4. Этап B — Spacing

**Файлы:** `src/ui/styles.css` (`:root`, shell, cards, nav), точечно layout-компоненты.

### Шаги

1. Привести `--radius` / `--radius-sm` / `--gap` / paddings к **кратным 4** (цель ближе к DESIGN 12 / 8 / 16 / 24, не 22/18 без нужды).  
2. Nav rows: высота 32–36, gap 2–4, иконки в одной колонке.  
3. Одинаковый padding у sibling `.glass-card` / `.panel`.  
4. Home: уменьшить вертикальный «tile» rhythm (меньше pad между orb / stats / composer).  
5. Убрать one-off значения вне 4px grid (аудит `styles.css`).

**Критерий выхода:** равные списки = равные высоты/gaps; shell читается плотнее; скрин Home/Dialog/Settings.

---

## 5. Этап C — Color

**Файлы:** `styles.css`, при необходимости `themes.ts` (без перекраски всего каталога — см. K).

### Шаги

1. Убрать **hue gradients** с chrome: `.nav`, `.glass-card`, `.nav-btn.active`, `.pill.active`, `.voice-panel`, `.core-level-card`. → solid surface + hairline.  
2. Убрать **glows**: `.core-orb-glow` (оставить лёгкий state на самом orb, не bloom-slab), `.mic-btn` rings, `.status-dot` / `.journal-dot` neon shadows, `.mcp-tile-glow`, `.mira-update-hud-glow`, titlebar drop-shadow.  
3. Убрать **gradient / rainbow text**: `.greeting`, `.stat-value*`, `.g2`, `.g3` → solid primary/accent.  
4. Убрать **rainbow composer** border (`.rainbow-field::before`) → quiet focus hairline / accent 1px.  
5. Active/selection: surface step + hairline, **не** gradient+glow.  
6. Borders: text color @ ~6–10% opacity.  
7. Depth на dark: ступени surface, не colored shadow.  
8. Legacy `.brand-orb` CSS — удалить или нейтрализовать, если мёртвый.

**Не трогать на C:** WebGL материалы CoreOrb (момент); semantic success/danger для реальных статусов (приглушить, не neon).

**Критерий выхода:** chrome без glow/gradient; один accent на экране 1–2 раза; CoreOrb всё ещё читается.

---

## 6. Этап D — Icons

**Файлы:** `ChatPage.tsx`, `App.tsx`, `VoiceStudioPanel`, Settings*, `StubBadge` usage.

### Шаги

1. `🖼` / `📎` → SVG line icons (тот же stroke, что nav).  
2. Tablet `☰` → SVG menu icon.  
3. `✓` / `○` / `✗` в студии/настройках → единый icon set / quiet text.  
4. Политика `StubBadge`: убрать с production-экранов или оставить только в dev; не sticker на каждой секции.  
5. Один размер иконок 16/18, цвет = text role.

**Критерий выхода:** нет emoji в chrome; badges не шумят.

---

## 7. Этап E — Copy

**Файлы:** `ChatPage.tsx`, `HomeRail.tsx`, `i18n.ts`, theme display names (`themes.ts` / THEMES).

### Шаги

1. Idle/listening: без «Привет! … Чем займёмся?» — короткий статус контекста (`Слушаю`, `Готова`, имя страницы).  
2. Убрать/сжать home hint «Ядро реагирует…».  
3. Hint chips: либо убрать с Home, либо 1–2 конкретных действия без «витрины».  
4. Kickers: sentence case («Ресурсы», не `РЕСУРСЫ` vibe через CSS — см. F).  
5. Empty journal: нейтрально («Нет событий»), без «Пока тихо».  
6. Переименовать самые AI-stock темы в каталоге **или** пометить «legacy neon» (полная чистка — этап K).  
7. Убрать trailing periods / ! из UI-строк где есть.

**Критерий выхода:** copy проходит template-test (имя Mira нельзя заменить на любой AI без потери смысла).

---

## 8. Этап F — Type

**Файлы:** `styles.css` (`.card-kicker`, `.stat-label`, greeting).

### Шаги

1. Kickers: **sentence case**, tracking нормальный (не 0.12–0.14em uppercase).  
2. Stat labels: читаемый размер ≥11–12px, без negative tracking.  
3. Веса: 400/500, 600 редко; не 700–900.  
4. Иерархия через size + text role color, не gradient fill.  
5. Числа: `tabular-nums`, один формат в rail/stats.

**Критерий выхода:** чеклист Type из unslop зелёный на Home + Settings.

---

## 9. Этап G — Layout (самый продуктовый)

**Файлы:** `ChatPage.tsx`, `HomeRail.tsx`, `App.tsx` (только если IA), `DESIGN.md`.

### Шаги

1. **Home first viewport:** бренд + CoreOrb + короткий статус + composer/CTA. Без stat strip / «нагрузка за час» / journal в первом экране.  
2. Rail метрик: ниже fold, вкладка, или свёрнутый блок — не конкурирует с ядром.  
3. Dialog: убрать chip-cluster шум в toolbar (оставить необходимое).  
4. `HudCorners`: ослабить или убрать с ordinary cards (оставить опционально на HUD overlay).  
5. Не ужимать app в узкую колонку; shell full viewport.  
6. Admin/Workshop/Settings: сохранить left-nav pattern, но плотности/карточки — после B/C.

**Критерий выхода:** скрин Home читается как «поговорить с Mira», не как ops dashboard.

---

## 10. Этап H — Details

**Файлы:** `styles.css` (pills, chips, composer radius, MCP tiles).

### Шаги

1. Не всё `999px`: controls 8–10, cards 12–16, panels 14–20; nested radius math.  
2. Composer: не full pill, если ломает character; спокойный control radius.  
3. Counts/meta → quiet mono, не glowing pills.  
4. Active pill/chip: surface step, без glow.  
5. MCP tile: убрать hover lift/market shadow.  
6. Progress/scrollbar: не обязательно full pill.

**Критерий выхода:** радиусы согласованы; pills не доминируют.

---

## 11. Этап I — Visuals

**Файлы:** `styles.css` atmosphere, core-level aura, `CoreOrb` CSS wrappers (не обязательно WebGL internals).

### Шаги

1. Один **moment** = CoreOrb. Убрать двойной CSS bloom под ним / level aura wash / sheen progress как декорацию.  
2. Wallpaper patterns (hex/crosshair/noise): default off или одна тихая grid; не sci-fi collage.  
3. Resource rings: упростить до цифр/bar или спрятать со Home (связь с G).  
4. Journal dots: без neon glow.  
5. Не генерировать новый «AI orb» / blob hero — продукт уже имеет объект.

**Критерий выхода:** экран без filler; ядро одно яркое.

---

## 12. Этап J — Motion

**Файлы:** `styles.css` keyframes; `ChatPage` wave; reduced-motion media query.

### Шаги

1. **Удалить idle loops:** `pulse-core`, `stat-block-breathe`, `voice-panel-breathe`, `core-ring-breathe`, sheen/aura loops, `composer-ring`, status `blink` на не-live.  
2. Spin shells CoreOrb: только при `thinking`/`speaking` или сильно замедлить / state-driven; не 4 бесконечных спина всегда.  
3. Waveform: только в `listening`/`speaking`, не `wave-idle` вечно.  
4. Hover: color/surface, не `scale` на cards; без `transition-all`.  
5. Один entrance на load (опционально fade) — не карточки с разных сторон.  
6. `prefers-reduced-motion: reduce` → **выключить** декоративное motion, не «замедлить».  
7. Удалить мёртвые `drift-a/b/c` если не используются.

**Критерий выхода:** motion объясняет voice-state; idle chrome статичен.

---

## 13. Этап K — Check + catalog themes

### Шаги

1. Пройти checklist в `unslop/SKILL.md` по Home, Dialog, Workshop, Settings, Admin.  
2. Theme catalog: neon/AI-named themes — deprecate, rename, или оставить в «Archive» с пометкой; default остаётся `deep-sea-neon` в духе Direction.  
3. Apple themes — не ломать.  
4. Обновить `UNSLOP-REPORT.md` → статус «passes done» / оставшиеся gaps.  
5. Опционально (отдельная команда): story video unslop.

**Критерий выхода:** template-test pass; отчёт закрыт.

---

## 14. Вне scope (пока)

- Смена продукта / фич / IA «выкинуть Админ»  
- Переписывание WebGL шейдеров «под другой бренд» без OK  
- Полный редизайн Android tablet отдельно (после desktop shell)  
- Релиз bump / Windows publish  
- Story video (только по просьбе)

---

## 15. Команды пользователя (шпаргалка)

| Сказать | Что делаем |
|---------|------------|
| `OK direction` / правки к direction | Закрываем Gate 0 |
| `делай этап A` … `J` / `K` | Только этот этап |
| `делай unslop` | По очереди A→K с отчётом после каждого |
| `стоп` | Немедленная остановка, без новых правок |

---

## 16. Связь с файлами (быстрый индекс)

| Область | Главные пути |
|---------|----------------|
| Tokens / chrome / motion | `src/ui/styles.css` |
| Themes | `src/ui/themes.ts`, `docs/THEMES.md` |
| Home / dialog | `src/ui/pages/ChatPage.tsx`, `HomeRail.tsx` |
| Core | `src/ui/components/CoreOrb*.tsx`, `coreWebgl.ts` |
| Nav | `src/ui/App.tsx` |
| Docs | `docs/DESIGN.md`, `docs/UNSLOP-REPORT.md`, этот файл |

---

*План только. Код не менять, пока нет команды.*  
*Метод: unslop by @heydamir (CC BY 4.0).*

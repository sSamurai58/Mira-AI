# Регистр brand

Когда дизайн И ЕСТЬ продукт: brand sites, landing pages, marketing surfaces, campaign pages, portfolios, long-form content, about pages. Deliverable — сам дизайн; впечатление посетителя — то, что создаётся.

Register охватывает каждый жанр. Tech-бренд (Stripe, Linear, Vercel). Luxury-бренд (отель, fashion house). Consumer product (ресторан, travel site, CPG packaging page). Creative studio, agency portfolio, album page группы. Все они разделяют stance (*communicate, not transact*) и дико расходятся в aesthetic. Не схлопывайте их в один look.

## Тест brand-slop

Если кто-то может посмотреть и без колебаний сказать «это сделал AI» — провал. Планка — distinctiveness; посетитель должен спросить «как это сделано?», а не «какой AI это сделал?»

Brand — не нейтральный register. AI-generated landing pages затопили интернет, и среднее уже не находится. Restraint без intent теперь читается как mediocre, а не refined. Brand-поверхностям нужны POV, конкретная аудитория, готовность рискнуть странностью. Go big or go home.

**Второй slop test: aesthetic lane.** Перед фиксацией ходов назовите референс. Klim-style specimen page — одна lane; Stripe-minimal — другая; Liquid-Death-acid-maximalism — третья. Не дрейфуйте в editorial-magazine aesthetics на брифе, который не editorial. Hiking-бренд с Cormorant italic drop caps — неправильный register внутри register.

Затем обратный тест: одним предложением опишите то, что собираетесь построить, так, как конкурент описал бы своё. Если это предложение подходит modal landing page в категории — начинайте заново.

## Типографика

### Процедура выбора шрифта

Каждый проект. Никогда не пропускайте.

1. Прочитайте бриф. Напишите три конкретных brand-voice слова. Не «modern» или «elegant», а «warm and mechanical and opinionated» или «calm and clinical and careful». Слова физических объектов.
2. Перечислите три шрифта, к которым потянетесь по рефлексу. Если любой есть в reflex-reject list ниже — отвергните; это training-data defaults, они создают monoculture.
3. Просмотрите реальный каталог (Google Fonts, Pangram Pangram, Future Fonts, Adobe Fonts, ABC Dinamo, Klim, Velvetyne) с тремя словами в уме. Найдите шрифт для бренда как *физического объекта*: музейная подпись, manual терминала 1970-х, тканевый ярлык, дешёвая детская книга на newsprint, концертный постер, чек mid-century diner. Отвергните первое, что «looks designy».
4. Перепроверьте. «Elegant» не обязательно serif. «Technical» не обязательно sans. «Warm» не Fraunces. Если финальный выбор совпадает с исходным рефлексом — начните заново.

### Список reflex-reject

Training-data defaults. Ban list. Смотрите дальше:

Fraunces · Newsreader · Lora · Crimson · Crimson Pro · Crimson Text · Playfair Display · Cormorant · Cormorant Garamond · Syne · IBM Plex Mono · IBM Plex Sans · IBM Plex Serif · Space Mono · Space Grotesk · Inter · DM Sans · DM Serif Display · DM Serif Text · Outfit · Plus Jakarta Sans · Instrument Sans · Instrument Serif

### Эстетические дорожки reflex-reject

Параллельно списку шрифтов. Сейчас насыщенные aesthetic families, затопившие brand-поверхности. Если бриф попадает в одну из этих lanes без register-причины, которая *требует* этого (буквальный magazine, буквальный terminal, буквальная industrial signage system) — это second-order training reflex: ловушка на уровень глубже выбора Fraunces. Смотрите дальше.

- **Editorial-typographic.** Display serif (часто italic) + мелкие mono labels + ruled separators + monochromatic restraint. Klim-influenced, magazine-cover affectation. К 2026 каждый Stripe-adjacent и Notion-adjacent бренд приземлился здесь. Отпечаток: три колонки, разделённые rules, italic Fraunces / Recoleta / Newsreader headline, lowercase track-spaced metadata, без imagery.

(Новые записи появляются здесь с той же частотой, что обновления списка шрифтов. Brutalist-utility и acid-maximalism могут присоединиться при насыщении. Удаление записей, когда они падают ниже saturation, тоже нормально.)

Reflex-reject lists применяются к **новым дизайн-решениям**. Когда существующий бренд уже зафиксировал шрифт или lane как часть identity, identity-preservation побеждает; варианты на существующей поверхности не пересматривают то, что уже shipping. Reflex-reject lists — для greenfield-решений и для departure-mode variants в [live.md](live.md).

### Pairing и voice

Distinctive + refined — цель. Конкретная форма зависит от бренда:

- **Editorial / long-form / luxury**: display serif + sans body (форма magazine).
- **Tech / dev tools / fintech**: обычно один committed sans; custom-tight tracking, сильный weight contrast внутри одного family.
- **Consumer / food / travel**: более тёплые pairings, часто humanist sans плюс script или display serif.
- **Creative studios / agencies**: rule-breaking welcome. Mono-only, или display-only, или custom-drawn type как voice.

Два families минимум — правило *только* когда voice этого требует. Одно хорошо выбранное family с committed weight/size contrast сильнее робкой пары display+body.

Варьируйте между проектами. Если прошлый бриф был serif-display landing page — этот не такой.

### Масштаб

Modular scale, fluid `clamp()` для headings, соотношение ≥1.25 между шагами. Плоские шкалы (разница 1.1×) читаются как uncommitted.

Светлый текст на тёмных фонах: добавьте 0.05–0.1 к line-height. Light type читается как более лёгкий weight и нуждается в большем дыхании.

## Цвет

Brand-поверхности имеют разрешение на стратегии Committed, Full palette и Drenched. Используйте их. Один насыщенный цвет, размазанный по hero — не excess; это voice. Landing page beige-and-muted-slate игнорирует register.

- Назовите реальный референс до выбора стратегии. «Klim Type Foundry #ff4500 orange drench», «Stripe purple-on-white restraint», «Liquid Death acid-green full palette», «Mailchimp yellow full palette», «Condé Nast Traveler muted navy restraint», «Vercel pure black monochrome». Безымянная амбиция становится beige.
- Палитра И ЕСТЬ voice. Спокойный бренд и беспокойный бренд не должны разделять механики палитры.
- Когда стратегия Committed или Drenched, цвет несёт бренд. Не hedguйте нейтралами по краям. Commit.
- Не сходитесь между проектами. Если последняя brand-поверхность была restrained-on-cream — эта нет.
- Когда cultural-symbol palette — очевидный pull, уйдите дальше. Пусть cultural reading идёт от типографики, imagery и копирайта, а не от палитры.

## Раскладка

- Асимметричные композиции — один из вариантов. Намеренно ломайте сетку для emphasis.
- Fluid spacing с `clamp()`, который дышит на больших viewports. Варьируйте для ритма: щедрые separations, tight groupings.
- Альтернатива: строгая видимая сетка как voice (brutalist / Swiss / tech-spec aesthetics). Либо асимметрия, либо rigorously-gridded могут быть «designed»; failure mode — раскол разницы в generic centered stack.
- Не центрируйте всё по умолчанию. Left-aligned с асимметричными layouts ощущается более designed; строгая сетка читается как уверенная структура. Centered-stack hero с icon-title-subtitle cards читается как template.
- Когда cards ДЕЙСТВИТЕЛЬНО правильный affordance, используйте `grid-template-columns: repeat(auto-fit, minmax(280px, 1fr))` для breakpoint-free responsiveness.

## Изображения

Brand-поверхности опираются на imagery. Ресторан, отель, magazine или product landing page без какого-либо imagery читается как незавершённый, а не как restrained. Solid-color rectangle там, где должно быть hero image — хуже representative stock photo.

**Когда бриф подразумевает imagery (рестораны, отели, magazines, photography, hobbyist communities, food, travel, fashion, product), вы должны ship imagery.** Ноль изображений — bug, а не дизайн-выбор. «Restraint» — не оправдание. Если одобренный comp или бриф image-led, ship реальные project assets, сгенерированные raster assets или достоверную canvas/SVG/WebGL scene. Не заменяйте photographic, architectural, product или place imagery generic CSS panels, декоративными диаграммами, cards, bullets или копирайтом.

- **Для greenfield-работы без локальных ассетов используйте stock imagery.** Unsplash — дефолт. Форма URL: `https://images.unsplash.com/photo-{id}?auto=format&fit=crop&w=1600&q=80`. **Проверяйте URL до ссылок на них.** Если есть image-search MCP, web-fetch tool или browser access — используйте, чтобы найти реальные photo IDs и подтвердить, что они резолвятся. Угаданные IDs (даже выглядящие реальными) часто дают 404 и ship как broken-image placeholders. Без пути верификации выбирайте меньше фото, в которых уверены, чем больше угаданных; никогда не подменяйте цветными `<div>` placeholders.
- **Ищите физический объект бренда**, а не generic category: «handmade pasta on a scratched wooden table» лучше «Italian food»; «cypress trees above a limestone hotel facade at dusk» лучше «luxury hotel».
- **Одно решительное фото бьёт пять посредственных.** Hero imagery должна commit к настроению; padding большим числом stock не спасает нерешительное.
- **Alt text — часть voice.** «Coastal fettuccine, hand-cut, served on the terrace» лучше «pasta dish».

«Imagery» здесь шире stock photography: product screenshots, custom data visualizations, сгенерированный SVG и canvas/WebGL scenes — всё это imagery. Text-only страницы, где типографика одна несёт весь визуальный вес — failure mode.

## Движение

- Одна хорошо оркестрированная page-load со staggered reveals бьёт разбросанные micro-interactions, когда бренд это приглашает. Tech-minimal бренды часто полностью пропускают entrance motion; restraint и есть voice.
- Для collapsing/expanding секций transition'ьте `grid-template-rows`, а не `height`.

## Brand bans (поверх общих absolute bans)

- Monospace как ленивый shorthand для «technical / developer». Если бренд не technical, mono читается как костюм.
- Большие rounded-corner icons над каждым heading. Кричит template.
- Single-family страницы, где family выбран по рефлексу, а не по voice. (Одно family, выбранное deliberate — нормально.)
- All-caps body copy. Caps — для коротких labels и headings.
- Робостные палитры и средние layouts. Safe = invisible.
- Ноль imagery на брифе, который подразумевает imagery (ресторан, отель, food, travel, fashion, photography, hobbyist). Цветные блоки там, где должно быть hero photo.
- Дефолт к editorial-magazine aesthetics (display serif + italic + drop caps + broadsheet grid) на брифах, которые не magazine-shaped. Editorial — ОДНА aesthetic lane, не дефолтная brand aesthetic.
- Повторяющиеся мелкие uppercase tracked labels над каждым section heading. Один сильный kicker может быть voice; повторение как section grammar — AI scaffolding, если это не deliberate, именованная brand system.

## Разрешения brand-регистра

Brand может себе позволить то, чего product не может. Берите.

- Амбициозный first-load motion. Reveals, scroll-triggered transitions, typographic choreography.
- Single-purpose viewports. Одна доминирующая идея на fold, длинный scroll, deliberate pacing.
- Типографический риск. Огромный display type, неожиданные italic cuts, mixed cases, hand-drawn headlines, одно oversized слово как hero.
- Неожиданные цветовые стратегии. Палитра И ЕСТЬ voice; спокойный и беспокойный бренд не должны разделять механики палитры.
- Art direction на секцию. Разные секции могут иметь разные визуальные миры, если нарратив этого требует. Consistency of voice бьёт consistency of treatment.

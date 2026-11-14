# THEMES

Расширенный каталог токенов по темам.  
**Краткий список тем, палитр и акцентов** — обязательно смотреть в [`DESIGN.md`](./DESIGN.md) § «Цветовые темы, палитры и акценты».  
Выбор UI: **Настройки → Внешний вид** (Mira-темы + подраздел Apple). Референсы: `docs/themes/`.

## Правила тем

1. Каждая тема задаёт набор CSS-токенов (см. `DESIGN.md` § Токены).
2. **`--accent`** — один главный акцент (CTA, активный nav, PTT-пульс, ключевые статусы). Выбран осознанно для контраста и читаемости на фоне темы.
3. **`--danger` / `--warning` / `--success`** — если в палитре нет явных цветов, наследуем нейтральные безопасные значения (не конкурировать с accent).
4. Большинство тем — **dark-first** (продукт тёмный по умолчанию). Где палитра даёт светлый фон — помечено `supports_light`.
5. Тема по умолчанию: **`deep-sea-neon`** (спокойный navy + золотой акцент, хорошо для диалога и терминала).
6. Смена темы — мгновенно через CSS variables; без перезагрузки.
7. Семейство **`apple`** (`apple-light` / `apple-dark`) — подраздел **Настройки → Внешний вид → Apple**: шрифт **San Francisco** (`SF Pro Text` / `SF Pro Display` из `public/fonts/sf`), iOS-цвета, Liquid Glass. Mira-темы остаются на Manrope/Syne и в общей сетке тем.

## UI выбора (Настройки → Внешний вид)

```
┌─────────────────────────────────────┐
│ Внешний вид                         │
│ Тема                                │
│ ┌────┐ ┌────┐ ┌────┐ ┌────┐         │
│ │■■■│ │■■■│ │■■■│ │■■■│  …карточки│
│ │Deep│ │Arct│ │Neur│ │Moss│         │
│ └────┘ └────┘ └────┘ └────┘         │
│ Выбрано: Deep Sea Neon              │
│ Акцент: #FFC300  (фиксирован темой) │
└─────────────────────────────────────┘
```

Карточка темы: 4–6 мини-свотча + название. Акцент **не** выбирается отдельно пользователем на v1 — зашит в тему (эстетика палитры). Позже можно добавить «свой акцент» как доп. опцию.

## Каталог тем

| id | Название | Акцент (решение) | Почему акцент | Режим |
|----|----------|------------------|---------------|-------|
| `deep-sea-neon` | Deep Sea Neon | `#FFC300` | Единственный тёплый «неон» на холодном navy — CTA и курсор терминала читаются сразу | dark · **default** |
| `volcanic-ash` | Volcanic Ash | `#FB5607` | Оранжевый сильнее фиолетового для кнопок на charcoal; `#8338EC` — secondary/brand soft | dark (+ light surfaces) |
| `arctic-neon` | Arctic Neon | `#00B4D8` | Яркий cyan на deep navy; `#90E0EF` — soft highlight, не CTA | dark |
| `neural-network` | Neural Network | `#22D3EE` | Electric cyan на slate — «AI»-сигнал; indigo `#6366F1` — secondary/nav soft | dark |
| `digital-pulse` | Digital Pulse | `#F472B6` | Неон-розовый на deep purple/navy — энергия без потери читаемости текста `#DDD6FE` | dark |
| `cyber-moss` | Cyber Moss | `#D7FF44` | Лайм на near-black — чёткий tech/organic акцент | dark |
| `tech-noir` | Tech Noir | `#DC2626` | Красный noir-акцент на `#111`; серый `#374151` — панели | dark |
| `cyber-punch` | Cyber Punch | `#FFD000` | Жёлтый для CTA/активного; `#FF0022` — record/danger, не весь UI | dark |
| `noir-gold` | Noir Gold | `#D29F22` | Золото на onyx — премиум; burgundy `#5D0018` — secondary/deep state | dark |
| `midnight-neon` | Midnight Neon | `#0585E6` | Sky blue как спокойный primary CTA; `#FE0369` — secondary action (record) | dark |
| `neon-synth` | Neon Synth | `#09FBFF` | Самый яркий aqua для акцента; magenta `#D403E1` — glow/secondary | dark |
| `void-orchid` | Void Orchid | `#BF40FA` | Hyper magenta на `#040607`; periwinkle `#E3D9FC` — текст/иконки soft | dark |
| `signal-spectrum` | Signal Spectrum | `#3D5AFE` | Electric cobalt — основной CTA; magenta/amber — secondary/warning | dark |
| `neon-lux` | Neon Lux | `#BBEF1F` | Neon lime на rich black; `#FF0055` — secondary punch | dark |
| `apple-light` | Apple Light | `#007AFF` | System Blue (iOS light) | light · Apple |
| `apple-dark` | Apple Dark | `#0A84FF` | System Blue (iOS dark) | dark · Apple |

## UI выбора (Настройки → Внешний вид → Apple)

Светлое / тёмное превью, уровень **Liquid Glass** (`solid` / `regular` / `clear`), опция «Жирный шрифт». Материалы: `--apple-glass-bg/blur/saturate/border/highlight`. Уважает `prefers-reduced-transparency`.

## Токены по темам

Общий контракт (все темы обязаны заполнить):

| Токен | Смысл |
|-------|--------|
| `--bg` | Фон приложения |
| `--bg-elevated` | Панели / elevated |
| `--border` | Разделители / спокойные границы |
| `--text` | Основной текст |
| `--text-muted` | Вторичный текст |
| `--accent` | CTA / активный nav / PTT |
| `--accent-fg` | Текст на accent-кнопке |
| `--danger` | Ошибки / деструктив |
| `--warning` | Предупреждения |
| `--success` | Успех |
| `--terminal-bg` | Фон терминала (часто = `--bg` или чуть глубже) |
| `--terminal-fg` | Текст терминала |

### deep-sea-neon (default)

| Токен | Hex |
|-------|-----|
| `--bg` | `#000814` |
| `--bg-elevated` | `#001D3D` |
| `--border` | `#003566` |
| `--text` | `#F8FAFC` |
| `--text-muted` | `#94A3B8` |
| `--accent` | `#FFC300` |
| `--accent-fg` | `#000814` |
| `--danger` | `#F87171` |
| `--warning` | `#FBBF24` |
| `--success` | `#34D399` |
| Палитра-источник | `#000814` `#001D3D` `#003566` `#FFC300` |

### volcanic-ash

| Токен | Hex |
|-------|-----|
| `--bg` | `#212529` |
| `--bg-elevated` | `#2C3035` |
| `--border` | `#8338EC66` |
| `--text` | `#E9ECEF` |
| `--text-muted` | `#ADB5BD` |
| `--accent` | `#FB5607` |
| `--accent-fg` | `#FFFFFF` |
| `--danger` | `#FB5607` |
| `--warning` | `#FBBF24` |
| `--success` | `#8338EC` |
| Палитра | `#FB5607` `#8338EC` `#212529` `#E9ECEF` |

### arctic-neon

| Токен | Hex |
|-------|-----|
| `--bg` | `#03045E` |
| `--bg-elevated` | `#0077B6` |
| `--border` | `#00B4D8` |
| `--text` | `#F0F9FF` |
| `--text-muted` | `#90E0EF` |
| `--accent` | `#00B4D8` |
| `--accent-fg` | `#03045E` |
| Палитра | `#03045E` `#0077B6` `#00B4D8` `#90E0EF` |

### neural-network

| Токен | Hex |
|-------|-----|
| `--bg` | `#0F172A` |
| `--bg-elevated` | `#1E293B` |
| `--border` | `#6366F1` |
| `--text` | `#FFFFFF` |
| `--text-muted` | `#94A3B8` |
| `--accent` | `#22D3EE` |
| `--accent-fg` | `#0F172A` |
| Secondary soft | `#6366F1` |
| Палитра | `#0F172A` `#6366F1` `#22D3EE` `#FFFFFF` |

### digital-pulse

| Токен | Hex |
|-------|-----|
| `--bg` | `#0F172A` |
| `--bg-elevated` | `#2E1065` |
| `--border` | `#DDD6FE44` |
| `--text` | `#DDD6FE` |
| `--text-muted` | `#A78BFA` |
| `--accent` | `#F472B6` |
| `--accent-fg` | `#0F172A` |
| Палитра | `#2E1065` `#F472B6` `#DDD6FE` `#0F172A` |

### cyber-moss

| Токен | Hex |
|-------|-----|
| `--bg` | `#1A1A1A` |
| `--bg-elevated` | `#386641` |
| `--border` | `#386641` |
| `--text` | `#F2F2F2` |
| `--text-muted` | `#A3A3A3` |
| `--accent` | `#D7FF44` |
| `--accent-fg` | `#1A1A1A` |
| Палитра | `#1A1A1A` `#D7FF44` `#386641` `#F2F2F2` |

### tech-noir

| Токен | Hex |
|-------|-----|
| `--bg` | `#111111` |
| `--bg-elevated` | `#374151` |
| `--border` | `#4B5563` |
| `--text` | `#D1D5DB` |
| `--text-muted` | `#9CA3AF` |
| `--accent` | `#DC2626` |
| `--accent-fg` | `#FFFFFF` |
| Палитра | `#111111` `#DC2626` `#374151` `#D1D5DB` |

### cyber-punch

| Токен | Hex |
|-------|-----|
| `--bg` | `#121212` |
| `--bg-elevated` | `#1C1C1C` |
| `--border` | `#333333` |
| `--text` | `#FFFFFF` |
| `--text-muted` | `#A3A3A3` |
| `--accent` | `#FFD000` |
| `--accent-fg` | `#121212` |
| `--danger` | `#FF0022` |
| Палитра | `#FF0022` `#121212` `#FFD000` `#FFFFFF` |

### noir-gold

| Токен | Hex |
|-------|-----|
| `--bg` | `#19171B` |
| `--bg-elevated` | `#252628` |
| `--border` | `#5D0018` |
| `--text` | `#F5F5F4` |
| `--text-muted` | `#A8A29E` |
| `--accent` | `#D29F22` |
| `--accent-fg` | `#19171B` |
| Secondary deep | `#5D0018` |
| Палитра | `#19171B` `#D29F22` `#252628` `#5D0018` |

### midnight-neon

| Токен | Hex |
|-------|-----|
| `--bg` | `#091221` |
| `--bg-elevated` | `#0236A5` |
| `--border` | `#0585E6` |
| `--text` | `#E0F2FE` |
| `--text-muted` | `#7DD3FC` |
| `--accent` | `#0585E6` |
| `--accent-fg` | `#091221` |
| Secondary action | `#FE0369` |
| Палитра | `#091221` `#0236A5` `#FE0369` `#0585E6` |

### neon-synth

| Токен | Hex |
|-------|-----|
| `--bg` | `#0B0E14` |
| `--bg-elevated` | `#460071` |
| `--border` | `#D403E166` |
| `--text` | `#F8FAFC` |
| `--text-muted` | `#C4B5FD` |
| `--accent` | `#09FBFF` |
| `--accent-fg` | `#0B0E14` |
| Secondary glow | `#D403E1` / `#03CCFF` |
| Палитра | `#D403E1` `#03CCFF` `#09FBFF` `#460071` |

### void-orchid

| Токен | Hex |
|-------|-----|
| `--bg` | `#040607` |
| `--bg-elevated` | `#5B2A62` |
| `--border` | `#4928C2` |
| `--text` | `#E3D9FC` |
| `--text-muted` | `#C4B5FD` |
| `--accent` | `#BF40FA` |
| `--accent-fg` | `#040607` |
| Deep panel | `#4928C2` |
| Палитра | `#E3D9FC` `#BF40FA` `#4928C2` `#5B2A62` `#040607` |

### signal-spectrum

| Токен | Hex |
|-------|-----|
| `--bg` | `#06070A` |
| `--bg-elevated` | `#12141A` |
| `--border` | `#AEB6C2` |
| `--text` | `#F5F7FF` |
| `--text-muted` | `#AEB6C2` |
| `--accent` | `#3D5AFE` |
| `--accent-fg` | `#F5F7FF` |
| `--danger` | `#FF2FA3` |
| `--warning` | `#FF8A1E` |
| Палитра | Void Black / Electric Cobalt / Synth Magenta / Toxic Amber / Titanium Fog / Holographic Pearl |

### neon-lux

| Токен | Hex |
|-------|-----|
| `--bg` | `#0D0303` |
| `--bg-elevated` | `#1A0A0A` |
| `--border` | `#BBEF1F44` |
| `--text` | `#EFF8FF` |
| `--text-muted` | `#A8B8C4` |
| `--accent` | `#BBEF1F` |
| `--accent-fg` | `#0D0303` |
| Secondary punch | `#FF0055` |
| Палитра | `#EFF8FF` `#BBEF1F` `#0D0303` `#FF0055` |

### apple-light

| Токен | Hex |
|-------|-----|
| `--bg` | `#F2F2F7` |
| `--bg-elevated` | `#FFFFFF` |
| `--border` | `#C6C6C8` |
| `--text` | `#000000` |
| `--text-muted` | `#8E8E93` |
| `--accent` | `#007AFF` |
| `--accent-fg` | `#FFFFFF` |
| `--danger` | `#FF3B30` |
| `--warning` | `#FF9500` |
| `--success` | `#34C759` |
| Палитра | iOS system light · Liquid Glass |

### apple-dark

| Токен | Hex |
|-------|-----|
| `--bg` | `#000000` |
| `--bg-elevated` | `#1C1C1E` |
| `--border` | `#38383A` |
| `--text` | `#FFFFFF` |
| `--text-muted` | `#8E8E93` |
| `--accent` | `#0A84FF` |
| `--accent-fg` | `#FFFFFF` |
| `--danger` | `#FF453A` |
| `--warning` | `#FF9F0A` |
| `--success` | `#32D74B` |
| Палитра | iOS system dark · Liquid Glass |

## Добавление новой палитры

1. Положить референс в `docs/themes/`.
2. Добавить строку в каталог + блок токенов.
3. Завести id (`kebab-case`).
4. Выбрать **один** `--accent` с проверкой контраста на `--bg` и на кнопке (`--accent-fg`).
5. Mira-палитры — карточка в Настройки → Внешний вид; Apple — подраздел там же.

---

Связано: `DESIGN.md` (IA, Настройки), `RULES.md`.

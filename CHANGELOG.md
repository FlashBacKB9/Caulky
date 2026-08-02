# Changelog

All notable changes to Caulky are documented here.

---

## [Unreleased] — dev

### ✨ New: Cuentas remuneradas

Mark an account as interest-bearing in Ajustes → Cuentas (subtype used for the interest
payment + withholding rate, 19% by default). Inversiones then splits into two tabs,
**Acciones** (the existing view) and **Cuentas remuneradas**:

- One card per account: balance-vs-monthly-interest chart, a row per payment and the list
  of the subtype's movements
- Interest for a month pays on the **previous month-end balance** — August interest pays for
  what you held at the end of July
- The bank credits interest net of withholding, so the gross is `net / (1 - rate)` and the
  annual rate is derived from the gross, to compare against the rate your bank advertises

### ✨ New: Account on templates

Templates can now carry the account the movement belongs to. It is honoured when applying
the template by hand, from Añadir rápido and from automatic recurrences.

### 🐛 Fixed: per-account movement view

Opening an account from Cuentas now shows every amount from that account's point of view:
a transfer into Ahorro adds there and subtracts in the spending account. Before, the balance
column was already correct but the amount kept the global sign, so a savings transfer read
as negative while the balance went up. Amount, balance, calendar and filtering now share a
single helper (`utils/accountView`), so they cannot drift apart. The balance column header
also carries the account name instead of the fixed «Saldo de uso».

### ✨ New: Calculadora flotante

Sidebar button (visible outside Configuración) that opens a small draggable calculator:

- Basic arithmetic (+, −, ×, ÷) plus percentage (`1250 % 21` = 21% of 1250), sign toggle and backspace
- **History panel** on the right; click any entry to reuse its result. Persisted in localStorage
- Drag by the title bar to any spot on the page; it keeps floating there while you work, across page navigation. Position is remembered
- Keyboard input only while the panel has focus, so it never steals keystrokes from the app's forms
- **Acerca de** is now shown only inside Configuración, freeing the slot for the calculator elsewhere

### ✨ New: Control de Gastos e Ingresos (`/gastos`)

Renamed from *Control de Gastos*. A Gastos/Ingresos tab next to the title switches the whole
module between both sides of the ledger:

- **Ingresos** covers income-type movements plus refunds (negative amounts on any type — the
  backend flips their sign), excluding transfers. Gastos covers movements with `dinero < 0`,
  so refunds no longer inflate expense totals
- Type filter, color palettes and chart modes work the same in both; each mode keeps its own
  filter selection in localStorage
- Summary cards invert the delta color in Ingresos (going up is green)
- **Tooltip** hides series at 0 € and sorts high to low; legend and table list only types with
  an actual amount in the active mode

Original expense analysis module:

- **Monthly evolution chart** — bar, area and line modes with stacked and cumulative variants
- **Multi-year comparison** — select any combination of years; series use opacity gradation to distinguish them
- **Type filter** with collapsible dropdown, category-level toggle and per-type color picker
- **Color palettes** — one-click palette presets (Vivos, Pastel, Tierra, Océano, Bosque) that auto-assign colors to all selected types; individual pickers remain available for overrides
- **Table view** — types × months for single year; multi-year "Por mes" (grouped type/year rows + Δ% comparison) and "Anual" (types × years + Δ%) toggle
- **Drag-to-reorder** rows in the table; order is persisted across sessions
- **Legend chips** — click to temporarily hide/show a series in the chart without removing it from the filter
- Filter selection persisted in localStorage across sessions
- Movements panel (collapsible) with quick type filter, advanced filter and column sort

### ✨ New: Tickets (`/tickets`) — analysis tab

New **Análisis** tab inside Tickets with charts:

- Spending by category (pie + bar)
- Monthly evolution (area/line/bar)
- Breakdown with date range filters, grouping options and chart type selector

### 🔧 Tickets — OCR and categorization improvements

- Switched to Gemini OCR (free tier) with automatic model fallback chain: `gemini-1.5-flash` → other Gemini models → Mistral `pixtral-12b` → Tesseract
- Dual-pass OCR: main pass for product lines + header crop for store name and date
- Improved product parser: handles dual-price receipts (Mercadona), filters IVA/weight lines, recovers rows with bad OCR
- Configurable ticket categories in Settings with custom icons, colors and AI-assisted categorization
- OCR source badge on each ticket (shows which backend was used)
- API keys for Gemini and Mistral manageable from Settings

### 🐛 Bug fixes

- Dark mode support for Recharts tooltips in Tickets and Control de Gastos
- Fixed `nav.expenses` showing as a raw i18n key in the sidebar
- Fixed CategoryPicker scroll and dropdown position in Tickets
- Fixed Tooltip formatter type errors (Recharts `NameType | undefined`)

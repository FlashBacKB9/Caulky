# Changelog

All notable changes to Caulky are documented here.

---

## [v1.9.3] — 2026-10-08

### 🔧 Improved
- Card payments are shown as neutral transfers in the calendar, table and kanban (grey, `⇄`,
  no sign) and the calendar's daily total ignores them, so they don't read as one more expense
  next to the card purchases. Inside the card or the paying account they keep their sign
  (`isNeutralSettlement`)

## [v1.9.2] — 2026-10-08

### ✨ Added
- Settings → Accounts is organised by real (bank) account: each one opens as a dropdown with
  the virtual accounts, cards, assets or investments inside it. Accounts that don't belong to
  any bank stay below, under "Accounts without a real account", and work as before
- A real account created without virtual accounts gets one with the same name (hidden in
  Settings until you add another); it follows the real account's name and colour

### 🐛 Fixed
- Card payments showed `+0` in the calendar, table and kanban: their `dinero` is 0 so they don't
  count as an expense, but listings now show what leaves the paying account (`displayAmount`)
- Backups now include real accounts and their links; restore, reset and demo mode clear them too
- SQLite: deleting accounts left orphan links in `real_account_accounts`, and since SQLite reuses
  IDs a new account could show up inside an old real account (or fail to be created)

### 🔧 Improved
- Card purchases get the payment day of their cycle as bank date, when created or edited and
  when their payment is generated (the money leaves the bank on that day)
- A virtual account belongs to a single real account: linking it to another moves it
- `POST /api/real-accounts` accepts `initial_balance` for the account created when none is linked
- Dev: the Vite `/api` proxy target can be changed with `VITE_PROXY_TARGET`

## [v1.9.1] — 2026-10-08

### 🐛 Fixed
- The upcoming card payment in the calendar and the purchases of a payment refresh after any
  saved change (global `MutationCache` invalidation of `credit-cycles` / `credit-link`), so a
  new card purchase shows up without reloading
- Docker (`frontend/nginx.conf`): `index.html` is served with `Cache-Control: no-cache` and the
  hashed `/assets/` with a long immutable cache, so browsers pick up a new release right away

### 🔧 Improved
- `PUT /api/accounts/{id}` accepts `credit_last_cycle_end` (not in the future). Moving it back
  makes the app generate the payments of the following cycles exactly as in normal use;
  a cycle that already has its payment is not duplicated

## [v1.9] — 2026-10-08

### 🐛 Fixed: standalone upgrades

The standalone executable built its SQLite database with `create_all`, which never adds
columns to existing tables, so upgrading from an older version failed as soon as the app read
a newer column. On startup it now runs `schema_sync`: it creates missing tables and adds the
missing columns (`ALTER TABLE … ADD COLUMN`, with the model's default for `NOT NULL` ones).
It is idempotent: an up-to-date database is left untouched.

### ✨ New: card payment ↔ purchases

- A card payment lists the purchases it covers below its notes; each one opens its own detail
  with a back arrow
- A purchase that has already been charged shows a button to jump to its card payment
- Payments now store `credit_cycle_start`; `GET /movements/{id}/credit-link` returns the
  purchases of a payment (`items`) or the payment of a purchase (`settlement`)
- The movement detail modal fits the screen with UI zoom and scrolls its content

### ✨ New: Tarjetas de crédito

New account category **Tarjeta de crédito** (Ajustes → Cuentas) with credit limit,
statement (cutoff) day, payment day and paying account (main account by default):

- Every purchase made with the card is a normal expense on its own date, so budgets and
  charts stay current
- On the payment day the cycle's purchases (refunds subtracted) are grouped into a single
  transfer from the paying account to the card, marked with `credit_cycle_end`. It moves
  money between accounts but is not an expense (`dinero = 0`), so nothing counts twice
- The upcoming payment shows as a faded preview in the Movimientos calendar. Per card you
  choose whether it is created automatically when the day arrives (default; overdue ones are
  caught up on the next visit) or stays as a preview until you click it
- The card shows the available credit (limit + balance); total net worth only subtracts the
  debt. A deleted payment is not regenerated (`credit_last_cycle_end` tracks what is settled)
- Endpoints: `GET /accounts/credit-cycles`, `POST /accounts/{id}/credit-charges`
- Backup import now remaps `from_account_id` and the card's paying account

### 🐛 Fixed: account balance history

The balance evolution in Cuentas and the Dashboard now uses the same rule as the current
balance (`accountView.balanceDelta`): movements count for their assigned account and
transfers move money between both sides, instead of everything landing in the main account.

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

# Changelog

All notable changes to Caulky are documented here.

---

## [Unreleased] — dev

### ✨ New: Control de Gastos (`/gastos`)

New dedicated expense analysis module:

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

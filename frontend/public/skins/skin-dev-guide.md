# Caulky Skin Developer Guide

Caulky skins are plain JavaScript ES modules that export a configuration object. A skin can change **everything**: fonts, colors, border radius, layout structure, and more.

---

## File format

```js
export default {
  name: "My Skin",           // required — shown in Settings
  author: "Your Name",       // optional
  version: "1.0",            // optional
  description: "Short text", // optional — shown in Settings
  layout: "topnav",          // optional — "sidebar" (default) | "topnav"
  css: `
    /* your CSS here */
  `
}
```

Save the file as `my-skin.js` and upload it in **Settings → Skins**.

---

## Layout options

| Value | Effect |
|-------|--------|
| `"sidebar"` | Default layout: vertical sidebar on the left (desktop) |
| `"topnav"` | Horizontal navigation bar across the top |

When you change layout, the app reloads automatically to apply the structural change.

---

## How CSS injection works

Your `css` string is injected as a `<style>` element appended to `document.head`, **after** Tailwind's stylesheet. This means:

- Use `!important` to override Tailwind utility classes reliably.
- `@import` rules **must be at the very top** of your CSS string (before any other rules).
- Both light and dark mode are supported — use `.dark .dark\\:class-name` for dark overrides (see below).
- CSS custom properties (`--my-var`), animations, `@keyframes`, and any valid CSS all work.

---

## Key CSS targets

### Layout elements

```css
/* Top nav bar (when layout: "topnav") */
#topnav { ... }

/* Sidebar (when layout: "sidebar") — no ID, target by structure */
/* e.g. nav inside the sidebar is: nav.flex.flex-col */
```

### Background colors (light mode)

```css
.bg-gray-50  { /* page background */ }
.bg-white    { /* card / panel background */ }
.bg-gray-100 { /* subtle background: active states, inputs */ }
.bg-gray-200 { /* slightly stronger subtle background */ }
```

### Borders & dividers

```css
.border-gray-100 { /* card borders */ }
.border-gray-200 { /* input borders */ }
.divide-gray-50  > :not([hidden]) ~ :not([hidden]) { /* list item separators (faint) */ }
.divide-gray-100 > :not([hidden]) ~ :not([hidden]) { /* list item separators (standard) */ }
```

### Text colors

```css
.text-gray-800 { /* primary text (headings, values) */ }
.text-gray-700 { /* secondary text (labels) */ }
.text-gray-500 { /* muted text */ }
.text-gray-400 { /* placeholder / hint text */ }
```

### Accent color (default: blue)

```css
.bg-blue-500  { /* filled accent buttons, toggles, active state */ }
.bg-blue-600  { /* hover state of accent */ }
.text-blue-500 { /* accent text */ }
.border-blue-500 { /* accent border */ }
.bg-blue-50   { /* very light accent background (icon chips) */ }
.ring-blue-400 { /* focus ring */ }
```

### Border radius

```css
.rounded     { /* small radius (badges, tags) — default 0.25rem */ }
.rounded-lg  { /* medium radius (inputs, buttons) — default 0.5rem */ }
.rounded-xl  { /* large radius (cards, modals) — default 0.75rem */ }
.rounded-2xl { /* extra large radius — default 1rem */ }
```

### Typography

```css
/* Import a Google Font and apply globally */
@import url('https://fonts.googleapis.com/css2?family=YourFont:wght@400;700&display=swap');

*, *::before, *::after {
  font-family: 'YourFont', system-ui, sans-serif !important;
}
```

### Section labels

```css
/* The small ALL-CAPS labels above each settings group */
.uppercase.tracking-widest { color: ...; }
```

### Page titles

```css
h1.font-bold { color: ...; }
/* or gradient text: */
h1.font-bold {
  background: linear-gradient(135deg, #color1, #color2);
  -webkit-background-clip: text !important;
  -webkit-text-fill-color: transparent !important;
  background-clip: text !important;
}
```

---

## Dark mode

The app adds the class `dark` to `<html>` when dark mode is active. Tailwind dark mode classes are generated as `.dark .dark\:class-name`. To override them:

```css
/* Override dark mode card background */
.dark .dark\:bg-gray-900 { background-color: #1a0a2e !important; }

/* Override dark mode page background */
.dark .dark\:bg-gray-950 { background-color: #0f0520 !important; }

/* Override dark mode text */
.dark .dark\:text-white { color: #f0e6ff !important; }
```

> Tip: If your skin is mainly a light-mode design (like a pastel theme), you can skip dark mode overrides — the default dark colors will still work, just without your custom palette.

---

## Common recipes

### Color palette swap

Replace the entire blue accent with a custom color:

```css
.bg-blue-500  { background-color: #your-color !important; }
.bg-blue-600  { background-color: #your-darker !important; }
.text-blue-500 { color: #your-color !important; }
.border-blue-500 { border-color: #your-color !important; }
.bg-blue-50   { background-color: #your-lightest !important; }
```

### Card shadow

```css
.border-gray-100.rounded-xl {
  box-shadow: 0 2px 16px rgba(r, g, b, 0.08) !important;
}
```

### Custom scrollbar

```css
::-webkit-scrollbar { width: 6px; height: 6px; }
::-webkit-scrollbar-track { background: #f5f5f5; }
::-webkit-scrollbar-thumb { background: #ccc; border-radius: 3px; }
::-webkit-scrollbar-thumb:hover { background: #aaa; }
```

### Top nav gradient (topnav layout)

```css
#topnav {
  background: linear-gradient(135deg, #color1 0%, #color2 100%) !important;
  border-bottom: 1px solid #accent !important;
  box-shadow: 0 4px 24px rgba(r, g, b, 0.12) !important;
}
```

### Animated accent

```css
@keyframes pulse-accent {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.8; }
}
.bg-blue-500 {
  background-color: #your-color !important;
  animation: pulse-accent 2s ease-in-out infinite;
}
```

---

## Full minimal example

```js
export default {
  name: "Dark Forest",
  author: "Your Name",
  version: "1.0",
  description: "Deep green palette with a clean topnav.",
  layout: "topnav",
  css: `
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');

*, *::before, *::after { font-family: 'Inter', sans-serif !important; }

.bg-gray-50 { background-color: #f0fdf4 !important; }
.bg-white   { background-color: #f7fef9 !important; }

.bg-blue-500 { background-color: #16a34a !important; }
.text-blue-500 { color: #16a34a !important; }

#topnav {
  background: linear-gradient(135deg, #dcfce7 0%, #d1fae5 100%) !important;
  border-bottom: 1px solid #86efac !important;
}
  `
}
```

---

## Tips

- **Test in light mode first** — it's easier to see the contrast of your palette.
- **Use `!important` everywhere** — Tailwind's specificity is equal to yours, so `!important` is necessary to win.
- **Avoid overriding semantic colors** like `text-red-600` (errors) or `text-green-500` (income) — users rely on these for meaning.
- **`layout: "topnav"` is a page reload** — the app reloads when you toggle a skin with a different layout, which is expected behavior.
- **Keep the file under ~50KB** — the skin is stored in `localStorage`.

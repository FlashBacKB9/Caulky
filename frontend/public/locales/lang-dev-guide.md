# Caulky Language Developer Guide

Caulky supports custom translations via plain JavaScript ES modules. You can add any language, including regional variants, constructed languages, or joke languages.

---

## File format

```js
export default {
  name: "My Language",   // required — displayed in the language picker
  flag: "🏴",            // optional — emoji flag shown next to the name
  author: "Your Name",   // optional
  version: "1.0",        // optional

  // Translation keys — only include what you want to override
  "nav.dashboard": "...",
  "common.save": "...",
  // ...
}
```

Save the file as `my-language.js` and upload it in **Settings → Language**.

**Keys you don't include will fall back to Spanish.**

---

## Complete list of translation keys

Paste this section to an AI and ask it to fill in the values for your target language.

```js
export default {
  name: "TARGET LANGUAGE NAME",
  flag: "🏳️",

  // ── Navigation ──
  "nav.dashboard":   "",
  "nav.movements":   "",
  "nav.accounts":    "",
  "nav.annual":      "",
  "nav.charts":      "",
  "nav.comparisons": "",
  "nav.budgets":     "",
  "nav.investments": "",
  "nav.import":      "",
  "nav.projection":  "",
  "nav.analysis":    "",
  "nav.docs":        "",

  // ── Common actions ──
  "common.save":        "",
  "common.cancel":      "",
  "common.delete":      "",
  "common.edit":        "",
  "common.add":         "",
  "common.close":       "",
  "common.loading":     "",
  "common.confirm":     "",
  "common.error":       "",
  "common.name":        "",
  "common.description": "",
  "common.date":        "",
  "common.amount":      "",
  "common.notes":       "",
  "common.type":        "",
  "common.account":     "",
  "common.filter":      "",
  "common.search":      "",
  "common.back":        "",
  "common.yes":         "",
  "common.no":          "",

  // ── Authentication ──
  "auth.login":             "",
  "auth.register":          "",
  "auth.email":             "",
  "auth.password":          "",
  "auth.name":              "",   // "Name (optional)"
  "auth.submitLogin":       "",
  "auth.submitRegister":    "",
  "auth.loading":           "",
  "auth.errorCredentials":  "",
  "auth.errorExists":       "",
  "auth.errorRegister":     "",
  "auth.errorLogin":        "",
  "auth.footer":            "",   // "Local account · data stored on your server"
  "auth.chooseLanguage":    "",

  // ── Movement types ──
  "movement.expense":  "",
  "movement.income":   "",
  "movement.refund":   "",
  "movement.type":     "",   // "Transaction type"
  "movement.bankDate": "",

  // ── Settings ──
  "settings.title":              "",
  "settings.originalConfig":     "",
  "settings.originalConfigDesc": "",
  "settings.accounts":           "",
  "settings.movementTypes":      "",
  "settings.appearance":         "",
  "settings.theme":              "",
  "settings.lightMode":          "",
  "settings.darkMode":           "",
  "settings.currency":           "",
  "settings.dateFormat":         "",
  "settings.uiSize":             "",
  "settings.language":           "",
  "settings.languageDesc":       "",
  "settings.languageCustom":     "",
  "settings.languageInstall":    "",
  "settings.languageExample":    "",
  "settings.languageGuide":      "",
  "settings.noCustomLangs":      "",
  "settings.skins":              "",
  "settings.skinsDesc":          "",
  "settings.movements":          "",
  "settings.sharedMovements":    "",
  "settings.navigation":         "",
  "settings.navigationDesc":     "",
  "settings.dashboard":          "",
  "settings.editDashboard":      "",
  "settings.editDashboardDesc":  "",
  "settings.backup":             "",
  "settings.plugins":            "",
  "settings.pluginsDesc":        "",
  "settings.danger":             "",
  "settings.resetSystem":        "",
  "settings.resetSystemDesc":    "",

  // ── Layout chrome ──
  "layout.settings": "",
  "layout.about":    "",
  "layout.logout":   "",

  // ── Quick Add (Speed Mode) ──
  "quickadd.title":       "",
  "quickadd.templates":   "",
  "quickadd.noTemplates": "",
  "quickadd.save":        "",
  "quickadd.saving":      "",
  "quickadd.date":        "",
  "quickadd.bankDate":    "",
  "quickadd.type":        "",
  "quickadd.account":     "",
}
```

---

## Prompt for AI translation

Copy this prompt and paste it to any AI model (Claude, GPT, Gemini, etc.):

```
I want to create a translation file for the Caulky personal finance app.
Target language: [YOUR LANGUAGE]

Below is a JavaScript object with all translatable keys. Please fill in
the empty string values with the correct translations.
Use natural, concise phrasing typical for a finance/budgeting app UI.

Keep in mind:
- "Caulky" is the app name — do not translate it.
- Keys ending in "Desc" are longer descriptions, the rest are short labels.
- "movement.expense" / "income" / "refund" are transaction kind labels.
- "settings.sharedMovements" refers to splitting bills with others.
- "auth.footer" is a small note below the login form.

[PASTE THE FULL OBJECT FROM THE SECTION ABOVE]
```

---

## Tips

- **You don't need all keys.** Keys you omit fall back to Spanish automatically.
- **File size matters.** The translation is stored in `localStorage` (~5MB limit). Aim to keep the file under 50KB.
- **The file must be a valid ES module.** It must use `export default { ... }`.
- **Reload is required.** The app reloads after switching language — this is expected.
- **Test edge cases.** Check longer words don't break layout in the sidebar nav and settings sections.

---

## Spanish reference (base language)

| Key | Spanish value |
|-----|--------------|
| `nav.dashboard` | Dashboard |
| `nav.movements` | Movimientos |
| `nav.accounts` | Cuentas |
| `common.save` | Guardar |
| `common.cancel` | Cancelar |
| `common.delete` | Eliminar |
| `auth.login` | Iniciar sesión |
| `auth.register` | Registrarse |
| `movement.expense` | Gasto |
| `movement.income` | Ingreso |
| `movement.refund` | Devolución |
| `settings.title` | Configuración |
| `settings.danger` | Zona de peligro |
| `layout.logout` | Cerrar sesión |
| `quickadd.save` | Guardar |

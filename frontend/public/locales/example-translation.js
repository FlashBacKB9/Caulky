// ─────────────────────────────────────────────────────────────────────────────
// Caulky · Archivo de traducción de ejemplo
// Copia este archivo, traduce los valores y cárga lo en Configuración → Idioma.
// ─────────────────────────────────────────────────────────────────────────────

export default {
  // ── Metadatos del idioma ────────────────────────────────────────────────────
  name: "Català",          // Nombre que aparecerá en el selector (obligatorio)
  flag: "🏴",              // Emoji de bandera (opcional)
  author: "Tu nombre",     // Opcional
  version: "1.0",          // Opcional

  // ── Traducciones ────────────────────────────────────────────────────────────
  // Las claves que no incluyas usarán el español como fallback.

  "lang.name": "Català",

  // Navegación
  "nav.dashboard":   "Tauler",
  "nav.movements":   "Moviments",
  "nav.accounts":    "Comptes",
  "nav.annual":      "Finances anuals",
  "nav.charts":      "Gràfics",
  "nav.comparisons": "Comparacions",
  "nav.budgets":     "Pressupostos",
  "nav.investments": "Inversions",
  "nav.import":      "Importar Excel",
  "nav.projection":  "Projecció",
  "nav.analysis":    "Anàlisi",
  "nav.docs":        "Documentació",

  // Acciones comunes
  "common.save":        "Desar",
  "common.cancel":      "Cancel·lar",
  "common.delete":      "Eliminar",
  "common.edit":        "Editar",
  "common.add":         "Afegir",
  "common.close":       "Tancar",
  "common.loading":     "Carregant...",
  "common.confirm":     "Confirmar",
  "common.error":       "Error",
  "common.name":        "Nom",
  "common.description": "Descripció",
  "common.date":        "Data",
  "common.amount":      "Import",
  "common.notes":       "Notes",
  "common.type":        "Tipus",
  "common.account":     "Compte",
  "common.filter":      "Filtrar",
  "common.search":      "Cercar",
  "common.back":        "Tornar",
  "common.yes":         "Sí",
  "common.no":          "No",

  // Autenticació
  "auth.login":             "Iniciar sessió",
  "auth.register":          "Registrar-se",
  "auth.email":             "Correu electrònic",
  "auth.password":          "Contrasenya",
  "auth.name":              "Nom (opcional)",
  "auth.submitLogin":       "Entrar",
  "auth.submitRegister":    "Crear compte",
  "auth.loading":           "Carregant...",
  "auth.errorCredentials":  "Correu o contrasenya incorrectes",
  "auth.errorExists":       "Ja existeix un compte amb aquest correu",
  "auth.errorRegister":     "Error en crear el compte",
  "auth.errorLogin":        "Error en iniciar sessió",
  "auth.footer":            "Compte local · les dades es guarden al teu servidor",
  "auth.chooseLanguage":    "Tria el teu idioma",

  // Tipus de moviment
  "movement.expense":  "Despesa",
  "movement.income":   "Ingrés",
  "movement.refund":   "Devolució",
  "movement.type":     "Tipus de moviment",
  "movement.bankDate": "Data del banc",

  // Configuració
  "settings.title":              "Configuració",
  "settings.originalConfig":     "Configuració original",
  "settings.originalConfigDesc": "Comptes bancaris i tipus de moviment. Configura'ls una vegada en començar; rarament necessiten canvis.",
  "settings.accounts":           "Comptes",
  "settings.movementTypes":      "Tipus de moviment",
  "settings.appearance":         "Aparença",
  "settings.theme":              "Tema",
  "settings.lightMode":          "Mode clar",
  "settings.darkMode":           "Mode fosc",
  "settings.currency":           "Moneda",
  "settings.dateFormat":         "Format de data",
  "settings.uiSize":             "Mida de la interfície",
  "settings.language":           "Idioma",
  "settings.languageDesc":       "Canvia l'idioma de la interfície. L'app es recarregarà en canviar.",
  "settings.languageCustom":     "Idiomes personalitzats",
  "settings.languageInstall":    "Instal·lar idioma (.js)",
  "settings.languageExample":    "Exemple",
  "settings.languageGuide":      "Guia IA",
  "settings.noCustomLangs":      "No hi ha idiomes personalitzats instal·lats.",
  "settings.skins":              "Skins",
  "settings.skinsDesc":          "Canvia completament l'aspecte de l'app pujant un fitxer .js de skin.",
  "settings.movements":          "Moviments",
  "settings.sharedMovements":    "Moviments compartits",
  "settings.navigation":         "Navegació",
  "settings.navigationDesc":     "Tria quines pàgines apareixen al menú i en quin ordre.",
  "settings.dashboard":          "Tauler",
  "settings.editDashboard":      "Editar tauler",
  "settings.editDashboardDesc":  "Afegir, moure i redimensionar widgets",
  "settings.backup":             "Còpia de seguretat",
  "settings.plugins":            "Plugins",
  "settings.pluginsDesc":        "Amplia l'app pujant fitxers .js. Els plugins es guarden al teu navegador.",
  "settings.danger":             "Zona de perill",
  "settings.resetSystem":        "Restablir sistema",
  "settings.resetSystemDesc":    "Esborra totes les dades i deixa l'app com a nova",

  // Layout
  "layout.settings": "Configuració",
  "layout.about":    "Sobre",
  "layout.logout":   "Tancar sessió",

  // Afegir ràpid
  "quickadd.title":       "Afegir moviment",
  "quickadd.templates":   "Plantilles",
  "quickadd.noTemplates": "No hi ha plantilles desades",
  "quickadd.save":        "Desar",
  "quickadd.saving":      "Desant…",
  "quickadd.date":        "Data",
  "quickadd.bankDate":    "Data del banc",
  "quickadd.type":        "Tipus",
  "quickadd.account":     "Compte",
}

// ── Built-in translations ──────────────────────────────────────────────────────

const ES: Record<string, string> = {
  'lang.name': 'Español',

  'nav.dashboard':    'Dashboard',
  'nav.movements':    'Movimientos',
  'nav.accounts':     'Cuentas',
  'nav.annual':       'Finanzas del Año',
  'nav.charts':       'Gráficos',
  'nav.comparisons':  'Comparaciones',
  'nav.budgets':      'Presupuestos',
  'nav.investments':  'Inversiones',
  'nav.import':       'Importar Excel',
  'nav.projection':   'Proyección',
  'nav.analysis':     'Análisis',
  'nav.docs':         'Documentación',

  'common.save':        'Guardar',
  'common.cancel':      'Cancelar',
  'common.delete':      'Eliminar',
  'common.edit':        'Editar',
  'common.add':         'Añadir',
  'common.close':       'Cerrar',
  'common.loading':     'Cargando...',
  'common.confirm':     'Confirmar',
  'common.error':       'Error',
  'common.name':        'Nombre',
  'common.description': 'Descripción',
  'common.date':        'Fecha',
  'common.amount':      'Cantidad',
  'common.notes':       'Notas',
  'common.type':        'Tipo',
  'common.account':     'Cuenta',
  'common.filter':      'Filtrar',
  'common.search':      'Buscar',
  'common.back':        'Volver',
  'common.yes':         'Sí',
  'common.no':          'No',

  'auth.login':             'Iniciar sesión',
  'auth.register':          'Registrarse',
  'auth.email':             'Email',
  'auth.password':          'Contraseña',
  'auth.name':              'Nombre (opcional)',
  'auth.submitLogin':       'Entrar',
  'auth.submitRegister':    'Crear cuenta',
  'auth.loading':           'Cargando...',
  'auth.errorCredentials':  'Email o contraseña incorrectos',
  'auth.errorExists':       'Ya existe una cuenta con ese email',
  'auth.errorRegister':     'Error al crear la cuenta',
  'auth.errorLogin':        'Error al iniciar sesión',
  'auth.footer':            'Cuenta local · los datos se guardan en tu servidor',
  'auth.chooseLanguage':    'Elige tu idioma',

  'movement.expense':  'Gasto',
  'movement.income':   'Ingreso',
  'movement.refund':   'Devolución',
  'movement.type':     'Tipo de movimiento',
  'movement.bankDate': 'Fecha banco',

  'settings.title':              'Configuración',
  'settings.originalConfig':     'Configuración Original',
  'settings.originalConfigDesc': 'Cuentas bancarias y tipos de movimiento. Configúralos una vez al empezar; no suelen necesitar cambios.',
  'settings.accounts':           'Cuentas',
  'settings.movementTypes':      'Tipos de movimiento',
  'settings.appearance':         'Apariencia',
  'settings.theme':              'Tema',
  'settings.lightMode':          'Modo claro',
  'settings.darkMode':           'Modo oscuro',
  'settings.currency':           'Moneda',
  'settings.dateFormat':         'Formato de fecha',
  'settings.uiSize':             'Tamaño de la interfaz',
  'settings.language':           'Idioma',
  'settings.languageDesc':       'Cambia el idioma de la interfaz. La app se recargará al cambiar.',
  'settings.languageCustom':     'Idiomas personalizados',
  'settings.languageInstall':    'Instalar idioma (.js)',
  'settings.languageExample':    'Ejemplo',
  'settings.languageGuide':      'Guía IA',
  'settings.noCustomLangs':      'No hay idiomas personalizados instalados.',
  'settings.skins':              'Skins',
  'settings.skinsDesc':          'Cambia el aspecto completo de la app subiendo un archivo .js de skin.',
  'settings.movements':          'Movimientos',
  'settings.sharedMovements':    'Movimientos compartidos',
  'settings.navigation':         'Navegación',
  'settings.navigationDesc':     'Elige qué páginas aparecen en el menú lateral y en qué orden.',
  'settings.dashboard':          'Dashboard',
  'settings.editDashboard':      'Editar Dashboard',
  'settings.editDashboardDesc':  'Añadir, mover y redimensionar widgets',
  'settings.backup':             'Copia de seguridad',
  'settings.plugins':            'Plugins',
  'settings.pluginsDesc':        'Extiende la app subiendo archivos .js. Los plugins se guardan en tu navegador.',
  'settings.danger':             'Zona de peligro',
  'settings.resetSystem':        'Restablecer sistema',
  'settings.resetSystemDesc':    'Borra todos los datos y deja la app como nueva',

  'layout.settings': 'Configuración',
  'layout.about':    'Acerca de',
  'layout.logout':   'Cerrar sesión',

  'quickadd.title':       'Añadir movimiento',
  'quickadd.templates':   'Plantillas',
  'quickadd.noTemplates': 'No hay plantillas guardadas',
  'quickadd.save':        'Guardar',
  'quickadd.saving':      'Guardando…',
  'quickadd.date':        'Fecha',
  'quickadd.bankDate':    'Fecha banco',
  'quickadd.type':        'Tipo',
  'quickadd.account':     'Cuenta',
}

const EN: Record<string, string> = {
  'lang.name': 'English',

  'nav.dashboard':    'Dashboard',
  'nav.movements':    'Transactions',
  'nav.accounts':     'Accounts',
  'nav.annual':       'Annual Finances',
  'nav.charts':       'Charts',
  'nav.comparisons':  'Comparisons',
  'nav.budgets':      'Budgets',
  'nav.investments':  'Investments',
  'nav.import':       'Import Excel',
  'nav.projection':   'Projection',
  'nav.analysis':     'Analysis',
  'nav.docs':         'Documentation',

  'common.save':        'Save',
  'common.cancel':      'Cancel',
  'common.delete':      'Delete',
  'common.edit':        'Edit',
  'common.add':         'Add',
  'common.close':       'Close',
  'common.loading':     'Loading...',
  'common.confirm':     'Confirm',
  'common.error':       'Error',
  'common.name':        'Name',
  'common.description': 'Description',
  'common.date':        'Date',
  'common.amount':      'Amount',
  'common.notes':       'Notes',
  'common.type':        'Type',
  'common.account':     'Account',
  'common.filter':      'Filter',
  'common.search':      'Search',
  'common.back':        'Back',
  'common.yes':         'Yes',
  'common.no':          'No',

  'auth.login':             'Sign in',
  'auth.register':          'Register',
  'auth.email':             'Email',
  'auth.password':          'Password',
  'auth.name':              'Name (optional)',
  'auth.submitLogin':       'Sign in',
  'auth.submitRegister':    'Create account',
  'auth.loading':           'Loading...',
  'auth.errorCredentials':  'Incorrect email or password',
  'auth.errorExists':       'An account with this email already exists',
  'auth.errorRegister':     'Error creating account',
  'auth.errorLogin':        'Error signing in',
  'auth.footer':            'Local account · data is stored on your server',
  'auth.chooseLanguage':    'Choose your language',

  'movement.expense':  'Expense',
  'movement.income':   'Income',
  'movement.refund':   'Refund',
  'movement.type':     'Transaction type',
  'movement.bankDate': 'Bank date',

  'settings.title':              'Settings',
  'settings.originalConfig':     'Core Setup',
  'settings.originalConfigDesc': 'Bank accounts and transaction types. Set these up once when you start; they rarely need changes.',
  'settings.accounts':           'Accounts',
  'settings.movementTypes':      'Transaction types',
  'settings.appearance':         'Appearance',
  'settings.theme':              'Theme',
  'settings.lightMode':          'Light mode',
  'settings.darkMode':           'Dark mode',
  'settings.currency':           'Currency',
  'settings.dateFormat':         'Date format',
  'settings.uiSize':             'Interface size',
  'settings.language':           'Language',
  'settings.languageDesc':       'Change the app language. The app will reload when changed.',
  'settings.languageCustom':     'Custom languages',
  'settings.languageInstall':    'Install language (.js)',
  'settings.languageExample':    'Example',
  'settings.languageGuide':      'AI Guide',
  'settings.noCustomLangs':      'No custom languages installed.',
  'settings.skins':              'Skins',
  'settings.skinsDesc':          'Completely restyle the app by uploading a .js skin file.',
  'settings.movements':          'Transactions',
  'settings.sharedMovements':    'Shared transactions',
  'settings.navigation':         'Navigation',
  'settings.navigationDesc':     'Choose which pages appear in the menu and in what order.',
  'settings.dashboard':          'Dashboard',
  'settings.editDashboard':      'Edit Dashboard',
  'settings.editDashboardDesc':  'Add, move and resize widgets',
  'settings.backup':             'Backup',
  'settings.plugins':            'Plugins',
  'settings.pluginsDesc':        'Extend the app by uploading .js files. Plugins are stored in your browser.',
  'settings.danger':             'Danger zone',
  'settings.resetSystem':        'Reset system',
  'settings.resetSystemDesc':    'Delete all data and restore the app to a fresh state',

  'layout.settings': 'Settings',
  'layout.about':    'About',
  'layout.logout':   'Sign out',

  'quickadd.title':       'Add transaction',
  'quickadd.templates':   'Templates',
  'quickadd.noTemplates': 'No templates saved',
  'quickadd.save':        'Save',
  'quickadd.saving':      'Saving…',
  'quickadd.date':        'Date',
  'quickadd.bankDate':    'Bank date',
  'quickadd.type':        'Type',
  'quickadd.account':     'Account',
}

const FR: Record<string, string> = {
  'lang.name': 'Français',

  'nav.dashboard':    'Tableau de bord',
  'nav.movements':    'Transactions',
  'nav.accounts':     'Comptes',
  'nav.annual':       'Finances annuelles',
  'nav.charts':       'Graphiques',
  'nav.comparisons':  'Comparaisons',
  'nav.budgets':      'Budgets',
  'nav.investments':  'Investissements',
  'nav.import':       'Importer Excel',
  'nav.projection':   'Projection',
  'nav.analysis':     'Analyse',
  'nav.docs':         'Documentation',

  'common.save':        'Enregistrer',
  'common.cancel':      'Annuler',
  'common.delete':      'Supprimer',
  'common.edit':        'Modifier',
  'common.add':         'Ajouter',
  'common.close':       'Fermer',
  'common.loading':     'Chargement...',
  'common.confirm':     'Confirmer',
  'common.error':       'Erreur',
  'common.name':        'Nom',
  'common.description': 'Description',
  'common.date':        'Date',
  'common.amount':      'Montant',
  'common.notes':       'Notes',
  'common.type':        'Type',
  'common.account':     'Compte',
  'common.filter':      'Filtrer',
  'common.search':      'Rechercher',
  'common.back':        'Retour',
  'common.yes':         'Oui',
  'common.no':          'Non',

  'auth.login':             'Connexion',
  'auth.register':          "S'inscrire",
  'auth.email':             'Email',
  'auth.password':          'Mot de passe',
  'auth.name':              'Nom (facultatif)',
  'auth.submitLogin':       'Se connecter',
  'auth.submitRegister':    'Créer un compte',
  'auth.loading':           'Chargement...',
  'auth.errorCredentials':  'Email ou mot de passe incorrect',
  'auth.errorExists':       'Un compte avec cet email existe déjà',
  'auth.errorRegister':     'Erreur lors de la création du compte',
  'auth.errorLogin':        'Erreur de connexion',
  'auth.footer':            'Compte local · les données sont stockées sur votre serveur',
  'auth.chooseLanguage':    'Choisissez votre langue',

  'movement.expense':  'Dépense',
  'movement.income':   'Revenu',
  'movement.refund':   'Remboursement',
  'movement.type':     'Type de transaction',
  'movement.bankDate': 'Date bancaire',

  'settings.title':              'Paramètres',
  'settings.originalConfig':     'Configuration initiale',
  'settings.originalConfigDesc': "Comptes bancaires et types de transactions. Configurez-les une fois au démarrage ; ils nécessitent rarement des modifications.",
  'settings.accounts':           'Comptes',
  'settings.movementTypes':      'Types de transactions',
  'settings.appearance':         'Apparence',
  'settings.theme':              'Thème',
  'settings.lightMode':          'Mode clair',
  'settings.darkMode':           'Mode sombre',
  'settings.currency':           'Devise',
  'settings.dateFormat':         'Format de date',
  'settings.uiSize':             "Taille de l'interface",
  'settings.language':           'Langue',
  'settings.languageDesc':       "Changer la langue de l'application. L'app se rechargera lors du changement.",
  'settings.languageCustom':     'Langues personnalisées',
  'settings.languageInstall':    'Installer une langue (.js)',
  'settings.languageExample':    'Exemple',
  'settings.languageGuide':      'Guide IA',
  'settings.noCustomLangs':      'Aucune langue personnalisée installée.',
  'settings.skins':              'Thèmes visuels',
  'settings.skinsDesc':          "Modifiez complètement l'apparence de l'app en téléchargeant un fichier .js.",
  'settings.movements':          'Transactions',
  'settings.sharedMovements':    'Transactions partagées',
  'settings.navigation':         'Navigation',
  'settings.navigationDesc':     'Choisissez les pages qui apparaissent dans le menu et leur ordre.',
  'settings.dashboard':          'Tableau de bord',
  'settings.editDashboard':      'Modifier le tableau de bord',
  'settings.editDashboardDesc':  'Ajouter, déplacer et redimensionner les widgets',
  'settings.backup':             'Sauvegarde',
  'settings.plugins':            'Plugins',
  'settings.pluginsDesc':        "Étendez l'app en téléchargeant des fichiers .js. Les plugins sont stockés dans votre navigateur.",
  'settings.danger':             'Zone dangereuse',
  'settings.resetSystem':        'Réinitialiser le système',
  'settings.resetSystemDesc':    "Supprimer toutes les données et restaurer l'app à l'état initial",

  'layout.settings': 'Paramètres',
  'layout.about':    'À propos',
  'layout.logout':   'Se déconnecter',

  'quickadd.title':       'Ajouter une transaction',
  'quickadd.templates':   'Modèles',
  'quickadd.noTemplates': 'Aucun modèle enregistré',
  'quickadd.save':        'Enregistrer',
  'quickadd.saving':      'Enregistrement…',
  'quickadd.date':        'Date',
  'quickadd.bankDate':    'Date bancaire',
  'quickadd.type':        'Type',
  'quickadd.account':     'Compte',
}

const DE: Record<string, string> = {
  'lang.name': 'Deutsch',

  'nav.dashboard':    'Dashboard',
  'nav.movements':    'Transaktionen',
  'nav.accounts':     'Konten',
  'nav.annual':       'Jahresfinanzen',
  'nav.charts':       'Diagramme',
  'nav.comparisons':  'Vergleiche',
  'nav.budgets':      'Budgets',
  'nav.investments':  'Investitionen',
  'nav.import':       'Excel importieren',
  'nav.projection':   'Prognose',
  'nav.analysis':     'Analyse',
  'nav.docs':         'Dokumentation',

  'common.save':        'Speichern',
  'common.cancel':      'Abbrechen',
  'common.delete':      'Löschen',
  'common.edit':        'Bearbeiten',
  'common.add':         'Hinzufügen',
  'common.close':       'Schließen',
  'common.loading':     'Laden...',
  'common.confirm':     'Bestätigen',
  'common.error':       'Fehler',
  'common.name':        'Name',
  'common.description': 'Beschreibung',
  'common.date':        'Datum',
  'common.amount':      'Betrag',
  'common.notes':       'Notizen',
  'common.type':        'Typ',
  'common.account':     'Konto',
  'common.filter':      'Filtern',
  'common.search':      'Suchen',
  'common.back':        'Zurück',
  'common.yes':         'Ja',
  'common.no':          'Nein',

  'auth.login':             'Anmelden',
  'auth.register':          'Registrieren',
  'auth.email':             'E-Mail',
  'auth.password':          'Passwort',
  'auth.name':              'Name (optional)',
  'auth.submitLogin':       'Anmelden',
  'auth.submitRegister':    'Konto erstellen',
  'auth.loading':           'Laden...',
  'auth.errorCredentials':  'Falsche E-Mail oder falsches Passwort',
  'auth.errorExists':       'Ein Konto mit dieser E-Mail existiert bereits',
  'auth.errorRegister':     'Fehler beim Erstellen des Kontos',
  'auth.errorLogin':        'Fehler beim Anmelden',
  'auth.footer':            'Lokales Konto · Daten werden auf Ihrem Server gespeichert',
  'auth.chooseLanguage':    'Sprache wählen',

  'movement.expense':  'Ausgabe',
  'movement.income':   'Einnahme',
  'movement.refund':   'Rückerstattung',
  'movement.type':     'Transaktionstyp',
  'movement.bankDate': 'Bankdatum',

  'settings.title':              'Einstellungen',
  'settings.originalConfig':     'Grundkonfiguration',
  'settings.originalConfigDesc': 'Bankkonten und Transaktionstypen. Einmalig beim Start konfigurieren; sie benötigen selten Änderungen.',
  'settings.accounts':           'Konten',
  'settings.movementTypes':      'Transaktionstypen',
  'settings.appearance':         'Darstellung',
  'settings.theme':              'Design',
  'settings.lightMode':          'Heller Modus',
  'settings.darkMode':           'Dunkler Modus',
  'settings.currency':           'Währung',
  'settings.dateFormat':         'Datumsformat',
  'settings.uiSize':             'Schnittstellengröße',
  'settings.language':           'Sprache',
  'settings.languageDesc':       'App-Sprache ändern. Die App wird beim Wechsel neu geladen.',
  'settings.languageCustom':     'Benutzerdefinierte Sprachen',
  'settings.languageInstall':    'Sprache installieren (.js)',
  'settings.languageExample':    'Beispiel',
  'settings.languageGuide':      'KI-Anleitung',
  'settings.noCustomLangs':      'Keine benutzerdefinierten Sprachen installiert.',
  'settings.skins':              'Skins',
  'settings.skinsDesc':          'App vollständig neu gestalten durch Hochladen einer .js-Skin-Datei.',
  'settings.movements':          'Transaktionen',
  'settings.sharedMovements':    'Gemeinsame Transaktionen',
  'settings.navigation':         'Navigation',
  'settings.navigationDesc':     'Wählen Sie, welche Seiten im Menü erscheinen und in welcher Reihenfolge.',
  'settings.dashboard':          'Dashboard',
  'settings.editDashboard':      'Dashboard bearbeiten',
  'settings.editDashboardDesc':  'Widgets hinzufügen, verschieben und skalieren',
  'settings.backup':             'Sicherung',
  'settings.plugins':            'Plugins',
  'settings.pluginsDesc':        'App erweitern durch Hochladen von .js-Dateien. Plugins werden im Browser gespeichert.',
  'settings.danger':             'Gefahrenbereich',
  'settings.resetSystem':        'System zurücksetzen',
  'settings.resetSystemDesc':    'Alle Daten löschen und App auf Ausgangszustand zurücksetzen',

  'layout.settings': 'Einstellungen',
  'layout.about':    'Über',
  'layout.logout':   'Abmelden',

  'quickadd.title':       'Transaktion hinzufügen',
  'quickadd.templates':   'Vorlagen',
  'quickadd.noTemplates': 'Keine Vorlagen gespeichert',
  'quickadd.save':        'Speichern',
  'quickadd.saving':      'Speichern…',
  'quickadd.date':        'Datum',
  'quickadd.bankDate':    'Bankdatum',
  'quickadd.type':        'Typ',
  'quickadd.account':     'Konto',
}

const IT: Record<string, string> = {
  'lang.name': 'Italiano',

  'nav.dashboard':    'Dashboard',
  'nav.movements':    'Movimenti',
  'nav.accounts':     'Conti',
  'nav.annual':       'Finanze annuali',
  'nav.charts':       'Grafici',
  'nav.comparisons':  'Confronti',
  'nav.budgets':      'Budget',
  'nav.investments':  'Investimenti',
  'nav.import':       'Importa Excel',
  'nav.projection':   'Proiezione',
  'nav.analysis':     'Analisi',
  'nav.docs':         'Documentazione',

  'common.save':        'Salva',
  'common.cancel':      'Annulla',
  'common.delete':      'Elimina',
  'common.edit':        'Modifica',
  'common.add':         'Aggiungi',
  'common.close':       'Chiudi',
  'common.loading':     'Caricamento...',
  'common.confirm':     'Conferma',
  'common.error':       'Errore',
  'common.name':        'Nome',
  'common.description': 'Descrizione',
  'common.date':        'Data',
  'common.amount':      'Importo',
  'common.notes':       'Note',
  'common.type':        'Tipo',
  'common.account':     'Conto',
  'common.filter':      'Filtra',
  'common.search':      'Cerca',
  'common.back':        'Indietro',
  'common.yes':         'Sì',
  'common.no':          'No',

  'auth.login':             'Accedi',
  'auth.register':          'Registrati',
  'auth.email':             'Email',
  'auth.password':          'Password',
  'auth.name':              'Nome (facoltativo)',
  'auth.submitLogin':       'Accedi',
  'auth.submitRegister':    'Crea account',
  'auth.loading':           'Caricamento...',
  'auth.errorCredentials':  'Email o password non corretti',
  'auth.errorExists':       'Esiste già un account con questa email',
  'auth.errorRegister':     "Errore nella creazione dell'account",
  'auth.errorLogin':        'Errore di accesso',
  'auth.footer':            'Account locale · i dati vengono salvati sul tuo server',
  'auth.chooseLanguage':    'Scegli la tua lingua',

  'movement.expense':  'Spesa',
  'movement.income':   'Entrata',
  'movement.refund':   'Rimborso',
  'movement.type':     'Tipo di transazione',
  'movement.bankDate': 'Data bancaria',

  'settings.title':              'Impostazioni',
  'settings.originalConfig':     'Configurazione iniziale',
  'settings.originalConfigDesc': 'Conti bancari e tipi di transazione. Configurali una volta all\'inizio; raramente richiedono modifiche.',
  'settings.accounts':           'Conti',
  'settings.movementTypes':      'Tipi di transazione',
  'settings.appearance':         'Aspetto',
  'settings.theme':              'Tema',
  'settings.lightMode':          'Modalità chiara',
  'settings.darkMode':           'Modalità scura',
  'settings.currency':           'Valuta',
  'settings.dateFormat':         'Formato data',
  'settings.uiSize':             'Dimensione interfaccia',
  'settings.language':           'Lingua',
  'settings.languageDesc':       "Cambia la lingua dell'app. L'app si ricaricherà al cambio.",
  'settings.languageCustom':     'Lingue personalizzate',
  'settings.languageInstall':    'Installa lingua (.js)',
  'settings.languageExample':    'Esempio',
  'settings.languageGuide':      'Guida IA',
  'settings.noCustomLangs':      'Nessuna lingua personalizzata installata.',
  'settings.skins':              'Skin',
  'settings.skinsDesc':          "Cambia completamente l'aspetto dell'app caricando un file .js di skin.",
  'settings.movements':          'Movimenti',
  'settings.sharedMovements':    'Transazioni condivise',
  'settings.navigation':         'Navigazione',
  'settings.navigationDesc':     'Scegli quali pagine appaiono nel menu e in quale ordine.',
  'settings.dashboard':          'Dashboard',
  'settings.editDashboard':      'Modifica Dashboard',
  'settings.editDashboardDesc':  'Aggiungere, spostare e ridimensionare widget',
  'settings.backup':             'Backup',
  'settings.plugins':            'Plugin',
  'settings.pluginsDesc':        "Estendi l'app caricando file .js. I plugin vengono salvati nel browser.",
  'settings.danger':             'Zona pericolosa',
  'settings.resetSystem':        'Ripristina sistema',
  'settings.resetSystemDesc':    "Elimina tutti i dati e ripristina l'app allo stato iniziale",

  'layout.settings': 'Impostazioni',
  'layout.about':    'Informazioni',
  'layout.logout':   'Esci',

  'quickadd.title':       'Aggiungi movimento',
  'quickadd.templates':   'Modelli',
  'quickadd.noTemplates': 'Nessun modello salvato',
  'quickadd.save':        'Salva',
  'quickadd.saving':      'Salvataggio…',
  'quickadd.date':        'Data',
  'quickadd.bankDate':    'Data bancaria',
  'quickadd.type':        'Tipo',
  'quickadd.account':     'Conto',
}

// ── Built-in language registry ─────────────────────────────────────────────────

export interface BuiltInLang {
  id: string
  name: string
  flag: string
}

export const BUILT_IN_LANGS: BuiltInLang[] = [
  { id: 'es', name: 'Español',  flag: '🇪🇸' },
  { id: 'en', name: 'English',  flag: '🇬🇧' },
  { id: 'fr', name: 'Français', flag: '🇫🇷' },
  { id: 'de', name: 'Deutsch',  flag: '🇩🇪' },
  { id: 'it', name: 'Italiano', flag: '🇮🇹' },
]

const BUILT_IN_MAP: Record<string, Record<string, string>> = { es: ES, en: EN, fr: FR, de: DE, it: IT }

// ── Custom language storage ────────────────────────────────────────────────────

export interface CustomLanguage {
  id: string
  name: string
  flag?: string
  author?: string
  version?: string
  translations: Record<string, string>
  source: string
}

const LANG_KEY         = 'app-language'
const CUSTOM_LANGS_KEY = 'app-custom-languages'

export function loadCustomLanguages(): CustomLanguage[] {
  try {
    const s = localStorage.getItem(CUSTOM_LANGS_KEY)
    return s ? JSON.parse(s) : []
  } catch { return [] }
}

export function saveCustomLanguages(langs: CustomLanguage[]): void {
  localStorage.setItem(CUSTOM_LANGS_KEY, JSON.stringify(langs))
}

export async function parseLanguageFile(file: File): Promise<Omit<CustomLanguage, 'id'>> {
  const source = await file.text()
  const blob = new Blob([source], { type: 'text/javascript' })
  const url = URL.createObjectURL(blob)
  try {
    const mod = await import(/* @vite-ignore */ url)
    const def = mod.default
    if (!def || typeof def !== 'object') throw new Error('El archivo no exporta un objeto por defecto válido')
    if (typeof def.name !== 'string' || !def.name.trim()) throw new Error('El idioma necesita un campo "name"')
    const META = new Set(['name', 'flag', 'author', 'version'])
    const translations: Record<string, string> = {}
    for (const [k, v] of Object.entries(def)) {
      if (!META.has(k) && typeof v === 'string') translations[k] = v
    }
    if (Object.keys(translations).length === 0) throw new Error('El archivo no contiene traducciones')
    return { name: def.name, flag: def.flag, author: def.author, version: def.version, translations, source }
  } finally {
    URL.revokeObjectURL(url)
  }
}

// ── Active language ────────────────────────────────────────────────────────────

export function getLanguage(): string {
  return localStorage.getItem(LANG_KEY) ?? 'es'
}

export function setLanguage(id: string): void {
  localStorage.setItem(LANG_KEY, id)
  window.location.reload()
}

function resolveTranslations(): Record<string, string> {
  const lang = getLanguage()
  if (BUILT_IN_MAP[lang]) return BUILT_IN_MAP[lang]
  const custom = loadCustomLanguages().find(l => l.id === lang)
  if (custom) return { ...ES, ...custom.translations }
  return ES
}

// Module-level: resolved once at import time (page reload on language change)
const _tr = resolveTranslations()

export function t(key: string): string {
  return _tr[key] ?? ES[key] ?? key
}

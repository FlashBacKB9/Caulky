# Guía de desarrollo de plugins para Caulky

> **Para la IA que lea esto:** este documento te da toda la información necesaria para generar plugins .js para Caulky. El usuario te pedirá que crees un plugin que haga X; con esta guía puedes producir código completo y listo para instalar.

---

## Qué es un plugin

Un plugin es un archivo `.js` que Caulky carga y ejecuta en el navegador cuando el usuario lo instala desde Configuración → Plugins.
Se ejecuta en el contexto de la página (tiene acceso completo a `document`, `window`, `localStorage`, etc.).
Los plugins se guardan en `localStorage` del navegador y se re-ejecutan en cada carga de página.

---

## Estructura de un plugin

```js
// ==Plugin==
// @name        Nombre del plugin
// @description Descripción breve de qué hace
// @version     1.0
// ==/Plugin==

// Tu código aquí — se ejecuta al activar/cargar el plugin

// Función de limpieza (OBLIGATORIA si modificas el DOM o añades estilos)
// Se llama automáticamente al desactivar o eliminar el plugin
function __cleanup() {
  // deshaz todo lo que hiciste arriba
}
```

### Reglas del formato

- El bloque `// ==Plugin== ... // ==/Plugin==` es el encabezado de metadatos. Es obligatorio.
- Los campos reconocidos son `@name`, `@description` y `@version`.
- `__cleanup` es la función especial de limpieza. Debe llamarse exactamente así.
- El código se ejecuta con `new Function(code)()` — es una función anónima, no un módulo ES.
- No uses `import` / `export`. No uses `crypto.randomUUID()` (requiere HTTPS; usa `Math.random()`).
- Usa IDs únicos para todos los elementos DOM que inyectes (prefijo `__plugin_nombrePlugin_`).

---

## APIs disponibles

| API | Disponible | Notas |
|-----|-----------|-------|
| `document` | ✅ | Manipulación completa del DOM |
| `window` | ✅ | Variables globales, eventos |
| `localStorage` | ✅ | Para persistir configuración del plugin |
| `sessionStorage` | ✅ | Datos temporales de sesión |
| `fetch` | ✅ | Peticiones HTTP externas |
| `MutationObserver` | ✅ | Detectar cambios en el DOM |
| `setInterval` / `setTimeout` | ✅ | Temporizadores (limpia en __cleanup) |
| `crypto.randomUUID()` | ❌ | Solo funciona en HTTPS — usa `Math.random()` |
| ES modules (`import`) | ❌ | El entorno no es un módulo |

Para generar IDs únicos sin `crypto.randomUUID()`:
```js
const uid = () => Math.random().toString(36).slice(2)
```

---

## Dark mode

La app aplica dark mode añadiendo la clase `dark` al elemento `<html>`.

```js
const isDark = () => document.documentElement.classList.contains('dark')

// Escuchar cambios de tema en tiempo real
const observer = new MutationObserver(() => {
  const dark = isDark()
  // actualizar tu UI según el tema
})
observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })

function __cleanup() {
  observer.disconnect()
}
```

En CSS inyectado en un plugin:
```css
:root { --mi-color: #ffffff; }
html.dark { --mi-color: #111111; }
```

---

## Design system de la app (Tailwind CSS v4)

La app usa **Tailwind CSS v4**. Puedes usar cualquier clase de Tailwind en el HTML que inyectes.

### Colores

| Uso | Light | Dark |
|-----|-------|------|
| Fondo página | `bg-gray-50` | `bg-gray-950` |
| Fondo tarjeta | `bg-white` | `bg-gray-900` |
| Borde tarjeta | `border-gray-100` | `border-gray-800` |
| Texto principal | `text-gray-800` | `text-white` |
| Texto secundario | `text-gray-500` | `text-gray-400` |
| Texto muted | `text-gray-400` | `text-gray-500` |
| Acento azul | `text-blue-500` | igual |
| Peligro | `text-red-500` | igual |

### Clases de tarjeta estándar
```
bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 shadow-sm
```

### Botón primario
```
px-3 py-1.5 text-xs font-medium rounded-lg bg-gray-900 dark:bg-white text-white dark:text-gray-900
hover:bg-gray-700 dark:hover:bg-gray-100 transition-colors
```

### Botón secundario
```
px-3 py-1.5 text-xs rounded-lg border border-gray-200 dark:border-gray-700
bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-300
hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors
```

### Input de texto
```
w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700
bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm
outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition
```

---

## Estructura del DOM de la app

```
#root
  div.flex.h-full               ← layout principal
    aside.w-56                  ← sidebar fijo (menú lateral)
    div.flex-col.flex-1
      header.md:hidden          ← cabecera móvil (hamburger + logo)
      main.flex-1.overflow-y-auto
        div.p-3.md:p-6          ← contenido de cada página
```

### Páginas y sus rutas

| Ruta | Página |
|------|--------|
| `/` | Dashboard |
| `/movements` | Movimientos |
| `/cuentas` | Cuentas |
| `/annual` | Finanzas del Año |
| `/charts` | Gráficos |
| `/comparaciones` | Comparaciones |
| `/budgets` | Presupuestos |
| `/inversiones` | Inversiones |
| `/import` | Importar Excel |
| `/settings` | Configuración |
| `/docs` | Documentación |

### Detectar la página actual y escuchar navegación

```js
const currentPath = () => window.location.pathname

// La app usa React Router (history API). Para detectar cambios de ruta:
const origPush = history.pushState.bind(history)
const origReplace = history.replaceState.bind(history)

const onNav = () => {
  // se llama en cada cambio de página
  const path = currentPath()
  if (path === '/settings') injectIntoSettings()
}

history.pushState = (...args) => { origPush(...args); onNav() }
history.replaceState = (...args) => { origReplace(...args); onNav() }
window.addEventListener('popstate', onNav)

function __cleanup() {
  history.pushState = origPush
  history.replaceState = origReplace
  window.removeEventListener('popstate', onNav)
}
```

### Secciones de la página de Configuración (/settings)

La página `/settings` tiene `<h2>` con los títulos de cada sección (en mayúsculas por CSS).
Secciones actuales: `Apariencia`, `Navegación`, `Dashboard`, `Cuentas`, `Tipos de movimiento y Grupos`, `Copia de seguridad`, `Plugins`, `Zona de peligro`.

```js
// Encontrar una sección por su título
function findSection(title) {
  return [...document.querySelectorAll('h2')]
    .find(h => h.textContent.trim().toLowerCase() === title.toLowerCase())
    ?.closest('.space-y-3')
}

// Inyectar una tarjeta en la sección Plugins
function injectIntoSettings() {
  if (document.getElementById('__plugin_miPlugin_card')) return
  const section = findSection('Plugins')
  if (!section) return

  const card = document.createElement('div')
  card.id = '__plugin_miPlugin_card'
  card.className = 'bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 px-4 py-3'
  card.innerHTML = `<p class="text-sm text-gray-700 dark:text-gray-200">Mi plugin está activo</p>`
  section.appendChild(card)
}
```

---

## localStorage — persistencia de datos del plugin

Usa un prefijo único para evitar colisiones con la app o con otros plugins.

```js
const STORE_KEY = '__plugin_miPlugin__'

// Guardar
const save = (data) => localStorage.setItem(STORE_KEY, JSON.stringify(data))

// Leer (con valor por defecto)
const load = () => JSON.parse(localStorage.getItem(STORE_KEY) ?? '{}')

// Eliminar (hazlo en __cleanup si los datos son temporales)
// localStorage.removeItem(STORE_KEY)
```

---

## Inyectar estilos CSS

```js
const style = document.createElement('style')
style.id = '__plugin_miPlugin_style'
style.textContent = `
  body { font-family: 'Georgia', serif !important; }
`
document.head.appendChild(style)

function __cleanup() {
  document.getElementById('__plugin_miPlugin_style')?.remove()
}
```

### Cargar una fuente de Google Fonts

```js
const link = document.createElement('link')
link.id = '__plugin_miPlugin_font'
link.rel = 'stylesheet'
link.href = 'https://fonts.googleapis.com/css2?family=Nunito:wght@400;500;600;700&display=swap'
document.head.appendChild(link)

const style = document.createElement('style')
style.id = '__plugin_miPlugin_style'
style.textContent = `body, input, button { font-family: 'Nunito', sans-serif !important; }`
document.head.appendChild(style)

function __cleanup() {
  document.getElementById('__plugin_miPlugin_font')?.remove()
  document.getElementById('__plugin_miPlugin_style')?.remove()
}
```

---

## Panel flotante (patrón recomendado para UI de plugin)

Si tu plugin necesita una interfaz de usuario, usa un panel flotante. Es el patrón más sencillo y fiable.

```js
const PREFIX = '__plugin_miPlugin'

// Botón flotante
const btn = document.createElement('button')
btn.id = `${PREFIX}_btn`
btn.textContent = '⚙'
btn.style.cssText = `
  position: fixed; bottom: 20px; right: 20px; z-index: 9999;
  width: 40px; height: 40px; border-radius: 50%;
  background: #3b82f6; color: white; border: none;
  font-size: 18px; cursor: pointer;
  box-shadow: 0 2px 8px rgba(0,0,0,0.2);
`
document.body.appendChild(btn)

// Panel
const panel = document.createElement('div')
panel.id = `${PREFIX}_panel`
panel.style.cssText = `
  display: none; position: fixed; bottom: 70px; right: 20px; z-index: 9998;
  width: 280px; background: white; border-radius: 12px;
  box-shadow: 0 8px 24px rgba(0,0,0,0.15); padding: 16px;
  border: 1px solid #e5e7eb;
`
panel.innerHTML = `<p style="margin:0;font-size:14px;color:#374151;">Contenido del panel</p>`
document.body.appendChild(panel)

// Lógica abrir/cerrar
let open = false
btn.addEventListener('click', () => {
  open = !open
  panel.style.display = open ? 'block' : 'none'
})
document.addEventListener('click', e => {
  if (!btn.contains(e.target) && !panel.contains(e.target)) {
    open = false
    panel.style.display = 'none'
  }
})

function __cleanup() {
  document.getElementById(`${PREFIX}_btn`)?.remove()
  document.getElementById(`${PREFIX}_panel`)?.remove()
}
```

---

## Acceso a la API del backend

El backend de Caulky usa cookies httpOnly para autenticación. Las cookies se envían automáticamente con `fetch` si incluyes `credentials: 'include'`.

```js
// Leer movimientos del usuario actual
fetch('/api/movements', { credentials: 'include' })
  .then(r => r.json())
  .then(data => console.log(data))

// Las rutas principales de la API:
// GET  /api/movements          — lista de movimientos
// GET  /api/accounts/summary   — resumen de cuentas con saldos
// GET  /api/movement-types     — tipos de movimiento
// GET  /api/groups             — grupos
// GET  /api/budgets            — presupuestos
```

---

## Ejemplo completo — plugin mínimo

```js
// ==Plugin==
// @name        Fondo de color
// @description Cambia el color de fondo de la app a un tono suave
// @version     1.0
// ==/Plugin==

const style = document.createElement('style')
style.id = '__plugin_fondoColor_style'
style.textContent = `
  .bg-gray-50 { background-color: #fdf4ff !important; }
  html.dark .bg-gray-950 { background-color: #1a0a2e !important; }
`
document.head.appendChild(style)

function __cleanup() {
  document.getElementById('__plugin_fondoColor_style')?.remove()
}
```

---

## Ejemplo completo — plugin con panel flotante y persistencia

```js
// ==Plugin==
// @name        Nota rápida
// @description Panel flotante para escribir una nota que persiste entre sesiones
// @version     1.0
// ==/Plugin==

const KEY = '__plugin_notaRapida__'
const PREFIX = '__plugin_notaRapida'

const saved = localStorage.getItem(KEY) ?? ''

const btn = document.createElement('button')
btn.id = `${PREFIX}_btn`
btn.textContent = '📝'
btn.style.cssText = `
  position:fixed;bottom:20px;right:20px;z-index:9999;
  width:40px;height:40px;border-radius:50%;
  background:#374151;color:white;border:none;
  font-size:18px;cursor:pointer;
  box-shadow:0 2px 8px rgba(0,0,0,0.25);
`
document.body.appendChild(btn)

const panel = document.createElement('div')
panel.id = `${PREFIX}_panel`
panel.style.cssText = `
  display:none;position:fixed;bottom:70px;right:20px;z-index:9998;
  width:260px;background:white;border-radius:12px;
  box-shadow:0 8px 24px rgba(0,0,0,0.15);padding:12px;
  border:1px solid #e5e7eb;
`
panel.innerHTML = `
  <p style="margin:0 0 8px;font-size:11px;font-weight:600;color:#9ca3af;text-transform:uppercase;letter-spacing:0.05em;">Nota rápida</p>
  <textarea id="${PREFIX}_ta" style="width:100%;height:100px;border:1px solid #e5e7eb;border-radius:8px;padding:8px;font-size:13px;color:#374151;resize:vertical;outline:none;font-family:inherit;box-sizing:border-box;" placeholder="Escribe aquí...">${saved}</textarea>
`
document.body.appendChild(panel)

const ta = document.getElementById(`${PREFIX}_ta`)
ta.addEventListener('input', () => localStorage.setItem(KEY, ta.value))

let open = false
btn.addEventListener('click', () => {
  open = !open
  panel.style.display = open ? 'block' : 'none'
  if (open) ta.focus()
})
document.addEventListener('click', e => {
  if (!btn.contains(e.target) && !panel.contains(e.target)) {
    open = false; panel.style.display = 'none'
  }
})

function __cleanup() {
  document.getElementById(`${PREFIX}_btn`)?.remove()
  document.getElementById(`${PREFIX}_panel`)?.remove()
}
```

---

## Lo que NO puede hacer un plugin

- Usar `import` / `export` — no es un módulo ES
- Usar `crypto.randomUUID()` en HTTP — usa `Math.random()`
- Modificar el estado de React directamente — solo puede interactuar con el DOM
- Persistir datos entre usuarios distintos — `localStorage` es por navegador/perfil
- Ejecutar código del lado del servidor

# Guía de desarrollo de plugins para Caulky

## Qué es un plugin

Un plugin es un archivo `.js` que Caulky carga y ejecuta en el navegador cuando el usuario lo instala.
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

// Tu código aquí — se ejecuta al activar el plugin

// Función de limpieza (OBLIGATORIA si modificas el DOM o añades estilos)
// Se llama automáticamente al desactivar o eliminar el plugin
function __cleanup() {
  // deshacer todo lo que hiciste arriba
}
```

### Reglas del formato

- El bloque `// ==Plugin== ... // ==/Plugin==` es el encabezado de metadatos.
- Los campos reconocidos son `@name`, `@description` y `@version`.
- `__cleanup` es la función especial de limpieza. Debe llamarse exactamente así.
- El código se ejecuta con `new Function(code)()` — es una función anónima, no un módulo ES.
- No uses `import` / `export`. No uses `crypto.randomUUID()` (requiere HTTPS).
- Usa `Math.random()` para generar IDs si los necesitas.

---

## APIs disponibles

El plugin tiene acceso completo al navegador estándar:

| API | Disponible | Notas |
|-----|-----------|-------|
| `document` | ✅ | Manipulación completa del DOM |
| `window` | ✅ | Variables globales, eventos |
| `localStorage` | ✅ | Para persistir datos del plugin |
| `sessionStorage` | ✅ | Datos temporales de sesión |
| `fetch` | ✅ | Peticiones HTTP |
| `MutationObserver` | ✅ | Detectar cambios en el DOM |
| `crypto.randomUUID()` | ❌ | Solo funciona en HTTPS |
| ES modules (`import`) | ❌ | El entorno no es un módulo |

---

## Dark mode

La app aplica dark mode añadiendo la clase `dark` al elemento `<html>`.

```js
const isDark = document.documentElement.classList.contains('dark')

// Escuchar cambios de tema
const observer = new MutationObserver(() => {
  const dark = document.documentElement.classList.contains('dark')
  // actualizar tu UI
})
observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
```

En CSS dentro de un plugin, puedes usar:
```css
:root { --my-color: #fff; }
html.dark { --my-color: #111; }
```

---

## Design system de la app (Tailwind CSS v4)

La app usa **Tailwind CSS v4**. Puedes usar cualquier clase de Tailwind en el HTML que inyectes.

### Colores principales

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
bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800
```

### Clases de botón primario

```
px-3 py-1.5 text-xs font-medium rounded-lg bg-gray-900 dark:bg-white text-white dark:text-gray-900
hover:bg-gray-700 dark:hover:bg-gray-100 transition-colors
```

### Clases de botón secundario

```
px-3 py-1.5 text-xs rounded-lg border border-gray-200 dark:border-gray-700
bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-300
hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors
```

### Clases de input de texto

```
w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700
bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm
outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition
```

---

## Estructura del DOM de la app

```
#root
  div.flex.h-full          ← layout principal
    aside                  ← sidebar (w-56)
    main.flex-1            ← contenido (overflow-y-auto)
      div.p-6              ← contenido de cada página
```

### Detectar la página actual

```js
// Por URL
const isSettings = window.location.pathname === '/settings'
const isDashboard = window.location.pathname === '/'

// Escuchar navegación (SPA — React Router)
const onNav = () => { /* se llama en cada cambio de ruta */ }
window.addEventListener('popstate', onNav)
// Para pushState/replaceState (React Router no usa popstate):
const origPush = history.pushState.bind(history)
history.pushState = (...args) => { origPush(...args); onNav() }
```

### Inyectar en la página de Settings

La página `/settings` tiene `<h2>` con los títulos de sección (texto original, CSS hace el uppercase).
Títulos existentes: `Apariencia`, `Navegación`, `Dashboard`, `Copia de seguridad`, `Plugins`, `Zona de peligro`, `Cuentas`, `Tipos de movimiento`.

```js
function injectIntoSettings() {
  if (document.getElementById('__mi_plugin_card')) return

  // Encontrar la sección "Plugins"
  const heading = [...document.querySelectorAll('h2')]
    .find(h => h.textContent.trim() === 'Plugins')
  if (!heading) return

  const section = heading.closest('.space-y-3')
  if (!section) return

  const card = document.createElement('div')
  card.id = '__mi_plugin_card'
  card.className = 'bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 px-4 py-3'
  card.innerHTML = `<p class="text-sm text-gray-700 dark:text-gray-200">Mi plugin</p>`
  section.appendChild(card)
}
```

---

## localStorage — persistencia de datos del plugin

Usa un prefijo único para evitar colisiones con la app o con otros plugins.

```js
const KEY = '__plugin_mi_plugin__'

// Guardar
localStorage.setItem(KEY, JSON.stringify({ valor: 42 }))

// Leer
const data = JSON.parse(localStorage.getItem(KEY) ?? '{}')

// Eliminar (hazlo en __cleanup)
localStorage.removeItem(KEY)
```

---

## Inyectar estilos CSS

```js
const style = document.createElement('style')
style.id = '__mi_plugin_style'
style.textContent = `
  body { font-family: 'Georgia', serif !important; }
`
document.head.appendChild(style)

function __cleanup() {
  document.getElementById('__mi_plugin_style')?.remove()
}
```

### Cargar una fuente de Google Fonts

```js
const link = document.createElement('link')
link.id = '__mi_plugin_font'
link.rel = 'stylesheet'
link.href = 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap'
document.head.appendChild(link)

function __cleanup() {
  document.getElementById('__mi_plugin_font')?.remove()
}
```

---

## Panel flotante (patrón recomendado para UI de plugin)

Si tu plugin necesita una interfaz de usuario, el patrón más sencillo y fiable es un panel flotante:

```js
const btn = document.createElement('button')
btn.id = '__mi_plugin_btn'
btn.textContent = '⚙'
btn.style.cssText = `
  position: fixed; bottom: 20px; right: 20px; z-index: 9999;
  width: 40px; height: 40px; border-radius: 50%;
  background: #3b82f6; color: white; border: none;
  font-size: 18px; cursor: pointer;
  box-shadow: 0 2px 8px rgba(0,0,0,0.2);
`
document.body.appendChild(btn)

const panel = document.createElement('div')
panel.id = '__mi_plugin_panel'
panel.style.cssText = `
  display: none; position: fixed; bottom: 70px; right: 20px; z-index: 9998;
  width: 280px; background: white; border-radius: 12px;
  box-shadow: 0 8px 24px rgba(0,0,0,0.15); padding: 16px;
  border: 1px solid #e5e7eb;
`
panel.innerHTML = `<p style="margin:0;font-size:14px;">Contenido del panel</p>`
document.body.appendChild(panel)

let open = false
btn.addEventListener('click', () => {
  open = !open
  panel.style.display = open ? 'block' : 'none'
})
document.addEventListener('click', e => {
  if (!btn.contains(e.target) && !panel.contains(e.target)) {
    open = false; panel.style.display = 'none'
  }
})

function __cleanup() {
  document.getElementById('__mi_plugin_btn')?.remove()
  document.getElementById('__mi_plugin_panel')?.remove()
}
```

---

## Ejemplo completo — plugin mínimo

```js
// ==Plugin==
// @name        Fondo de color
// @description Cambia el color de fondo de la app
// @version     1.0
// ==/Plugin==

const style = document.createElement('style')
style.id = '__plugin_bg'
style.textContent = `
  .bg-gray-50 { background-color: #fdf4ff !important; }
`
document.head.appendChild(style)

function __cleanup() {
  document.getElementById('__plugin_bg')?.remove()
}
```

---

## Lo que NO puede hacer un plugin

- Acceder al backend directamente sin autenticación (las cookies son httpOnly)
- Usar `import` / `export` (no es un módulo ES)
- Persistir datos entre usuarios (localStorage es por navegador)
- Usar `crypto.randomUUID()` en HTTP (usa `Math.random()` en su lugar)
- Modificar el estado de React directamente (solo puede interactuar con el DOM)

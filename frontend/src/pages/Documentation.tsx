import { Download } from 'lucide-react'

// ── Markdown content for download ─────────────────────────────────────────────

const MD = `# Caulky — Guía completa para uso con IA

> Este documento está diseñado para que una IA pueda entender completamente el sistema Caulky y ayudar a cualquier usuario a sacarle el máximo partido. Incluye todos los conceptos, flujos de trabajo y ejemplos de uso.

---

## 0. Cómo usar este documento con una IA

Descarga este archivo .md desde la página de Documentación de Caulky y adjúntalo al inicio de una conversación con una IA (ChatGPT, Claude, Gemini, etc.). A partir de ese momento, la IA conocerá el sistema en profundidad y podrá responderte preguntas como:

- "Quiero crear un movimiento que se repita todos los lunes"
- "¿Cómo añado un nuevo tipo de gasto?"
- "¿Cómo configuro el seguimiento de mis inversiones en fondos?"
- "Quiero ver cuánto gasto en alimentación cada mes en un gráfico"
- "¿Cómo exporto todos mis datos?"

---

## 1. Introducción

Caulky es una aplicación web de finanzas personales. Funciona con un backend FastAPI (Python) + PostgreSQL y un frontend React + TypeScript. La interfaz está completamente en español.

Caulky permite:
- Registrar y categorizar cualquier transacción de dinero (gastos, ingresos, transferencias, ahorros)
- Ver las finanzas en distintos formatos: tabla, calendario mensual, resumen anual, gráficos personalizables
- Gestionar presupuestos por categoría con historial de periodos
- Hacer seguimiento de inversiones en fondos de inversión con precios de Yahoo Finance
- Crear plantillas de movimientos y programar recurrencias (diaria, semanal, mensual)
- Importar datos desde hojas de cálculo Excel
- Gestionar varias cuentas bancarias con saldos automáticos
- Exportar e importar copias de seguridad completas

---

## 2. Conceptos clave

### Movimientos

Un movimiento es cualquier transacción de dinero. Es la entidad central de Caulky.

Campos:
- Nombre: descripción libre del movimiento (ej. "Mercadona", "Nómina Mayo")
- Importe (money): cantidad en euros. Positivo = ingreso, Negativo = gasto
- Fecha (date): fecha del movimiento según el usuario
- Fecha banco (bank_date): fecha en que el banco lo procesa. Opcional
- Tipo (movement_type_id): categoría del movimiento (ej. "Supermercado", "Nómina")
- Cuenta (account_id): cuenta bancaria asociada
- Pagado (paid): si el movimiento está confirmado/liquidado
- No contar (no_count): excluye el movimiento de estadísticas, gráficos, presupuestos e inversiones
- Notas: texto libre adicional
- Archivos adjuntos: documentos o imágenes asociados (facturas, justificantes)

### Tipos de movimiento

Categorías para clasificar movimientos. Cada tipo tiene:
- Nombre y color
- Grupo al que pertenece
- Cuenta vinculada (opcional): los movimientos de ese tipo afectan al saldo de esa cuenta

### Grupos

Agrupaciones de tipos de movimiento (ej. "Alimentación", "Transporte", "Ingresos"). Se usan en la vista anual, en gráficos (desglose por grupo) y en la vista Kanban.

### Cuentas

Cuentas bancarias o bolsillos. Tienen nombre, color, icono y saldo inicial.
Saldo actual = Saldo inicial + suma de movimientos pagados asociados a esa cuenta.

### Presupuestos

Límites de gasto configurables. Se vinculan a tipos de movimiento y tienen un periodo (mensual, semanal, anual, personalizado). Admiten versiones de importe: puedes cambiar el límite en distintas fechas sin perder el historial.

### Plantillas de movimiento

Movimientos preconfigurados para crearlos rápidamente. El nombre puede incluir variables dinámicas:
- {mes}: mes actual del sistema (ej. "Mayo")
- {año}: año actual
- {mesfecha}: mes de la fecha del movimiento
- {mesfechabanco}: mes de la fecha banco

### Recurrencias

Se configuran sobre una plantilla. Tipos:
- Diaria: cada N días
- Semanal: los días de la semana seleccionados (ej. todos los lunes)
- Mensual por día: el día X de cada N meses (ej. el día 5 de cada mes)
- Mensual por semana: el Nth día_de_semana del mes (ej. el primer lunes, el último viernes)

Modos de creación:
- Creación masiva: el usuario elige cuántas ocurrencias crear de golpe
- Auto-crear: Caulky crea automáticamente los movimientos pendientes cada vez que abres la app

### Fondos de inversión

Fondos vinculados a un tipo de movimiento. Las compras = movimientos de ese tipo.
Con el ticker de Yahoo Finance se obtienen precios actuales e históricos automáticamente.

---

## 3. Flujos de trabajo paso a paso

### 3.1 Añadir un movimiento

1. Ir a Movimientos → clic en "+ Nuevo"
2. Rellenar nombre, importe (negativo para gastos), fecha, tipo y cuenta
3. Marcar Pagado si ya está confirmado
4. No contar: marcar si no quieres que cuente en estadísticas (gastos futuros que pueden no ocurrir, etc.)
5. Opcionalmente añadir notas y archivos adjuntos
6. Tres botones en la parte inferior:
   - "Cancelar": cierra sin guardar
   - "Crear varios": crea el mismo movimiento en múltiples fechas (ver 3.1.1)
   - "Guardar": crea el movimiento único

### 3.1.1 Crear varios movimientos de golpe ("Crear varios")

Desde el formulario de nuevo movimiento, el botón "Crear varios" permite crear múltiples copias del mismo movimiento distribuidas según una regla de fechas. Útil para financiaciones a plazos, pagos escalonados, etc.

1. Rellenar el formulario de nuevo movimiento (nombre, importe, tipo, etc.)
2. Clic en "Crear varios" (botón entre Cancelar y Guardar)
3. Elegir el tipo de repetición: Diario, Semanal, Mensual por día, Mensual por semana
4. Configurar la fecha del primer movimiento
5. Indicar cuántos movimientos crear en total
6. Opcionalmente activar "Numerar pagos en el nombre" → añade "1/N", "2/N"... al nombre de cada movimiento
7. Vista previa muestra los primeros movimientos con sus fechas y nombres
8. Clic en "Crear N movimientos"

Ejemplo: financiación de 500€ en 5 pagos mensuales el día 15
→ Nombre: "Financiación TV" · Importe: -100 · Tipo de repetición: Mensual (día) · Día: 15 · Cantidad: 5 · Numerar pagos: activado
→ Crea "Financiación TV 1/5" el 15 de enero, "Financiación TV 2/5" el 15 de febrero, etc.

Diferencia con las recurrencias de plantillas:
- "Crear varios" es un proceso puntual desde el formulario, sin necesidad de guardar plantilla.
- Las recurrencias de plantillas son para gastos que se repiten indefinidamente (o de forma recurrente a largo plazo).

### 3.2 Crear una plantilla

1. Movimientos → "+ Nuevo" → icono de plantillas (arriba a la derecha)
2. Clic en "+ Nueva plantilla"
3. Rellenar: etiqueta (nombre corto), importe, tipo, etc.
4. El nombre puede incluir {mes} para insertar el mes actual automáticamente
5. Guardar

### 3.3 Configurar una recurrencia (ej. todos los lunes)

1. Crear la plantilla (ver 3.2)
2. En la lista de plantillas, clic en el icono de calendario de esa plantilla
3. Elegir tipo: Semanal → marcar el día Lunes
4. Establecer la fecha de inicio
5. Elegir modo: Auto-crear (automático al abrir la app) o Creación masiva (N ocurrencias de golpe)
6. Guardar

Ejemplo: alquiler el día 5 de cada mes
→ Tipo: Mensual (día) → día 5, cada 1 mes → Auto-crear

Ejemplo: el primer viernes de cada mes
→ Tipo: Mensual (semana) → "el primer Viernes de cada mes"

### 3.4 Editar un movimiento

Edición inline: clic en cualquier celda de la tabla (excepto el nombre) → edita ese campo directamente.
Modal completo: clic en el nombre del movimiento → edita todos los campos, adjunta archivos, duplica o elimina.
Menú contextual: clic derecho en cualquier movimiento → Duplicar o Eliminar.

### 3.5 Edición masiva (varios movimientos a la vez)

1. Activar checkboxes de las filas a editar (o el del encabezado para seleccionar todos)
2. Barra de acciones → "Modificar campo"
3. Elegir el campo: Nombre, Importe, Tipo, Cuenta, Fecha, Pagado, No contar, Notas
4. Introducir el valor y "Aplicar"

Ejemplo: marcar como pagados todos los movimientos de enero
→ Filtrar enero → seleccionar todos → Modificar campo → Pagado → Sí → Aplicar

### 3.6 Crear un tipo de movimiento

1. Configuración → "Tipos de movimiento y Grupos"
2. Clic en "+ Nuevo tipo"
3. Nombre, color, grupo, y opcionalmente cuenta vinculada
4. Guardar

Para crear un grupo: mismo apartado → "+ Nuevo grupo" → nombre → guardar.

### 3.7 Crear una cuenta bancaria

1. Configuración → "Cuentas"
2. Clic en "+ Nueva cuenta"
3. Nombre, color, icono, saldo inicial (el saldo que tenía cuando empezaste a usarla en Caulky)
4. Guardar

### 3.8 Configurar un fondo de inversión

1. Crear un tipo de movimiento para las compras del fondo (ej. "Compra MSCI World")
2. Ir a Inversiones → "+ Nuevo fondo"
3. Nombre, ticker de Yahoo Finance (ej. "0P0000XMVJ.F", "IWDA.AS"), vincular al tipo del paso 1
4. Guardar
5. Cada aportación = un movimiento con ese tipo (importe negativo)
6. En la lista de compras, botón "Obtener" → busca el precio histórico en Yahoo Finance
7. Botón de refresco del fondo → actualiza el precio actual

Requisitos para que una compra aparezca:
- Movimiento marcado como Pagado
- Sin No contar activo
- Fecha banco no puede ser futura

### 3.9 Crear un gráfico personalizado

1. Gráficos → "+ Añadir gráfico"
2. Configurar título, tipo (Columnas, Apilado, Líneas, Área, Donut, Mixto)
3. Eje X: Mes, Año, o Ninguno
4. Desglose por: Ninguno, Grupo, Tipo, Cuenta
5. Signo: Todos, Solo gastos, Solo ingresos
6. Métrica: Suma de importes o Número de movimientos
7. Filtros avanzados opcionales

Ejemplo: gasto mensual en supermercado
→ Tipo: Columnas, Eje X: Mes, Desglose: Ninguno, Signo: Solo gastos, Filtro: Tipo = "Supermercado"

Ejemplo: gastos por categoría cada mes
→ Tipo: Apilado, Eje X: Mes, Desglose: Grupo, Signo: Solo gastos

### 3.10 Crear un presupuesto

1. Presupuestos → "+ Nuevo presupuesto"
2. Nombre, tipos de movimiento vinculados, periodo, importe límite
3. Para cambiar el importe sin perder historial: abrir presupuesto → "Nueva versión" → nuevo importe y fecha desde cuándo aplica

### 3.11 Importar desde Excel

1. Importar Excel → subir fichero
2. Mapear columnas del Excel a campos de Caulky (fecha, nombre, importe, tipo...)
3. Mapear categorías del Excel a tipos de movimiento de Caulky
4. Previsualizar → simular → importar

---

## 4. Vistas de Movimientos

### Vista Tabla
- Columnas configurables (mostrar/ocultar, reordenar, redimensionar)
- Filtros avanzados: rango de fechas, importe, tipo, cuenta, pagado, no contar, texto
- Filtros favoritos: guardar combinaciones de filtros con nombre
- Edición inline y modal de detalle

### Vista Calendario
- Movimientos distribuidos en el calendario mensual
- Toggle Fecha / Fecha banco: elige qué campo posiciona los movimientos
- Drag & drop: arrastra un movimiento a otro día para cambiar su fecha
- Suma diaria visible en cada celda

### Vista Kanban
- Movimientos agrupados por tipo con totales por grupo
- Grupos expandibles y contraíbles

---

## 5. Finanzas del Año

Tabla resumen anual: filas = grupos y tipos, columnas = 12 meses + total + media.
Solo lectura. Útil para comparar el gasto mes a mes por categoría.

---

## 6. Dashboard

La página de inicio muestra un resumen general personalizable con widgets.

### Selector de mes/año

El pill junto al título "Dashboard" muestra el mes y año actual. Clic en él para abrir el selector:
- Navega por años con las flechas
- Selecciona cualquier mes pasado o el actual (los futuros están desactivados)
- El pill se vuelve azul cuando no estás viendo el mes actual
- Botón "Mes actual" aparece en el selector para volver al presente

Los widgets que cambian al seleccionar otro mes:
- Ingresos del mes, Gastos del mes, Balance neto del mes
- Grupos de presupuesto del backend (Finanzas / Presupuestos)
Los widgets que NO cambian: saldos de cuenta (siempre actuales), widgets anuales.

### Editar el Dashboard

Botón "Editar" (o desde Configuración → Editar Dashboard). En modo edición:
- Arrastrar widgets para reordenarlos
- Handles de resize (lado derecho y abajo) para cambiar tamaño
- Botones "+ Estadística", "+ Gráfico", "+ Presupuesto" para añadir widgets
- Botón "Restablecer" devuelve el layout por defecto
- Botón "Guardar" sale del modo edición guardando los cambios

### Widgets de Estadística

Al hacer clic en "+ Estadística" se muestran tres secciones:

**Métricas financieras:**
- Ingresos del año / Ingresos del mes
- Gastos del año / Gastos del mes
- Balance neto del año / Balance neto del mes (verde si positivo, rojo si negativo)

**Cuentas individuales:** un widget por cada cuenta bancaria configurada, que muestra su saldo actual.

**Paneles especiales:**
- "Cuenta de uso": saldo de la cuenta principal
- "Panel de ahorro": panel cíclico que muestra cada cuenta de ahorro al hacer clic

### Widgets de Presupuesto

Al hacer clic en "+ Presupuesto":
- Crear nuevo presupuesto directamente desde aquí
- **Todos los presupuestos**: tarjeta combinada que muestra todos los presupuestos activos en una sola tarjeta (útil para tener una visión global rápida)
- Añadir presupuestos individuales ya creados como widgets independientes

---

## 7. Configuración

### Cuentas
- Crear, editar y eliminar cuentas
- Al eliminar con movimientos: elegir entre borrarlos o convertirlos en gastos sin cuenta

### Tipos y Grupos
- CRUD completo
- La cuenta vinculada en un tipo indica que los movimientos de ese tipo afectan al saldo de esa cuenta

### Apariencia
- Modo oscuro/claro
- Moneda (símbolo junto a los importes)
- Formato de fecha: DD/MM/AAAA, MM/DD/AAAA, AAAA-MM-DD
- Mostrar inversiones: activa/desactiva la sección en el menú

### Copia de seguridad
- Exportar backup: JSON con todos los datos
- Importar backup: restaura desde un fichero JSON (sobreescribe todo)

---

## 8. Atajos y trucos

- Clic derecho en cualquier movimiento → Duplicar / Eliminar
- Arrastrar en el calendario → cambia la fecha sin abrir el modal
- Clic en el nombre en la tabla → modal de detalle completo
- Selección múltiple + "Modificar campo" → edición masiva
- No contar: excluye de todo (estadísticas, gráficos, presupuestos, inversiones). Úsalo para gastos futuros que pueden ocurrir o no
- Fecha banco futura: el movimiento no computa en inversiones hasta que la fecha llegue
- Plantillas con auto-crear: generan todos los pendientes al abrir la app aunque lleves días sin usarla
- {mes} en el nombre de plantilla: se sustituye por el mes actual al crear el movimiento
- Las preferencias de columnas (orden, ancho, visibilidad) y los filtros favoritos persisten entre sesiones

---

## 9. Preguntas frecuentes

P: ¿Cómo creo un movimiento recurrente todos los lunes?
R: Crea una plantilla → recurrencia tipo Semanal → marca Lunes → Auto-crear o Creación masiva.

P: ¿Cómo añado un nuevo tipo de gasto?
R: Configuración → Tipos de movimiento y Grupos → "+ Nuevo tipo".

P: ¿El saldo de la cuenta es automático?
R: Sí. Saldo inicial + suma de movimientos pagados asociados a esa cuenta.

P: ¿Puedo cambiar el límite de un presupuesto sin perder el historial?
R: Sí. Abrir presupuesto → "Nueva versión" → nuevo importe y fecha efectiva.

P: ¿Cómo marco varios movimientos como pagados de golpe?
R: Vista Tabla → checkboxes → Modificar campo → Pagado → Sí → Aplicar.

P: ¿Qué significa "No contar"?
R: El movimiento queda fuera de estadísticas, gráficos, presupuestos e inversiones. Solo aparece en la tabla. Útil para gastos futuros que pueden ocurrir o no (provisiones, reservas pendientes de confirmar).

P: ¿Cómo veo los datos de un mes anterior en el Dashboard?
R: Clic en el pill del mes/año junto al título. Selecciona año con las flechas y clic en el mes deseado. Los widgets mensuales (ingresos del mes, gastos del mes, presupuestos) se actualizan.

P: ¿Puedo ver el saldo de una cuenta específica en el Dashboard?
R: Sí. Modo edición → "+ Estadística" → sección "Cuentas" → clic en la cuenta deseada. Añade un widget con su saldo actual.

P: ¿Cómo veo todos los presupuestos juntos en el Dashboard?
R: Modo edición → "+ Presupuesto" → "Todos los presupuestos". Añade una tarjeta combinada con todos los presupuestos activos en una sola vista.

P: ¿Cómo obtengo el precio histórico de una compra de fondo?
R: Inversiones → expandir el fondo → fila de la compra → botón "Obtener".

P: ¿Cómo exporto todos mis datos?
R: Configuración → Copia de seguridad → Exportar backup.
`

// ── Section IDs for TOC ────────────────────────────────────────────────────────

const SECTIONS = [
  { id: 'ia',           label: 'Usar con IA' },
  { id: 'intro',        label: 'Introducción' },
  { id: 'conceptos',    label: 'Conceptos clave' },
  { id: 'movimientos',  label: 'Movimientos' },
  { id: 'plantillas',   label: 'Plantillas y recurrencias' },
  { id: 'graficos',     label: 'Gráficos' },
  { id: 'annual',       label: 'Finanzas del Año' },
  { id: 'dashboard',    label: 'Dashboard' },
  { id: 'inversiones',  label: 'Inversiones' },
  { id: 'presupuestos', label: 'Presupuestos' },
  { id: 'importar',     label: 'Importar Excel' },
  { id: 'config',       label: 'Configuración' },
  { id: 'trucos',       label: 'Atajos y trucos' },
]

// ── Typography helpers ─────────────────────────────────────────────────────────

function H2({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <h2 id={id} className="text-2xl font-bold text-gray-900 dark:text-white mt-14 mb-5 first:mt-0 scroll-mt-8">
      {children}
    </h2>
  )
}
function H3({ children }: { children: React.ReactNode }) {
  return <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100 mt-8 mb-3">{children}</h3>
}
function P({ children }: { children: React.ReactNode }) {
  return <p className="text-base text-gray-600 dark:text-gray-400 leading-relaxed mb-3">{children}</p>
}
function UL({ children }: { children: React.ReactNode }) {
  return <ul className="list-disc list-inside space-y-1.5 mb-4 text-base text-gray-600 dark:text-gray-400 leading-relaxed">{children}</ul>
}
function LI({ children }: { children: React.ReactNode }) {
  return <li>{children}</li>
}
function B({ children }: { children: React.ReactNode }) {
  return <span className="font-semibold text-gray-800 dark:text-gray-100">{children}</span>
}
function Code({ children }: { children: React.ReactNode }) {
  return <code className="font-mono text-sm bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 px-1.5 py-0.5 rounded">{children}</code>
}
function Note({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900 rounded-xl px-5 py-4 mb-5 text-base text-amber-800 dark:text-amber-300">
      {children}
    </div>
  )
}
function Tip({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900 rounded-xl px-5 py-4 mb-5 text-base text-blue-800 dark:text-blue-300">
      {children}
    </div>
  )
}
function Divider() {
  return <hr className="border-gray-100 dark:border-gray-800 my-8" />
}

// ── Process box with numbered steps ───────────────────────────────────────────

function Steps({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden mb-6">
      {title && (
        <div className="bg-gray-50 dark:bg-gray-800 px-5 py-3 border-b border-gray-200 dark:border-gray-700">
          <span className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">{title}</span>
        </div>
      )}
      <ol className="divide-y divide-gray-100 dark:divide-gray-800">
        {children}
      </ol>
    </div>
  )
}
function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex gap-4 px-5 py-4">
      <span className="shrink-0 w-6 h-6 rounded-full bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-xs font-bold flex items-center justify-center mt-0.5">
        {n}
      </span>
      <div className="flex-1 text-base text-gray-700 dark:text-gray-300 leading-relaxed">{children}</div>
    </li>
  )
}

// ── Example box ───────────────────────────────────────────────────────────────

function Example({ label, children }: { label?: string; children: React.ReactNode }) {
  return (
    <div className="bg-gray-50 dark:bg-gray-800/60 border border-gray-200 dark:border-gray-700 rounded-xl px-5 py-4 mb-5">
      <span className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-widest">
        {label ?? 'Ejemplo'}
      </span>
      <div className="mt-2 text-base text-gray-700 dark:text-gray-300 leading-relaxed">{children}</div>
    </div>
  )
}

// ── Q&A ───────────────────────────────────────────────────────────────────────

function QA({ q, children }: { q: string; children: React.ReactNode }) {
  return (
    <div className="mb-5">
      <p className="text-base font-semibold text-gray-800 dark:text-gray-100 mb-1.5">{q}</p>
      <p className="text-base text-gray-600 dark:text-gray-400 leading-relaxed pl-4 border-l-2 border-gray-200 dark:border-gray-700">
        {children}
      </p>
    </div>
  )
}

// ── Download helper ────────────────────────────────────────────────────────────

function downloadMd() {
  const blob = new Blob([MD], { type: 'text/markdown;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'caulky-guia.md'
  a.click()
  URL.revokeObjectURL(url)
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function Documentation() {
  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <div className="flex h-screen overflow-hidden">

      {/* ── Left TOC: independent scroll, always visible ── */}
      <aside className="hidden lg:flex flex-col w-56 shrink-0 overflow-y-auto border-r border-gray-100 dark:border-gray-800 py-8 px-4">
        <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500 mb-3 px-1">Contenido</p>
        <nav className="flex-1 space-y-0.5">
          {SECTIONS.map(s => (
            <button
              key={s.id}
              onClick={() => scrollTo(s.id)}
              className="block w-full text-left text-sm py-2 px-3 rounded-lg text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              {s.label}
            </button>
          ))}
        </nav>
      </aside>

      {/* ── Right content: scrolls independently ── */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl px-10 py-10">

          {/* Page header */}
          <div className="mb-10">
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Documentación</h1>
            <p className="text-base text-gray-500 dark:text-gray-400 mt-2">Guía completa de uso de Caulky</p>
          </div>

          {/* ── 0. Usar con IA ─────────────────────────────────────────────── */}
          <H2 id="ia">Usar con IA</H2>
          <P>
            Descarga el archivo <B>.md</B> y adjúntalo al inicio de una conversación con cualquier IA
            (ChatGPT, Claude, Gemini…). La IA leerá la guía completa y podrá ayudarte a usar Caulky
            como si fuera un experto en el sistema.
          </P>

          <div className="my-6">
            <button
              onClick={downloadMd}
              className="inline-flex items-center gap-2.5 px-5 py-3 bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-base font-semibold rounded-xl hover:bg-gray-700 dark:hover:bg-gray-100 transition-colors"
            >
              <Download className="w-5 h-5" />
              Descargar guía .md para IA
            </button>
          </div>

          <P>Con el archivo adjunto puedes preguntar cosas como:</P>
          <UL>
            <LI>"Quiero crear un movimiento que se repita todos los lunes"</LI>
            <LI>"¿Cómo añado un tipo de gasto nuevo?"</LI>
            <LI>"Quiero ver cuánto gasto en alimentación cada mes en un gráfico"</LI>
            <LI>"¿Cómo configuro el seguimiento de mis fondos de inversión?"</LI>
            <LI>"Quiero que el alquiler aparezca solo el día 5 de cada mes"</LI>
            <LI>"¿Cómo exporto todos mis datos?"</LI>
          </UL>
          <Tip>
            El archivo incluye todos los conceptos, flujos paso a paso, atajos y preguntas frecuentes
            para que la IA te dé instrucciones precisas sin necesidad de que conozcas la app de antemano.
          </Tip>

          <Divider />

          {/* ── 1. Introducción ────────────────────────────────────────────── */}
          <H2 id="intro">Introducción</H2>
          <P>
            Caulky es una aplicación web de finanzas personales con interfaz completamente en español.
            El backend es FastAPI (Python) con base de datos PostgreSQL.
          </P>
          <UL>
            <LI>Registrar y categorizar cualquier transacción (gastos, ingresos, transferencias, ahorros)</LI>
            <LI>Ver las finanzas en distintos formatos: tabla, calendario, resumen anual, gráficos personalizables</LI>
            <LI>Gestionar presupuestos por categoría con historial de periodos</LI>
            <LI>Crear plantillas de movimientos y programar recurrencias (diaria, semanal, mensual)</LI>
            <LI>Hacer seguimiento de inversiones en fondos con precios de Yahoo Finance</LI>
            <LI>Importar datos desde hojas de cálculo Excel</LI>
            <LI>Gestionar varias cuentas bancarias con saldos automáticos</LI>
            <LI>Exportar e importar copias de seguridad completas en JSON</LI>
          </UL>

          <Divider />

          {/* ── 2. Conceptos clave ─────────────────────────────────────────── */}
          <H2 id="conceptos">Conceptos clave</H2>

          <H3>Movimiento</H3>
          <P>Una transacción de dinero. Es la entidad central de Caulky. Sus campos son:</P>
          <UL>
            <LI><B>Nombre</B>: descripción libre (ej. "Mercadona", "Nómina Mayo")</LI>
            <LI><B>Importe</B>: en euros. <B>Positivo = ingreso, Negativo = gasto</B></LI>
            <LI><B>Fecha</B>: la que tú registras; <B>Fecha banco</B>: cuando el banco lo procesa (opcional)</LI>
            <LI><B>Tipo</B>: categoría del movimiento; <B>Cuenta</B>: cuenta bancaria asociada</LI>
            <LI><B>Pagado</B>: si está confirmado/liquidado</LI>
            <LI><B>No contar</B>: lo excluye de estadísticas, gráficos, presupuestos e inversiones</LI>
            <LI><B>Notas</B> y <B>Archivos adjuntos</B> (facturas, justificantes)</LI>
          </UL>

          <H3>Tipos de movimiento</H3>
          <P>
            Categorías para clasificar movimientos (ej. "Supermercado", "Nómina", "Alquiler").
            Cada tipo tiene nombre, color y pertenece a un <B>grupo</B>.
            Opcionalmente tienen una <B>cuenta vinculada</B>: los movimientos de ese tipo afectan al saldo de esa cuenta.
          </P>

          <H3>Grupos</H3>
          <P>
            Agrupaciones de tipos de movimiento (ej. "Alimentación", "Transporte", "Ingresos").
            Se usan en la vista anual, en gráficos con desglose por grupo y en la vista Kanban.
          </P>

          <H3>Cuentas</H3>
          <P>
            Cuentas bancarias o bolsillos. Tienen nombre, color, icono y saldo inicial.
            El saldo actual se calcula automáticamente: <B>Saldo inicial + suma de movimientos pagados</B> asociados.
          </P>

          <H3>Presupuestos</H3>
          <P>
            Límites de gasto configurables. Se vinculan a uno o varios tipos de movimiento y tienen un
            periodo (mensual, semanal, anual o personalizado). Admiten <B>versiones de importe</B>: puedes
            cambiar el límite en distintas fechas sin perder el historial.
          </P>

          <H3>Plantillas y recurrencias</H3>
          <P>
            Las plantillas son movimientos preconfigurados para crearlos rápido. Las recurrencias generan
            movimientos automáticamente según una regla periódica. El nombre de una plantilla puede usar
            variables: <Code>{'{mes}'}</Code>, <Code>{'{año}'}</Code>, <Code>{'{mesfecha}'}</Code>,{' '}
            <Code>{'{mesfechabanco}'}</Code>.
          </P>

          <H3>Fondos de inversión</H3>
          <P>
            Fondos vinculados a un tipo de movimiento. Cada movimiento de ese tipo = una compra del fondo.
            Con el ticker de Yahoo Finance (ej. <Code>IWDA.AS</Code>) se obtienen precios actuales e históricos.
          </P>

          <Divider />

          {/* ── 3. Movimientos ─────────────────────────────────────────────── */}
          <H2 id="movimientos">Movimientos</H2>
          <P>
            La página principal de gestión de transacciones. Disponible en tres vistas:
            <B> Tabla</B>, <B>Calendario</B> y <B>Kanban</B>.
          </P>

          <H3>Añadir un movimiento</H3>
          <Steps>
            <Step n={1}>Ir a <B>Movimientos</B> y clic en <B>"+ Nuevo"</B></Step>
            <Step n={2}>Rellenar <B>Nombre</B> e <B>Importe</B> (negativo para gastos, positivo para ingresos)</Step>
            <Step n={3}>Seleccionar <B>Fecha</B>, <B>Tipo</B> y <B>Cuenta</B> (opcionales pero recomendados)</Step>
            <Step n={4}>Marcar <B>Pagado</B> si ya está confirmado. <B>No contar</B> para excluirlo de estadísticas</Step>
            <Step n={5}>Opcionalmente añadir <B>notas</B> y <B>archivos adjuntos</B></Step>
            <Step n={6}>
              Tres botones en la parte inferior:
              <UL>
                <LI><B>Cancelar</B>: cierra sin guardar</LI>
                <LI><B>Crear varios</B>: crea el mismo movimiento en múltiples fechas según una regla</LI>
                <LI><B>Guardar</B>: crea el movimiento único</LI>
              </UL>
            </Step>
          </Steps>

          <H3>Crear varios movimientos de golpe</H3>
          <P>El botón <B>"Crear varios"</B> permite crear múltiples copias del mismo movimiento distribuidas en el tiempo. Ideal para financiaciones a plazos, pagos escalonados, suscripciones con fecha de inicio conocida, etc.</P>
          <Steps>
            <Step n={1}>Rellenar el formulario con el nombre, importe, tipo, etc. del movimiento base</Step>
            <Step n={2}>Clic en <B>"Crear varios"</B> (entre Cancelar y Guardar)</Step>
            <Step n={3}>Elegir el <B>tipo de repetición</B>: Diario, Semanal, Mensual por día, Mensual por semana</Step>
            <Step n={4}>Configurar la <B>fecha del primer movimiento</B></Step>
            <Step n={5}>Indicar <B>cuántos movimientos</B> crear en total</Step>
            <Step n={6}>Activar opcionalmente <B>"Numerar pagos en el nombre"</B> → añade "1/N", "2/N"… al nombre de cada movimiento</Step>
            <Step n={7}>La vista previa muestra los primeros movimientos con fechas y nombres resultantes</Step>
            <Step n={8}>Clic en <B>"Crear N movimientos"</B></Step>
          </Steps>
          <Example label="Financiación a plazos">
            500€ en 5 pagos mensuales el día 15: Nombre "Financiación TV" · Importe -100 · Mensual (día) el 15 · Cantidad 5 · Numerar pagos activado
            → crea "Financiación TV 1/5" el 15 enero, "Financiación TV 2/5" el 15 febrero, etc.
          </Example>
          <Tip>
            <B>Diferencia con las recurrencias de plantillas</B>: "Crear varios" es un proceso puntual sin necesidad de guardar plantilla. Las plantillas con recurrencia son para gastos que se repiten de forma indefinida (alquiler, suscripciones, etc.).
          </Tip>

          <H3>Editar un movimiento</H3>
          <P><B>Edición inline</B> — clic en cualquier celda de la tabla (excepto el nombre) para editar ese campo directamente. Un botón ✓ confirma el cambio.</P>
          <P><B>Modal completo</B> — clic en el <B>nombre</B> del movimiento. Permite editar todos los campos, adjuntar archivos, duplicar o eliminar.</P>
          <P><B>Menú contextual</B> — clic derecho en cualquier movimiento → opciones: Duplicar, Eliminar.</P>

          <H3>Edición masiva</H3>
          <Steps title="Modificar un campo en varios movimientos a la vez">
            <Step n={1}>Activar los <B>checkboxes</B> de las filas a editar. El checkbox del encabezado selecciona todos</Step>
            <Step n={2}>En la barra de acciones → clic en <B>"Modificar campo"</B></Step>
            <Step n={3}>Elegir el campo: Nombre, Importe, Tipo, Cuenta, Fecha, Fecha banco, Pagado, No contar, Notas</Step>
            <Step n={4}>Introducir el nuevo valor y clic en <B>"Aplicar"</B></Step>
          </Steps>
          <Example label="Caso de uso">
            Marcar como pagados todos los movimientos de enero: filtrar por enero → checkbox de encabezado → Modificar campo → Pagado → Sí → Aplicar.
          </Example>

          <H3>Vista Tabla</H3>
          <UL>
            <LI>Columnas configurables: mostrar/ocultar, reordenar arrastrando el encabezado, redimensionar arrastrando el borde</LI>
            <LI>Ordenación: clic en el encabezado de columna</LI>
            <LI>Filtros avanzados: rango de fechas, importe, tipo(s), cuenta(s), estado pagado, no contar, búsqueda por texto</LI>
            <LI><B>Filtros favoritos</B>: guardar combinaciones de filtros con nombre para reutilizarlos</LI>
          </UL>

          <H3>Vista Calendario</H3>
          <UL>
            <LI>Toggle <B>Fecha / Fecha banco</B>: elige qué campo determina en qué día aparece el movimiento</LI>
            <LI><B>Drag & drop</B>: arrastra un movimiento a otro día para cambiar su fecha sin abrir el modal</LI>
            <LI>Suma diaria visible en cada celda (verde = positivo, rojo = negativo)</LI>
          </UL>

          <H3>Vista Kanban</H3>
          <P>Movimientos agrupados por tipo de movimiento con totales por grupo. Los grupos se pueden expandir y contraer. Útil para ver de un vistazo todos los movimientos de una categoría.</P>

          <Divider />

          {/* ── 4. Plantillas y recurrencias ───────────────────────────────── */}
          <H2 id="plantillas">Plantillas y recurrencias</H2>
          <P>
            Las plantillas permiten crear movimientos habituales rápidamente. Las recurrencias
            automatizan la creación periódica de esos movimientos.
          </P>

          <H3>Crear una plantilla</H3>
          <Steps>
            <Step n={1}>Movimientos → clic en <B>"+ Nuevo"</B> → clic en el icono de <B>plantillas</B> (arriba a la derecha del panel)</Step>
            <Step n={2}>Clic en <B>"+ Nueva plantilla"</B></Step>
            <Step n={3}>Rellenar la <B>etiqueta</B> (nombre corto para identificarla) y el resto de campos habituales del movimiento</Step>
            <Step n={4}>En el campo de nombre puedes usar <Code>{'{mes}'}</Code> para insertar el mes actual automáticamente. Ej: "Nómina {'{mes}'}" → "Nómina Mayo"</Step>
            <Step n={5}>Elegir si la <B>Fecha</B> y la <B>Fecha banco</B> se rellenan solas como "hoy" o se dejan en blanco para rellenar manualmente</Step>
            <Step n={6}>Guardar — aparecerá en la lista de plantillas para usarla en un clic</Step>
          </Steps>

          <H3>Configurar una recurrencia</H3>
          <Steps>
            <Step n={1}>En la lista de plantillas, clic en el <B>icono de calendario</B> de la plantilla que quieres repetir</Step>
            <Step n={2}>Elegir el <B>tipo de recurrencia</B>:
              <UL>
                <LI><B>Diaria</B>: cada N días</LI>
                <LI><B>Semanal</B>: los días de la semana que elijas (puedes marcar varios)</LI>
                <LI><B>Mensual por día</B>: el día X de cada N meses (ej. el día 5 de cada mes)</LI>
                <LI><B>Mensual por semana</B>: el Nth día_de_semana del mes (ej. el primer lunes, el último viernes)</LI>
              </UL>
            </Step>
            <Step n={3}>Establecer la <B>fecha de inicio</B> de la recurrencia</Step>
            <Step n={4}>Elegir el <B>modo</B>:
              <UL>
                <LI><B>Auto-crear</B>: Caulky crea automáticamente los movimientos pendientes cada vez que abres la app</LI>
                <LI><B>Creación masiva</B>: tú eliges cuántas ocurrencias crear ahora de golpe (ej. los próximos 12 meses)</LI>
              </UL>
            </Step>
            <Step n={5}>Guardar</Step>
          </Steps>

          <Example label="Todos los lunes">
            Plantilla "Compra semanal" → icono calendario → tipo <B>Semanal</B> → marcar <B>Lunes</B> → fecha de inicio: el primer lunes → modo <B>Auto-crear</B> → Guardar.
          </Example>
          <Example label="El día 5 de cada mes">
            Plantilla "Alquiler" → tipo <B>Mensual (día)</B> → día <B>5</B>, cada <B>1</B> mes → Auto-crear → Guardar.
          </Example>
          <Example label="El primer viernes de cada mes">
            Plantilla → tipo <B>Mensual (semana)</B> → "el <B>primer Viernes</B> de cada mes" → Auto-crear → Guardar.
          </Example>

          <Note>
            Con <B>Auto-crear</B>, si llevas varios días sin abrir la app y hay movimientos pendientes, Caulky los crea todos al abrir la aplicación.
          </Note>

          <Divider />

          {/* ── 5. Gráficos ────────────────────────────────────────────────── */}
          <H2 id="graficos">Gráficos</H2>
          <P>Visualizaciones completamente configurables de los datos financieros.</P>

          <H3>Crear un gráfico</H3>
          <Steps>
            <Step n={1}>Ir a <B>Gráficos</B> → clic en <B>"+ Añadir gráfico"</B></Step>
            <Step n={2}>Elegir el <B>tipo</B>: Columnas, Apilado, Líneas, Área, Donut o Mixto</Step>
            <Step n={3}>Configurar el <B>Eje X</B>: Mes (un punto por mes), Año, o Ninguno (dato único acumulado)</Step>
            <Step n={4}>Configurar el <B>Desglose</B>: Ninguno (una serie), Grupo, Tipo de movimiento, o Cuenta</Step>
            <Step n={5}>Elegir el <B>Signo</B>: Todos los movimientos, Solo gastos (negativos), Solo ingresos (positivos)</Step>
            <Step n={6}>Elegir la <B>Métrica</B>: suma de importes o número de movimientos</Step>
            <Step n={7}>Opcionalmente aplicar <B>filtros avanzados</B> (por tipo, cuenta, rango de fechas…)</Step>
          </Steps>

          <Example label="Gasto mensual en supermercado">
            Tipo: Columnas · Eje X: Mes · Desglose: Ninguno · Signo: Solo gastos · Filtro: Tipo = "Supermercado"
          </Example>
          <Example label="Todos los gastos desglosados por categoría">
            Tipo: Apilado · Eje X: Mes · Desglose: Grupo · Signo: Solo gastos
          </Example>
          <Example label="Evolución del saldo de cuentas">
            Tipo: Líneas · Eje X: Mes · Desglose: Cuenta · Signo: Todos
          </Example>

          <Divider />

          {/* ── 6. Finanzas del Año ────────────────────────────────────────── */}
          <H2 id="annual">Finanzas del Año</H2>
          <P>
            Tabla resumen anual con desglose mensual por categoría. Solo lectura.
          </P>
          <UL>
            <LI>Filas: grupos y tipos de movimiento; Columnas: 12 meses + total anual + media mensual</LI>
            <LI>Los valores cero aparecen como "—" para facilitar la lectura</LI>
            <LI>Selector de año en la parte superior</LI>
          </UL>
          <Tip>Ideal para ver de un vistazo cuánto has gastado en cada categoría mes a mes y detectar variaciones o meses atípicos.</Tip>

          <Divider />

          {/* ── 7. Dashboard ───────────────────────────────────────────────── */}
          <H2 id="dashboard">Dashboard</H2>
          <P>Página de inicio personalizable con widgets de estadísticas, gráficos y presupuestos.</P>

          <H3>Selector de mes/año</H3>
          <P>El pill junto al título muestra el mes y año. <B>Clic en él</B> para abrir el selector y navegar a cualquier mes pasado. Los widgets mensuales (ingresos del mes, gastos del mes, balance neto del mes, progreso de presupuestos del backend) reflejan el periodo seleccionado. El pill se vuelve <B>azul</B> cuando no estás viendo el mes actual.</P>

          <H3>Editar el Dashboard</H3>
          <P>Accede desde el botón "Editar" del propio Dashboard (o desde Configuración → Editar Dashboard). En modo edición puedes arrastrar widgets para reordenarlos, redimensionarlos con los handles de los bordes, y añadir nuevos con los botones de la cabecera.</P>

          <H3>Widgets de Estadística</H3>
          <P>Al pulsar <B>"+ Estadística"</B> se muestran tres secciones:</P>
          <UL>
            <LI><B>Métricas:</B> Ingresos del año/mes · Gastos del año/mes · Balance neto del año/mes (verde si positivo, rojo si negativo)</LI>
            <LI><B>Cuentas:</B> un widget por cada cuenta bancaria configurada, que muestra su saldo actual</LI>
            <LI><B>Paneles especiales:</B> "Cuenta de uso" (cuenta principal) · "Panel de ahorro" (cíclico entre cuentas de ahorro)</LI>
          </UL>
          <Tip>Puedes añadir varios widgets de cuenta distintos. Por ejemplo: "Cuenta corriente", "Cuenta ahorro" y "Efectivo" en la misma fila.</Tip>

          <H3>Widgets de Presupuesto</H3>
          <UL>
            <LI>Presupuestos individuales: barra de progreso con importe gastado / límite</LI>
            <LI><B>Todos los presupuestos:</B> tarjeta combinada que muestra todos en una sola vista. Ideal para la primera fila del dashboard</LI>
          </UL>

          <Divider />

          {/* ── 8. Inversiones ─────────────────────────────────────────────── */}
          <H2 id="inversiones">Inversiones</H2>
          <Note>
            Para que un movimiento aparezca en Inversiones debe estar <B>Pagado</B>, no tener <B>No contar</B> activo, y si tiene fecha banco no puede ser futura.
          </Note>

          <H3>Configurar un fondo nuevo</H3>
          <Steps>
            <Step n={1}>En <B>Configuración</B>, crear un <B>tipo de movimiento</B> para las compras del fondo (ej. "Compra MSCI World"), asignarlo a un grupo de inversión</Step>
            <Step n={2}>Ir a <B>Inversiones</B> en el menú lateral (activarlo en Configuración si no aparece)</Step>
            <Step n={3}>Clic en <B>"+ Nuevo fondo"</B></Step>
            <Step n={4}>Rellenar nombre, <B>ticker de Yahoo Finance</B> (ej. <Code>IWDA.AS</Code>, <Code>0P0000XMVJ.F</Code>) y vincular al tipo del paso 1</Step>
            <Step n={5}>Cada aportación al fondo = crear un movimiento con ese tipo (importe negativo)</Step>
            <Step n={6}>En la lista de compras del fondo, clic en <B>"Obtener"</B> para buscar el precio histórico en Yahoo Finance para la fecha de esa compra</Step>
            <Step n={7}>Actualizar el precio actual con el <B>icono de refresco</B> del fondo</Step>
          </Steps>

          <H3>Columnas de la lista de compras</H3>
          <UL>
            <LI><B>Fecha</B>: fecha banco del movimiento (o fecha normal si no tiene)</LI>
            <LI><B>Importe</B>: euros invertidos en esa compra</LI>
            <LI><B>Precio/part.</B>: precio por participación en la fecha de compra</LI>
            <LI><B>Participaciones</B>: importe ÷ precio de compra</LI>
            <LI><B>Valor actual</B>: importe × (precio actual ÷ precio de compra)</LI>
            <LI><B>Rentabilidad</B>: (precio actual − precio compra) ÷ precio compra × 100%</LI>
          </UL>
          <P>Clic en una fila → abre el modal de detalle del movimiento. Clic en el valor actual del fondo → sobreescribirlo manualmente.</P>

          <Divider />

          {/* ── 9. Presupuestos ────────────────────────────────────────────── */}
          <H2 id="presupuestos">Presupuestos</H2>

          <H3>Crear un presupuesto</H3>
          <Steps>
            <Step n={1}>Ir a <B>Presupuestos</B> → clic en <B>"+ Nuevo presupuesto"</B></Step>
            <Step n={2}>Poner un <B>nombre</B> descriptivo (ej. "Alimentación mensual")</Step>
            <Step n={3}>Vincular uno o varios <B>tipos de movimiento</B> al presupuesto</Step>
            <Step n={4}>Elegir el <B>periodo</B>: Mensual, Semanal, Anual o Personalizado (rango de fechas fijo)</Step>
            <Step n={5}>Establecer el <B>importe límite</B> de gasto para ese periodo</Step>
            <Step n={6}>Opcionalmente indicar la <B>fecha de inicio de seguimiento</B> (si quieres que solo cuente desde un mes concreto)</Step>
          </Steps>

          <H3>Cambiar el importe sin perder el historial</H3>
          <Steps>
            <Step n={1}>Abrir el presupuesto → clic en <B>"Nueva versión"</B></Step>
            <Step n={2}>Indicar el nuevo importe y la <B>fecha desde la que aplica</B></Step>
            <Step n={3}>Guardar — los periodos anteriores mantienen el importe anterior</Step>
          </Steps>

          <H3>Visualización</H3>
          <UL>
            <LI>Barra de progreso del periodo actual con el gasto real vs límite</LI>
            <LI>Histórico de periodos pasados</LI>
            <LI>Gráfico de líneas con la evolución temporal</LI>
          </UL>

          <Divider />

          {/* ── 10. Importar Excel ─────────────────────────────────────────── */}
          <H2 id="importar">Importar Excel</H2>
          <P>Asistente de 4 pasos para importar movimientos desde un fichero .xlsx.</P>
          <Steps>
            <Step n={1}><B>Archivo</B>: subir el fichero Excel (arrastrar al área o clic para seleccionar)</Step>
            <Step n={2}><B>Columnas</B>: mapear cada columna del Excel al campo de Caulky correspondiente (Fecha, Nombre, Importe, Fecha banco, Tipo, Notas). Se puede previsualizar el resultado</Step>
            <Step n={3}><B>Tipos</B>: si el Excel tiene categorías en texto, mapearlas a tipos de movimiento de Caulky</Step>
            <Step n={4}><B>Importar</B>: previsualización de los movimientos → simulación previa → importación definitiva</Step>
          </Steps>

          <Divider />

          {/* ── 11. Configuración ──────────────────────────────────────────── */}
          <H2 id="config">Configuración</H2>

          <H3>Crear tipos de movimiento y grupos</H3>
          <Steps>
            <Step n={1}>Ir a <B>Configuración</B> → sección <B>"Tipos de movimiento y Grupos"</B></Step>
            <Step n={2}>Para crear un <B>grupo</B>: clic en <B>"+ Nuevo grupo"</B> → nombre → guardar</Step>
            <Step n={3}>Para crear un <B>tipo</B>: clic en <B>"+ Nuevo tipo"</B> → nombre, color, grupo al que pertenece</Step>
            <Step n={4}>Opcionalmente: asignar una <B>cuenta vinculada</B> (los movimientos de ese tipo afectarán al saldo de esa cuenta — útil para ahorros)</Step>
          </Steps>

          <H3>Crear una cuenta bancaria</H3>
          <Steps>
            <Step n={1}>Configuración → sección <B>"Cuentas"</B> → clic en <B>"+ Nueva cuenta"</B></Step>
            <Step n={2}>Rellenar nombre, color, icono y <B>saldo inicial</B> (el saldo que tenía cuando empezaste a usar Caulky)</Step>
            <Step n={3}>Guardar — el saldo actual se calculará automáticamente con cada movimiento</Step>
          </Steps>
          <Note>Al eliminar una cuenta con movimientos: puedes elegir entre <B>borrar los movimientos</B> o <B>convertirlos en gastos sin cuenta</B>.</Note>

          <H3>Apariencia y preferencias</H3>
          <UL>
            <LI><B>Modo oscuro/claro</B>: toggle en la parte superior de Configuración</LI>
            <LI><B>Moneda</B>: símbolo que aparece junto a los importes (por defecto "€")</LI>
            <LI><B>Formato de fecha</B>: DD/MM/AAAA, MM/DD/AAAA o AAAA-MM-DD</LI>
            <LI><B>Mostrar inversiones</B>: activa o desactiva la sección Inversiones en el menú lateral</LI>
          </UL>

          <H3>Copia de seguridad</H3>
          <UL>
            <LI><B>Exportar backup</B>: descarga un fichero JSON con todos los datos (movimientos, tipos, grupos, cuentas, fondos)</LI>
            <LI><B>Importar backup</B>: restaura desde un JSON de backup. ⚠️ Sobreescribe todos los datos actuales</LI>
          </UL>

          <Divider />

          {/* ── 12. Atajos y trucos ────────────────────────────────────────── */}
          <H2 id="trucos">Atajos y trucos</H2>
          <UL>
            <LI><B>Clic derecho</B> en cualquier movimiento → menú rápido: Duplicar, Eliminar</LI>
            <LI><B>Arrastrar</B> en el calendario → cambia la fecha del movimiento sin abrir el modal</LI>
            <LI><B>Clic en el nombre</B> en la tabla → modal de detalle completo</LI>
            <LI>Movimientos con <B>"No contar"</B> activo quedan fuera de estadísticas, gráficos, presupuestos e inversiones. Ideal para gastos futuros que pueden ocurrir o no</LI>
            <LI>Movimientos con <B>fecha banco futura</B> no computan en inversiones hasta que esa fecha llegue</LI>
            <LI>Las preferencias de columnas (orden, ancho, visibilidad) y los <B>filtros favoritos</B> persisten entre sesiones en el navegador</LI>
            <LI>Con <B>Auto-crear</B>, si llevas días sin abrir la app, al abrirla se crean automáticamente todos los movimientos recurrentes pendientes</LI>
          </UL>

          <H3>Preguntas frecuentes</H3>
          <QA q="¿Cómo creo un movimiento recurrente todos los lunes?">
            Crea una plantilla → icono calendario → tipo Semanal → marca Lunes → fecha de inicio → Auto-crear → Guardar.
          </QA>
          <QA q="¿Cómo añado un nuevo tipo de gasto?">
            Configuración → Tipos de movimiento y Grupos → "+ Nuevo tipo" → nombre, color, grupo.
          </QA>
          <QA q="¿El saldo de la cuenta es automático?">
            Sí. Saldo actual = Saldo inicial + suma de todos los movimientos pagados asociados a esa cuenta.
          </QA>
          <QA q="¿Puedo cambiar el límite de un presupuesto sin perder el historial?">
            Sí. Abre el presupuesto → "Nueva versión" → nuevo importe y fecha efectiva. El historial anterior no cambia.
          </QA>
          <QA q="¿Cómo marco varios movimientos como pagados de golpe?">
            Vista Tabla → seleccionar con checkboxes → Modificar campo → Pagado → Sí → Aplicar.
          </QA>
          <QA q="¿Qué significa 'No contar'?">
            El movimiento queda fuera de estadísticas, gráficos, presupuestos e inversiones. Solo aparece en la tabla de movimientos. Úsalo para gastos futuros que pueden ocurrir o no, y que no quieres que distorsionen tus estadísticas hasta que se confirmen.
          </QA>
          <QA q="¿Cómo obtengo el precio histórico de una compra de fondo?">
            Inversiones → expandir el fondo → fila de la compra → botón "Obtener" → busca el precio en Yahoo Finance para la fecha de esa compra.
          </QA>

          <div className="pb-12" />
        </div>
      </div>
    </div>
  )
}

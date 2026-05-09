import { Download } from 'lucide-react'
import { t } from '../utils/i18n'

// ── Markdown content for download ─────────────────────────────────────────────

const MD = `# Caulky — Guía completa para uso con IA

> **Para la IA que lea esto:** este documento cubre al completo Caulky, una app de finanzas personales. Con él puedes guiar paso a paso a cualquier usuario para hacer cualquier cosa en la app: registrar movimientos, configurar recurrencias, analizar gastos, comparar años, gestionar inversiones, crear plugins, etc. Léelo entero antes de responder.

---

## 0. Cómo usar este documento con una IA

Descarga este archivo desde Documentación y adjúntalo al inicio de una conversación con una IA (ChatGPT, Claude, Gemini…). La IA leerá la guía completa y podrá responderte preguntas como:

- "Quiero que el alquiler aparezca solo el día 5 de cada mes"
- "¿Cómo veo la evolución del saldo de mis cuentas?"
- "Quiero comparar cuánto gasté en alimentación este año vs el año pasado"
- "¿Cómo instalo un plugin para cambiar la fuente?"
- "¿Cómo exporto todos mis datos?"

---

## 1. Introducción y páginas del menú

Caulky es una aplicación web de finanzas personales, autoalojada, con interfaz completamente en español. Backend: FastAPI + PostgreSQL. Frontend: React + TypeScript.

Páginas del menú lateral (todas configurables desde Configuración → Navegación):

| Página | Ruta | Para qué sirve |
|--------|------|----------------|
| Dashboard | / | Resumen personalizable con widgets |
| Movimientos | /movements | Registrar y gestionar transacciones |
| Cuentas | /cuentas | Analítica de saldos y evolución de cuentas |
| Finanzas del Año | /annual | Tabla resumen anual por categoría |
| Gráficos | /charts | Gráficos personalizables de datos financieros |
| Comparaciones | /comparaciones | Comparar dos años entre sí |
| Presupuestos | /budgets | Límites de gasto con seguimiento |
| Inversiones | /inversiones | Seguimiento de fondos de inversión (oculto por defecto) |
| Importar Excel | /import | Importar movimientos desde .xlsx |
| Documentación | /docs | Esta guía |

El menú lateral es configurable: en Configuración → Navegación puedes ocultar páginas que no uses o reordenarlas.

---

## 2. Conceptos clave

### Movimiento

Un movimiento es cualquier transacción de dinero. Es la entidad central de Caulky.

Campos de un movimiento:
- **Nombre**: descripción libre (ej. "Mercadona", "Nómina Mayo")
- **Importe (money)**: cantidad. **Positivo = ingreso, Negativo = gasto**
- **Fecha (date)**: la fecha que tú registras
- **Fecha banco (bank_date)**: cuándo lo procesa el banco. Opcional. Afecta al calendario, a las inversiones y a la evolución de cuentas
- **Tipo (movement_type_id)**: categoría del movimiento (ej. "Supermercado", "Nómina")
- **Cuenta (account_id)**: cuenta bancaria asociada
- **Pagado (paid)**: si el movimiento está confirmado/liquidado. Solo los pagados computan en saldos e inversiones
- **No contar (no_count)**: excluye el movimiento de estadísticas, gráficos, presupuestos e inversiones. Solo aparece en la tabla
- **Notas**: texto libre
- **Archivos adjuntos**: facturas, justificantes, imágenes
- **Compartido (is_shared)**: marca el gasto como compartido con otra persona
- **Compartido con (shared_with)**: nombre de la persona con quien se comparte
- **Dividido entre (shared_between)**: número de personas entre las que se divide (ej. 2 para la mitad)
- **Mi parte (my_share)**: importe exacto que te corresponde a ti (alternativa a shared_between)

### Tipos de movimiento

Categorías para clasificar movimientos. Campos:
- Nombre y color
- Grupo al que pertenece
- Cuenta vinculada (opcional): los movimientos de ese tipo afectan al saldo de esa cuenta

### Grupos

Agrupaciones de tipos de movimiento (ej. "Alimentación", "Transporte", "Ingresos").
Se usan en: vista Finanzas del Año, desglose en Gráficos, vista Kanban, y Comparaciones.

### Cuentas

Cuentas bancarias o bolsillos. Campos: nombre, color, icono, saldo inicial.
**Saldo actual = Saldo inicial + suma de movimientos pagados asociados a esa cuenta.**
La cuenta puede ser "cuenta principal" (is_main) — en ese caso todos los movimientos con dinero positivo o negativo la afectan, no solo los de un tipo vinculado.

### Presupuestos

Límites de gasto configurables. Se vinculan a uno o varios tipos de movimiento y tienen un periodo (mensual, semanal, anual, personalizado). Admiten **versiones de importe**: puedes cambiar el límite en distintas fechas sin perder el historial de periodos anteriores.

### Plantillas de movimiento

Movimientos preconfigurados para crearlos en un clic. Variables dinámicas en el nombre:
- {mes}: mes actual del sistema (ej. "Mayo")
- {año}: año actual
- {mesfecha}: mes de la fecha del movimiento
- {mesfechabanco}: mes de la fecha banco

### Recurrencias

Se configuran sobre una plantilla. Tipos:
- **Diaria**: cada N días
- **Semanal**: los días de la semana que elijas (puedes marcar varios)
- **Mensual por día**: el día X de cada N meses (ej. el día 5 de cada mes)
- **Mensual por semana**: el Nth día_de_semana del mes (ej. el primer lunes, el último viernes)

Modos de creación:
- **Auto-crear**: Caulky crea automáticamente los movimientos pendientes cada vez que abres la app
- **Creación masiva**: tú eliges cuántas ocurrencias crear de golpe ahora

### Fondos de inversión

Fondos vinculados a un tipo de movimiento. Cada movimiento de ese tipo = una compra del fondo.
Con el ticker de Yahoo Finance (ej. IWDA.AS, 0P0000XMVJ.F) se obtienen precios actuales e históricos.
Requisitos para que una compra aparezca en Inversiones: Pagado = sí, No contar = no, Fecha banco no futura.

---

## 3. Flujos de trabajo paso a paso

### 3.1 Añadir un movimiento

1. Ir a Movimientos → clic en "+ Nuevo"
2. Rellenar Nombre e Importe (negativo para gastos, positivo para ingresos)
3. Seleccionar Fecha, Tipo y Cuenta (opcionales pero recomendados)
4. Marcar Pagado si ya está confirmado
5. Activar No contar para excluirlo de estadísticas (útil para gastos futuros aún inciertos)
6. Opcionalmente: activar Compartido para dividir el gasto con alguien. Rellenar "con quién" y elegir entre "dividido entre N personas" o "mi parte es X€"
7. Opcionalmente añadir notas y archivos adjuntos
8. Botones en la parte inferior:
   - Cancelar: cierra sin guardar
   - Crear varios: crea el mismo movimiento en múltiples fechas (ver 3.2)
   - Guardar: crea el movimiento único

### 3.2 Crear varios movimientos de golpe ("Crear varios")

Ideal para financiaciones a plazos, pagos escalonados, etc.

1. Rellenar el formulario de nuevo movimiento (nombre, importe, tipo…)
2. Clic en "Crear varios" (entre Cancelar y Guardar)
3. Elegir tipo de repetición: Diario, Semanal, Mensual por día, Mensual por semana
4. Configurar la fecha del primer movimiento
5. Indicar cuántos movimientos crear en total
6. Activar opcionalmente "Numerar pagos en el nombre" → añade "1/N", "2/N"… al nombre
7. La vista previa muestra los primeros movimientos con fechas y nombres resultantes
8. Clic en "Crear N movimientos"

Ejemplo: financiación de 500€ en 5 pagos mensuales el día 15:
→ Nombre "Financiación TV" · Importe -100 · Mensual (día) el 15 · Cantidad 5 · Numerar pagos activado
→ Crea "Financiación TV 1/5" el 15 enero, "Financiación TV 2/5" el 15 febrero, etc.

Diferencia con las recurrencias de plantillas: "Crear varios" es un proceso puntual, sin plantilla. Las recurrencias de plantillas son para gastos que se repiten indefinidamente.

### 3.3 Editar un movimiento

- Edición inline: clic en cualquier celda de la tabla (excepto el nombre) → edita ese campo directamente → botón ✓ para confirmar
- Modal completo: clic en el nombre del movimiento → edita todos los campos, adjunta archivos, duplica o elimina
- Menú contextual: clic derecho en cualquier movimiento → Duplicar, Eliminar

### 3.4 Edición masiva

1. Activar checkboxes de las filas a editar. El checkbox del encabezado selecciona todos los visibles
2. Barra de acciones → "Modificar campo"
3. Elegir el campo: Nombre, Importe, Tipo, Cuenta, Fecha, Fecha banco, Pagado, No contar, Notas
4. Introducir el nuevo valor y "Aplicar"

Ejemplo: marcar como pagados todos los movimientos de enero:
→ Filtrar enero → checkbox encabezado → Modificar campo → Pagado → Sí → Aplicar

### 3.5 Marcar un gasto como compartido

1. Abrir un movimiento (botón + Nuevo o clic en el nombre para editar)
2. Activar el toggle "Compartido"
3. Aparecen los campos:
   - "Compartido con": nombre de la persona (texto libre)
   - "Dividido entre N personas" (ej. 2 para la mitad) O "Mi parte exacta en €"
4. Guardar. El movimiento aparece en la tabla con una etiqueta que muestra "X€ tuyo" o "1/N"

El importe total del movimiento sigue siendo el gasto completo (para el seguimiento de la cuenta). La información de compartido es solo informativa/visual.

### 3.6 Crear una plantilla

1. Movimientos → clic en "+ Nuevo" → clic en el icono de plantillas (arriba a la derecha del panel)
2. Clic en "+ Nueva plantilla"
3. Rellenar la etiqueta (nombre corto) y el resto de campos del movimiento
4. En el nombre puedes usar {mes} para insertar el mes actual al crear el movimiento
5. Elegir si Fecha y Fecha banco se rellenan solas como "hoy" o se dejan en blanco
6. Guardar

### 3.7 Configurar una recurrencia

1. En la lista de plantillas, clic en el icono de calendario de la plantilla
2. Elegir tipo: Diaria (cada N días), Semanal (marcar días), Mensual (día), Mensual (semana)
3. Establecer la fecha de inicio
4. Elegir modo: Auto-crear (automático al abrir la app) o Creación masiva (N ocurrencias ahora)
5. Guardar

Ejemplo — alquiler el día 5 de cada mes:
→ Tipo Mensual (día) → día 5, cada 1 mes → Auto-crear

Ejemplo — primer viernes de cada mes:
→ Tipo Mensual (semana) → "el primer Viernes de cada mes"

Ejemplo — todos los lunes:
→ Tipo Semanal → marcar Lunes → Auto-crear

### 3.8 Crear un tipo de movimiento

1. Configuración → sección "Tipos de movimiento y Grupos"
2. "+ Nuevo tipo" → nombre, color, grupo al que pertenece
3. Opcionalmente asignar cuenta vinculada (los movimientos de ese tipo afectarán al saldo de esa cuenta)
4. Guardar

Para crear un grupo: mismo apartado → "+ Nuevo grupo" → nombre → guardar.

### 3.9 Crear una cuenta bancaria

1. Configuración → sección "Cuentas" → "+ Nueva cuenta"
2. Nombre, color, icono y saldo inicial (el saldo que tenía cuando empezaste a usar Caulky)
3. Guardar

Al eliminar una cuenta con movimientos de ahorro asociados: elegir entre borrar los movimientos o convertirlos en gastos sin cuenta.

### 3.10 Configurar un fondo de inversión

1. Configuración → crear un tipo de movimiento para las compras del fondo (ej. "Compra MSCI World")
2. Ir a Inversiones → "+ Nuevo fondo"
3. Nombre, ticker de Yahoo Finance (ej. "IWDA.AS", "0P0000XMVJ.F"), vincular al tipo del paso 1
4. Guardar
5. Cada aportación = un movimiento con ese tipo (importe negativo, marcado como Pagado)
6. En la lista de compras → botón "Obtener" → busca el precio histórico en Yahoo Finance
7. Icono de refresco del fondo → actualiza el precio actual

### 3.11 Crear un gráfico personalizado

1. Gráficos → "+ Añadir gráfico"
2. Elegir tipo: Columnas, Apilado, Líneas, Área, Donut o Mixto
3. Eje X: Mes, Año, o Ninguno (dato único acumulado)
4. Desglose: Ninguno (una serie), Grupo, Tipo, o Cuenta
5. Signo: Todos, Solo gastos (negativos), Solo ingresos (positivos)
6. Métrica: suma de importes o número de movimientos
7. Opcionalmente filtros avanzados (tipo, cuenta, rango de fechas…)
8. Guardar

Ejemplos:
- Gasto mensual en supermercado: Columnas · Eje X Mes · Desglose Ninguno · Solo gastos · Filtro Tipo = "Supermercado"
- Todos los gastos por categoría: Apilado · Eje X Mes · Desglose Grupo · Solo gastos
- Evolución del saldo de cuentas: Líneas · Eje X Mes · Desglose Cuenta · Todos

### 3.12 Crear un presupuesto

1. Presupuestos → "+ Nuevo presupuesto"
2. Nombre descriptivo (ej. "Alimentación mensual")
3. Vincular uno o varios tipos de movimiento
4. Elegir periodo: Mensual, Semanal, Anual o Personalizado
5. Establecer el importe límite
6. Guardar

Para cambiar el importe sin perder historial: abrir presupuesto → "Nueva versión" → nuevo importe y fecha efectiva.

### 3.13 Importar desde Excel

1. Importar Excel → subir fichero .xlsx
2. Mapear columnas del Excel a campos de Caulky (Fecha, Nombre, Importe, Fecha banco, Tipo, Notas)
3. Mapear categorías del Excel a tipos de movimiento de Caulky
4. Previsualizar → simular → importar definitivo

---

## 4. Vistas de Movimientos

### Vista Tabla
- Columnas configurables: mostrar/ocultar, reordenar arrastrando el encabezado, redimensionar el borde
- Ordenación: clic en el encabezado de columna
- Filtros avanzados: rango de fechas, importe mín/máx, tipo(s), cuenta(s), estado pagado, no contar, texto libre
- Filtros favoritos: guardar combinaciones de filtros con nombre para reutilizarlos
- Edición inline: clic en una celda de fila para editar ese campo directamente
- Modal completo: clic en el nombre del movimiento

### Vista Calendario
- Toggle Fecha / Fecha banco: elige qué campo posiciona los movimientos en el calendario
- Drag & drop: arrastra un movimiento a otro día para cambiar su fecha
- Suma diaria en cada celda (verde si positivo, rojo si negativo)

### Vista Kanban
- Movimientos agrupados por tipo de movimiento con totales
- Grupos expandibles y contraíbles

---

## 5. Cuentas (/cuentas)

Página de analítica de saldos de cuentas. Muestra datos históricos de todas las cuentas.

### Tarjetas de resumen (cabecera)
- Saldo total de todas las cuentas combinado
- Tarjeta por cada cuenta: saldo actual, saldo inicial, variación total desde el inicio

### Filtro de año
- Botones en la cabecera para filtrar la vista por año concreto o ver "Todo" el historial

### Gráfico de evolución del saldo
- Selector líneas / apilado (botón en la esquina del gráfico)
- Líneas: una línea por cuenta, muestra la evolución del saldo mes a mes
- Apilado: área apilada que muestra el saldo total y la contribución de cada cuenta

### Gráfico de variación mensual
- Barras que muestran cuánto ha cambiado el saldo de cada cuenta cada mes
- Barras positivas = el saldo subió ese mes; negativas = bajó

### Gráfico de distribución
- Donut/circular que muestra el porcentaje del saldo total que corresponde a cada cuenta

---

## 6. Comparaciones (/comparaciones)

Permite comparar dos años entre sí. Muy útil para ver si gastas más o menos que el año anterior.

### Controles principales

**Tipo de gráfico:**
- Gastos por categoría: desglose de gastos por grupo, mes a mes
- Total de gastos: línea/barra/área del total de gastos cada mes
- Ingresos: total de ingresos cada mes
- Balance neto: ingresos - gastos cada mes
- Distribución: qué porcentaje va a cada categoría (donut)

**Tipo de visualización:**
- Línea, Barra o Área (no disponible para Distribución)

**Modo de vista:**
- Lado a lado: dos gráficos independientes con el mismo eje Y para comparar visualmente
- Superpuesto: los datos de ambos años en un mismo gráfico (A en azul, B en naranja)

**Periodo:**
- Año completo: todos los meses del año seleccionado
- Mes concreto: muestra los datos de ese mes específico (para tipo Distribución)

**Años A y B:**
- Se seleccionan con botones. El rango disponible es desde 2019 hasta el año actual.
- Solo aparecen los años que tienen datos.

### Cómo leer el gráfico
- En modo Lado a lado: los ejes Y son iguales (misma escala) para que la comparación sea visual directamente
- En modo Superpuesto: Año A aparece en azul, Año B en naranja; el tooltip muestra ambos valores
- Los ceros no aparecen en los tooltips

---

## 7. Finanzas del Año (/annual)

Tabla resumen anual solo lectura. Filas = grupos y tipos de movimiento. Columnas = 12 meses + total anual + media mensual.

- Los valores cero aparecen como "—" para facilitar la lectura
- Selector de año en la parte superior
- Ideal para detectar variaciones o meses atípicos en cada categoría

---

## 8. Dashboard (/)

Página de inicio personalizable con widgets de estadísticas, gráficos y presupuestos.

### Selector de mes/año
El pill junto al título muestra el mes y año. Clic en él para abrir el selector y navegar a cualquier mes pasado. Los widgets mensuales (ingresos del mes, gastos del mes, balance neto, presupuestos del backend) reflejan el periodo seleccionado. El pill se vuelve azul cuando no estás en el mes actual.

### Editar el Dashboard
Botón "Editar" (o Configuración → Editar Dashboard). En modo edición:
- Arrastrar widgets para reordenarlos
- Handles de resize en los bordes para cambiar tamaño
- Botones "+ Estadística", "+ Gráfico", "+ Presupuesto" para añadir widgets
- "Restablecer" vuelve al layout por defecto
- "Guardar" confirma los cambios

### Widgets de Estadística
Al pulsar "+ Estadística" aparecen tres secciones:
- Métricas: Ingresos del año/mes · Gastos del año/mes · Balance neto del año/mes (verde si positivo, rojo si negativo)
- Cuentas: un widget por cada cuenta bancaria configurada, con su saldo actual
- Paneles especiales: "Cuenta de uso" (cuenta principal) · "Panel de ahorro" (cíclico entre cuentas de ahorro)

### Widgets de Presupuesto
- "Todos los presupuestos": tarjeta combinada con todos los presupuestos activos
- Presupuestos individuales: barra de progreso con gasto real vs límite

---

## 9. Presupuestos (/budgets)

### Crear un presupuesto
1. Presupuestos → "+ Nuevo presupuesto"
2. Nombre descriptivo
3. Vincular uno o varios tipos de movimiento
4. Periodo: Mensual, Semanal, Anual o Personalizado (rango de fechas fijo)
5. Importe límite
6. Opcionalmente: fecha de inicio de seguimiento (para ignorar periodos anteriores)

### Cambiar el importe sin perder historial
Abrir presupuesto → "Nueva versión" → nuevo importe y fecha efectiva. Los periodos anteriores mantienen el importe anterior.

### Visualización de cada presupuesto
- Barra de progreso del periodo actual (gasto real vs límite)
- Histórico de periodos pasados
- Gráfico de líneas con la evolución temporal

---

## 10. Inversiones (/inversiones)

Oculta por defecto. Se activa en Configuración → Apariencia (toggle "Mostrar inversiones") o en Configuración → Navegación.

### Configurar un fondo nuevo
1. Configuración → crear un tipo de movimiento para las compras (ej. "Compra MSCI World")
2. Inversiones → "+ Nuevo fondo"
3. Nombre, ticker de Yahoo Finance (ej. IWDA.AS, 0P0000XMVJ.F), vincular al tipo
4. Cada aportación = movimiento con ese tipo (importe negativo), marcado Pagado

### Columnas de la lista de compras
- Fecha: fecha banco del movimiento (o fecha normal si no tiene)
- Importe: euros invertidos en esa compra
- Precio/part.: precio por participación en la fecha de compra (botón "Obtener" para buscar en Yahoo Finance)
- Participaciones: importe ÷ precio de compra
- Valor actual: importe × (precio actual ÷ precio de compra)
- Rentabilidad: (precio actual − precio compra) ÷ precio compra × 100%

Clic en una fila → modal de detalle del movimiento. Clic en el valor actual del fondo → sobreescribir manualmente.

---

## 11. Importar Excel (/import)

Asistente de 4 pasos para importar movimientos desde un fichero .xlsx.

1. Archivo: subir el .xlsx (arrastrar al área o clic para seleccionar)
2. Columnas: mapear cada columna del Excel al campo de Caulky correspondiente (Fecha, Nombre, Importe, Fecha banco, Tipo, Notas). Vista previa del resultado
3. Tipos: mapear categorías del Excel a tipos de movimiento de Caulky (si el Excel tiene una columna de categorías en texto)
4. Importar: previsualización completa → simulación → importación definitiva

---

## 12. Configuración (/settings)

### Apariencia
- Tema: toggle Modo oscuro / Modo claro
- Moneda: símbolo junto a los importes (€, $, £…)
- Formato de fecha: DD/MM/AAAA, MM/DD/AAAA o AAAA-MM-DD
- Tamaño de la interfaz: ajuste de zoom de la UI en porcentaje (botones −/+)
- Mostrar inversiones: activa/desactiva la sección Inversiones en el menú

### Navegación
Controla qué páginas aparecen en el menú lateral y en qué orden.
- Toggle para mostrar/ocultar cada página
- Flechas arriba/abajo para reordenar

### Dashboard
Botón directo "Editar Dashboard" para entrar en modo edición del layout.

### Cuentas
- Crear, editar y eliminar cuentas bancarias
- Al eliminar una cuenta con movimientos: elegir entre borrarlos o convertirlos en gastos sin cuenta

### Tipos de movimiento y Grupos
- CRUD completo de tipos y grupos
- La cuenta vinculada en un tipo indica que los movimientos de ese tipo afectan al saldo de esa cuenta

### Copia de seguridad
- Exportar backup: JSON con todos los datos (movimientos, tipos, grupos, cuentas, presupuestos, fondos)
- Importar backup: restaura desde un fichero JSON ⚠️ Sobreescribe todos los datos actuales

### Idiomas
Permite instalar archivos de idioma personalizados que traducen toda la interfaz de la app.
- Instalar idioma (.js): botón para subir un archivo .js con el formato de idioma
- Toggle para activar cada idioma instalado
- Botón de papelera para eliminarlo
- "Ejemplo": descarga un archivo de idioma de ejemplo (inglés simplificado) listo para editar
- "Guía IA": descarga la guía completa de creación de idiomas en formato .md

**Formato de archivo de idioma (.js):**
\`\`\`js
export default {
  name: 'Português',      // Nombre del idioma (obligatorio)
  flag: '🇵🇹',           // Emoji de bandera (opcional)
  author: 'Tu nombre',   // Autor (opcional)
  version: '1.0',        // Versión (opcional)

  // Traducciones: clave → valor traducido
  'nav.dashboard':    'Dashboard',
  'nav.movements':    'Movimentos',
  'nav.accounts':     'Contas',
  'common.save':      'Guardar',
  'common.cancel':    'Cancelar',
  // ... resto de claves
}
\`\`\`

El archivo se instala como módulo ES. Solo necesitas incluir las claves que quieras sobreescribir; las que no estén se heredan del español. Cada vez que el usuario cambia de idioma, la app se recarga aplicando las traducciones del archivo.

### Plugins
Permite instalar plugins JavaScript que modifican la interfaz de la app.
- Instalar plugin (.js): botón para subir un archivo .js con el formato de plugin
- Toggle para activar/desactivar cada plugin sin desinstalarlo
- Botón de papelera para eliminar un plugin
- "Ejemplo": descarga un plugin de ejemplo que cambia la fuente del texto
- "Guía IA": descarga la guía completa de desarrollo de plugins en formato .md

### Zona de peligro — Restablecer sistema
Borra todos los datos (movimientos, tipos, grupos, cuentas, presupuestos, fondos) y deja la app como nueva. Requiere escribir DELETE para confirmar. Irreversible.

---

## 13. Plugins

Los plugins son archivos .js que se instalan desde Configuración → Plugins. Se ejecutan en el navegador y pueden modificar la interfaz visualmente.

Formato básico:
\`\`\`js
// ==Plugin==
// @name        Nombre del plugin
// @description Descripción breve
// @version     1.0
// ==/Plugin==

// Código que se ejecuta al activar el plugin

function __cleanup() {
  // Deshace todo lo que hizo el código de arriba
  // Se llama al desactivar o eliminar el plugin
}
\`\`\`

Los plugins se guardan en localStorage y se reejecutan en cada carga de página. Para desarrollar plugins, descarga la "Guía IA" desde Configuración → Plugins.

---

## 14. Atajos y trucos

- Clic derecho en cualquier movimiento → menú rápido: Duplicar, Eliminar
- Arrastrar en el calendario → cambia la fecha del movimiento sin abrir el modal
- Clic en el nombre en la tabla → modal de detalle completo con todos los campos
- Selección múltiple + "Modificar campo" → edición masiva de cualquier campo
- "No contar" excluye de todo (estadísticas, gráficos, presupuestos, inversiones). Úsalo para gastos futuros aún inciertos o para separar traspasos entre cuentas propias
- Movimientos con fecha banco futura no computan en inversiones hasta que llegue esa fecha
- Plantillas con Auto-crear: si llevas días sin abrir la app, al abrirla se crean todos los pendientes de golpe
- {mes} en el nombre de plantilla: se sustituye por el mes actual al crear el movimiento
- Las preferencias de columnas (orden, ancho, visibilidad) y los filtros favoritos persisten entre sesiones
- El zoom de la UI se puede ajustar en Configuración → Apariencia para pantallas grandes o pequeñas
- El menú lateral es completamente personalizable en Configuración → Navegación

---

## 15. Preguntas frecuentes

P: ¿Cómo creo un movimiento recurrente todos los lunes?
R: Crea una plantilla → icono calendario → Semanal → marca Lunes → Auto-crear → Guardar.

P: ¿Cómo añado un tipo de gasto nuevo?
R: Configuración → Tipos de movimiento y Grupos → "+ Nuevo tipo".

P: ¿El saldo de la cuenta es automático?
R: Sí. Saldo actual = Saldo inicial + suma de todos los movimientos pagados asociados a esa cuenta.

P: ¿Cómo comparo cuánto gasté este año vs el año pasado?
R: Ir a Comparaciones → elegir Año A y Año B → seleccionar tipo "Total de gastos" o "Gastos por categoría".

P: ¿Cómo veo la evolución del saldo de mis cuentas a lo largo del tiempo?
R: Ir a Cuentas → el gráfico de evolución muestra el saldo mes a mes de todas las cuentas.

P: ¿Puedo cambiar el límite de un presupuesto sin perder el historial?
R: Sí. Abrir presupuesto → "Nueva versión" → nuevo importe y fecha efectiva.

P: ¿Cómo marco varios movimientos como pagados de golpe?
R: Vista Tabla → seleccionar con checkboxes → Modificar campo → Pagado → Sí → Aplicar.

P: ¿Qué significa "No contar"?
R: El movimiento queda fuera de estadísticas, gráficos, presupuestos e inversiones. Solo aparece en la tabla. Úsalo para gastos futuros que pueden ocurrir o no, o para traspasos entre tus propias cuentas que no quieres que distorsionen el balance.

P: ¿Cómo divido un gasto con otra persona?
R: Al crear o editar el movimiento, activa el toggle "Compartido". Indica con quién, y elige entre dividir entre N personas o poner tu parte exacta en euros.

P: ¿Cómo oculto la sección Inversiones del menú?
R: Configuración → Navegación → toggle de Inversiones (o Apariencia → Mostrar inversiones).

P: ¿Cómo reordeno las páginas del menú lateral?
R: Configuración → Navegación → flechas arriba/abajo para reordenar cada página.

P: ¿Cómo obtengo el precio histórico de una compra de fondo?
R: Inversiones → expandir el fondo → fila de la compra → botón "Obtener".

P: ¿Cómo exporto todos mis datos?
R: Configuración → Copia de seguridad → Exportar backup.

P: ¿Cómo instalo un plugin?
R: Configuración → Plugins → "Instalar plugin (.js)" → seleccionar el archivo .js.
`

// ── Section IDs for TOC ────────────────────────────────────────────────────────

const SECTION_IDS = ['ia','intro','conceptos','movimientos','plantillas','graficos','cuentas','comparaciones','annual','dashboard','inversiones','presupuestos','importar','config','plugins','trucos'] as const

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

function FieldTable({ rows }: { rows: [string, string][] }) {
  return (
    <div className="overflow-x-auto mb-5">
      <table className="w-full text-sm border-collapse">
        <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
          {rows.map(([field, desc]) => (
            <tr key={field} className="bg-white dark:bg-gray-900">
              <td className="py-2.5 pr-4 pl-4 font-mono font-medium text-gray-700 dark:text-gray-200 whitespace-nowrap w-48">{field}</td>
              <td className="py-2.5 pr-4 text-gray-500 dark:text-gray-400">{desc}</td>
            </tr>
          ))}
        </tbody>
      </table>
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

      {/* ── Left TOC ── */}
      <aside className="hidden lg:flex flex-col w-56 shrink-0 overflow-y-auto border-r border-gray-100 dark:border-gray-800 py-8 px-4">
        <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500 mb-3 px-1">{t('docs.toc')}</p>
        <nav className="flex-1 space-y-0.5">
          {SECTION_IDS.map(id => (
            <button
              key={id}
              onClick={() => scrollTo(id)}
              className="block w-full text-left text-sm py-2 px-3 rounded-lg text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              {t(`docs.toc.${id}`)}
            </button>
          ))}
        </nav>
      </aside>

      {/* ── Right content ── */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl px-6 md:px-10 py-10">

          <div className="mb-10">
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">{t('docs.title')}</h1>
            <p className="text-base text-gray-500 dark:text-gray-400 mt-2">{t('docs.subtitle')}</p>
          </div>

          {/* ── 0. Usar con IA ─────────────────────────────────────────── */}
          <H2 id="ia">{t('docs.useWithAI')}</H2>
          <P>{t('docs.useWithAIDesc')}</P>

          <div className="my-6">
            <button
              onClick={downloadMd}
              className="inline-flex items-center gap-2.5 px-5 py-3 bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-base font-semibold rounded-xl hover:bg-gray-700 dark:hover:bg-gray-100 transition-colors"
            >
              <Download className="w-5 h-5" />
              {t('docs.download')}
            </button>
          </div>

          <P>{t('docs.withFileAsk')}</P>
          <UL>
            <LI>{t('docs.q1')}</LI>
            <LI>{t('docs.q2')}</LI>
            <LI>{t('docs.q3')}</LI>
            <LI>{t('docs.q4')}</LI>
            <LI>{t('docs.q5')}</LI>
            <LI>{t('docs.q6')}</LI>
          </UL>
          <Tip>{t('docs.useWithAITip')}</Tip>

          <Divider />

          {/* ── 1. Introducción ────────────────────────────────────────── */}
          <H2 id="intro">{t('docs.intro.h2')}</H2>
          <P>{t('docs.intro.p1')}</P>
          <UL>
            <LI>{t('docs.intro.li1')}</LI>
            <LI>{t('docs.intro.li2')}</LI>
            <LI>{t('docs.intro.li3')}</LI>
            <LI>{t('docs.intro.li4')}</LI>
            <LI>{t('docs.intro.li5')}</LI>
            <LI>{t('docs.intro.li6')}</LI>
            <LI>{t('docs.intro.li7')}</LI>
            <LI>{t('docs.intro.li8')}</LI>
            <LI>{t('docs.intro.li9')}</LI>
            <LI>{t('docs.intro.li10')}</LI>
            <LI>{t('docs.intro.li11')}</LI>
          </UL>

          <Divider />

          {/* ── 2. Conceptos clave ─────────────────────────────────────── */}
          <H2 id="conceptos">{t('docs.cpt.h2')}</H2>

          <H3>{t('docs.cpt.movTitle')}</H3>
          <P>{t('docs.cpt.movP')}</P>
          <FieldTable rows={[
            [t('docs.cpt.fNombre'),        t('docs.cpt.fNombreD')],
            [t('docs.cpt.fImporte'),       t('docs.cpt.fImporteD')],
            [t('docs.cpt.fFecha'),         t('docs.cpt.fFechaD')],
            [t('docs.cpt.fFechaBanco'),    t('docs.cpt.fFechaBancoD')],
            [t('docs.cpt.fTipo'),          t('docs.cpt.fTipoD')],
            [t('docs.cpt.fCuenta'),        t('docs.cpt.fCuentaD')],
            [t('docs.cpt.fPagado'),        t('docs.cpt.fPagadoD')],
            [t('docs.cpt.fNoContar'),      t('docs.cpt.fNoContarD')],
            [t('docs.cpt.fNotas'),         t('docs.cpt.fNotasD')],
            [t('docs.cpt.fAdjuntos'),      t('docs.cpt.fAdjuntosD')],
            [t('docs.cpt.fCompartido'),    t('docs.cpt.fCompartidoD')],
            [t('docs.cpt.fCompartidoCon'), t('docs.cpt.fCompartidoConD')],
            [t('docs.cpt.fDividido'),      t('docs.cpt.fDivididoD')],
            [t('docs.cpt.fMiParte'),       t('docs.cpt.fMiParteD')],
          ]} />

          <H3>{t('docs.cpt.typesTitle')}</H3>
          <P>{t('docs.cpt.typesP')}</P>

          <H3>{t('docs.cpt.groupsTitle')}</H3>
          <P>{t('docs.cpt.groupsP')}</P>

          <H3>{t('docs.cpt.accountsTitle')}</H3>
          <P>{t('docs.cpt.accountsP')}</P>

          <H3>{t('docs.cpt.budgetsTitle')}</H3>
          <P>{t('docs.cpt.budgetsP')}</P>

          <H3>{t('docs.cpt.templatesTitle')}</H3>
          <P>
            {t('docs.cpt.templatesP').split('{mes}')[0]}<Code>{'{mes}'}</Code>
            {t('docs.cpt.templatesP').split('{mes}')[1]?.split('{año}')[0]}<Code>{'{año}'}</Code>
            {t('docs.cpt.templatesP').split('{año}')[1]?.split('{mesfecha}')[0]}<Code>{'{mesfecha}'}</Code>
            {t('docs.cpt.templatesP').split('{mesfecha}')[1]?.split('{mesfechabanco}')[0]}<Code>{'{mesfechabanco}'}</Code>
            {t('docs.cpt.templatesP').split('{mesfechabanco}')[1]}
          </P>

          <H3>{t('docs.cpt.fundsTitle')}</H3>
          <P>{t('docs.cpt.fundsP')}</P>

          <Divider />

          {/* ── 3. Movimientos ─────────────────────────────────────────── */}
          <H2 id="movimientos">{t('docs.mov.h2')}</H2>
          <P>{t('docs.mov.p1')}</P>

          <H3>{t('docs.mov.addTitle')}</H3>
          <Steps>
            <Step n={1}>{t('docs.mov.s1')}</Step>
            <Step n={2}>{t('docs.mov.s2')}</Step>
            <Step n={3}>{t('docs.mov.s3')}</Step>
            <Step n={4}>{t('docs.mov.s4')}</Step>
            <Step n={5}>{t('docs.mov.s5')}</Step>
            <Step n={6}>{t('docs.mov.s6')}</Step>
            <Step n={7}>
              {t('docs.mov.s7')}
              <UL>
                <LI>{t('docs.mov.s7li1')}</LI>
                <LI>{t('docs.mov.s7li2')}</LI>
                <LI>{t('docs.mov.s7li3')}</LI>
              </UL>
            </Step>
          </Steps>

          <H3>{t('docs.mov.bulkTitle')}</H3>
          <P>{t('docs.mov.bulkP')}</P>
          <Steps>
            <Step n={1}>{t('docs.mov.bs1')}</Step>
            <Step n={2}>{t('docs.mov.bs2')}</Step>
            <Step n={3}>{t('docs.mov.bs3')}</Step>
            <Step n={4}>{t('docs.mov.bs4')}</Step>
            <Step n={5}>{t('docs.mov.bs5')}</Step>
            <Step n={6}>{t('docs.mov.bs6')}</Step>
            <Step n={7}>{t('docs.mov.bs7')}</Step>
            <Step n={8}>{t('docs.mov.bs8')}</Step>
          </Steps>
          <Example label={t('docs.mov.exFinLabel')}>{t('docs.mov.exFin')}</Example>
          <Tip>{t('docs.mov.bulkTip')}</Tip>

          <H3>{t('docs.mov.editTitle')}</H3>
          <P>{t('docs.mov.editP1')}</P>
          <P>{t('docs.mov.editP2')}</P>
          <P>{t('docs.mov.editP3')}</P>

          <H3>{t('docs.mov.massTitle')}</H3>
          <Steps title={t('docs.mov.massStepTitle')}>
            <Step n={1}>{t('docs.mov.ms1')}</Step>
            <Step n={2}>{t('docs.mov.ms2')}</Step>
            <Step n={3}>{t('docs.mov.ms3')}</Step>
            <Step n={4}>{t('docs.mov.ms4')}</Step>
          </Steps>
          <Example label={t('docs.mov.massExLabel')}>{t('docs.mov.massEx')}</Example>

          <H3>{t('docs.mov.tableTitle')}</H3>
          <UL>
            <LI>{t('docs.mov.tli1')}</LI>
            <LI>{t('docs.mov.tli2')}</LI>
            <LI>{t('docs.mov.tli3')}</LI>
            <LI>{t('docs.mov.tli4')}</LI>
          </UL>

          <H3>{t('docs.mov.calTitle')}</H3>
          <UL>
            <LI>{t('docs.mov.cli1')}</LI>
            <LI>{t('docs.mov.cli2')}</LI>
            <LI>{t('docs.mov.cli3')}</LI>
          </UL>

          <H3>{t('docs.mov.kanbanTitle')}</H3>
          <P>{t('docs.mov.kanbanP')}</P>

          <Divider />

          {/* ── 4. Plantillas y recurrencias ───────────────────────────── */}
          <H2 id="plantillas">{t('docs.tpl.h2')}</H2>

          <H3>{t('docs.tpl.createTitle')}</H3>
          <Steps>
            <Step n={1}>{t('docs.tpl.s1')}</Step>
            <Step n={2}>{t('docs.tpl.s2')}</Step>
            <Step n={3}>{t('docs.tpl.s3')}</Step>
            <Step n={4}>{t('docs.tpl.s4')}</Step>
            <Step n={5}>{t('docs.tpl.s5')}</Step>
            <Step n={6}>{t('docs.tpl.s6')}</Step>
          </Steps>

          <H3>{t('docs.tpl.configTitle')}</H3>
          <Steps>
            <Step n={1}>{t('docs.tpl.cs1')}</Step>
            <Step n={2}>
              {t('docs.tpl.cs2')}
              <UL>
                <LI>{t('docs.tpl.cs2li1')}</LI>
                <LI>{t('docs.tpl.cs2li2')}</LI>
                <LI>{t('docs.tpl.cs2li3')}</LI>
                <LI>{t('docs.tpl.cs2li4')}</LI>
              </UL>
            </Step>
            <Step n={3}>{t('docs.tpl.cs3')}</Step>
            <Step n={4}>
              {t('docs.tpl.cs4')}
              <UL>
                <LI>{t('docs.tpl.cs4li1')}</LI>
                <LI>{t('docs.tpl.cs4li2')}</LI>
              </UL>
            </Step>
            <Step n={5}>{t('docs.tpl.cs5')}</Step>
          </Steps>

          <Example label={t('docs.tpl.ex1Label')}>{t('docs.tpl.ex1')}</Example>
          <Example label={t('docs.tpl.ex2Label')}>{t('docs.tpl.ex2')}</Example>
          <Example label={t('docs.tpl.ex3Label')}>{t('docs.tpl.ex3')}</Example>

          <Note>{t('docs.tpl.note')}</Note>

          <Divider />

          {/* ── 5. Gráficos ────────────────────────────────────────────── */}
          <H2 id="graficos">{t('docs.grf.h2')}</H2>
          <P>{t('docs.grf.p1')}</P>

          <H3>{t('docs.grf.createTitle')}</H3>
          <Steps>
            <Step n={1}>{t('docs.grf.s1')}</Step>
            <Step n={2}>{t('docs.grf.s2')}</Step>
            <Step n={3}>{t('docs.grf.s3')}</Step>
            <Step n={4}>{t('docs.grf.s4')}</Step>
            <Step n={5}>{t('docs.grf.s5')}</Step>
            <Step n={6}>{t('docs.grf.s6')}</Step>
            <Step n={7}>{t('docs.grf.s7')}</Step>
          </Steps>

          <Example label={t('docs.grf.ex1Label')}>{t('docs.grf.ex1')}</Example>
          <Example label={t('docs.grf.ex2Label')}>{t('docs.grf.ex2')}</Example>
          <Example label={t('docs.grf.ex3Label')}>{t('docs.grf.ex3')}</Example>

          <Divider />

          {/* ── 6. Cuentas ─────────────────────────────────────────────── */}
          <H2 id="cuentas">{t('docs.act.h2')}</H2>
          <P>{t('docs.act.p1')}</P>

          <H3>{t('docs.act.summaryTitle')}</H3>
          <P>{t('docs.act.summaryP')}</P>

          <H3>{t('docs.act.yearTitle')}</H3>
          <P>{t('docs.act.yearP')}</P>

          <H3>{t('docs.act.evTitle')}</H3>
          <UL>
            <LI>{t('docs.act.evLi1')}</LI>
            <LI>{t('docs.act.evLi2')}</LI>
          </UL>

          <H3>{t('docs.act.monthTitle')}</H3>
          <P>{t('docs.act.monthP')}</P>

          <H3>{t('docs.act.distTitle')}</H3>
          <P>{t('docs.act.distP')}</P>

          <Tip>{t('docs.act.tip')}</Tip>

          <Divider />

          {/* ── 7. Comparaciones ───────────────────────────────────────── */}
          <H2 id="comparaciones">{t('docs.cmp.h2')}</H2>
          <P>{t('docs.cmp.p1')}</P>

          <H3>{t('docs.cmp.controlsTitle')}</H3>
          <P>{t('docs.cmp.controlsP')}</P>

          <H3>{t('docs.cmp.typesTitle')}</H3>
          <UL>
            <LI>{t('docs.cmp.tLi1')}</LI>
            <LI>{t('docs.cmp.tLi2')}</LI>
            <LI>{t('docs.cmp.tLi3')}</LI>
            <LI>{t('docs.cmp.tLi4')}</LI>
            <LI>{t('docs.cmp.tLi5')}</LI>
          </UL>

          <H3>{t('docs.cmp.vizTitle')}</H3>
          <P>{t('docs.cmp.vizP')}</P>

          <H3>{t('docs.cmp.modeTitle')}</H3>
          <UL>
            <LI>{t('docs.cmp.mLi1')}</LI>
            <LI>{t('docs.cmp.mLi2')}</LI>
          </UL>

          <H3>{t('docs.cmp.periodTitle')}</H3>
          <UL>
            <LI>{t('docs.cmp.pLi1')}</LI>
            <LI>{t('docs.cmp.pLi2')}</LI>
          </UL>

          <Example label={t('docs.cmp.ex1Label')}>{t('docs.cmp.ex1')}</Example>
          <Example label={t('docs.cmp.ex2Label')}>{t('docs.cmp.ex2')}</Example>

          <Divider />

          {/* ── 8. Finanzas del Año ────────────────────────────────────── */}
          <H2 id="annual">{t('docs.ann.h2')}</H2>
          <P>{t('docs.ann.p1')}</P>
          <UL>
            <LI>{t('docs.ann.li1')}</LI>
            <LI>{t('docs.ann.li2')}</LI>
            <LI>{t('docs.ann.li3')}</LI>
            <LI>{t('docs.ann.li4')}</LI>
          </UL>
          <Tip>{t('docs.ann.tip')}</Tip>

          <Divider />

          {/* ── 9. Dashboard ───────────────────────────────────────────── */}
          <H2 id="dashboard">{t('docs.dsh.h2')}</H2>
          <P>{t('docs.dsh.p1')}</P>

          <H3>{t('docs.dsh.selectorTitle')}</H3>
          <P>{t('docs.dsh.selectorP')}</P>

          <H3>{t('docs.dsh.editTitle')}</H3>
          <P>{t('docs.dsh.editP')}</P>
          <UL>
            <LI>{t('docs.dsh.eLi1')}</LI>
            <LI>{t('docs.dsh.eLi2')}</LI>
            <LI>{t('docs.dsh.eLi3')}</LI>
            <LI>{t('docs.dsh.eLi4')}</LI>
            <LI>{t('docs.dsh.eLi5')}</LI>
          </UL>

          <H3>{t('docs.dsh.statsTitle')}</H3>
          <P>{t('docs.dsh.statsP')}</P>
          <UL>
            <LI>{t('docs.dsh.sLi1')}</LI>
            <LI>{t('docs.dsh.sLi2')}</LI>
            <LI>{t('docs.dsh.sLi3')}</LI>
          </UL>
          <Tip>{t('docs.dsh.statsTip')}</Tip>

          <H3>{t('docs.dsh.budgetsTitle')}</H3>
          <UL>
            <LI>{t('docs.dsh.bLi1')}</LI>
            <LI>{t('docs.dsh.bLi2')}</LI>
          </UL>

          <Divider />

          {/* ── 10. Inversiones ────────────────────────────────────────── */}
          <H2 id="inversiones">{t('docs.inv.h2')}</H2>
          <Note>{t('docs.inv.note1')}</Note>
          <Note>{t('docs.inv.note2')}</Note>

          <H3>{t('docs.inv.newTitle')}</H3>
          <Steps>
            <Step n={1}>{t('docs.inv.s1')}</Step>
            <Step n={2}>{t('docs.inv.s2')}</Step>
            <Step n={3}>{t('docs.inv.s3')}</Step>
            <Step n={4}>{t('docs.inv.s4')}</Step>
            <Step n={5}>{t('docs.inv.s5')}</Step>
            <Step n={6}>{t('docs.inv.s6')}</Step>
            <Step n={7}>{t('docs.inv.s7')}</Step>
          </Steps>

          <H3>{t('docs.inv.colsTitle')}</H3>
          <UL>
            <LI>{t('docs.inv.cLi1')}</LI>
            <LI>{t('docs.inv.cLi2')}</LI>
            <LI>{t('docs.inv.cLi3')}</LI>
            <LI>{t('docs.inv.cLi4')}</LI>
            <LI>{t('docs.inv.cLi5')}</LI>
            <LI>{t('docs.inv.cLi6')}</LI>
          </UL>
          <P>{t('docs.inv.colsP')}</P>

          <Divider />

          {/* ── 11. Presupuestos ───────────────────────────────────────── */}
          <H2 id="presupuestos">{t('docs.bgt.h2')}</H2>

          <H3>{t('docs.bgt.createTitle')}</H3>
          <Steps>
            <Step n={1}>{t('docs.bgt.s1')}</Step>
            <Step n={2}>{t('docs.bgt.s2')}</Step>
            <Step n={3}>{t('docs.bgt.s3')}</Step>
            <Step n={4}>{t('docs.bgt.s4')}</Step>
            <Step n={5}>{t('docs.bgt.s5')}</Step>
            <Step n={6}>{t('docs.bgt.s6')}</Step>
          </Steps>

          <H3>{t('docs.bgt.changeTitle')}</H3>
          <Steps>
            <Step n={1}>{t('docs.bgt.cs1')}</Step>
            <Step n={2}>{t('docs.bgt.cs2')}</Step>
            <Step n={3}>{t('docs.bgt.cs3')}</Step>
          </Steps>

          <H3>{t('docs.bgt.vizTitle')}</H3>
          <UL>
            <LI>{t('docs.bgt.vLi1')}</LI>
            <LI>{t('docs.bgt.vLi2')}</LI>
            <LI>{t('docs.bgt.vLi3')}</LI>
          </UL>

          <Divider />

          {/* ── 12. Importar Excel ─────────────────────────────────────── */}
          <H2 id="importar">{t('docs.imp.h2')}</H2>
          <P>{t('docs.imp.p1')}</P>
          <Steps>
            <Step n={1}>{t('docs.imp.s1')}</Step>
            <Step n={2}>{t('docs.imp.s2')}</Step>
            <Step n={3}>{t('docs.imp.s3')}</Step>
            <Step n={4}>{t('docs.imp.s4')}</Step>
          </Steps>

          <Divider />

          {/* ── 13. Configuración ──────────────────────────────────────── */}
          <H2 id="config">{t('docs.cfg.h2')}</H2>

          <H3>{t('docs.cfg.appearTitle')}</H3>
          <UL>
            <LI>{t('docs.cfg.aLi1')}</LI>
            <LI>{t('docs.cfg.aLi2')}</LI>
            <LI>{t('docs.cfg.aLi3')}</LI>
            <LI>{t('docs.cfg.aLi4')}</LI>
          </UL>

          <H3>{t('docs.cfg.navTitle')}</H3>
          <P>{t('docs.cfg.navP')}</P>
          <UL>
            <LI>{t('docs.cfg.nLi1')}</LI>
            <LI>{t('docs.cfg.nLi2')}</LI>
          </UL>

          <H3>{t('docs.cfg.dashTitle')}</H3>
          <P>{t('docs.cfg.dashP')}</P>

          <H3>{t('docs.cfg.typesTitle')}</H3>
          <Steps>
            <Step n={1}>{t('docs.cfg.ts1')}</Step>
            <Step n={2}>{t('docs.cfg.ts2')}</Step>
            <Step n={3}>{t('docs.cfg.ts3')}</Step>
            <Step n={4}>{t('docs.cfg.ts4')}</Step>
          </Steps>

          <H3>{t('docs.cfg.acctTitle')}</H3>
          <Steps>
            <Step n={1}>{t('docs.cfg.as1')}</Step>
            <Step n={2}>{t('docs.cfg.as2')}</Step>
            <Step n={3}>{t('docs.cfg.as3')}</Step>
          </Steps>
          <Note>{t('docs.cfg.acctNote')}</Note>

          <H3>{t('docs.cfg.backupTitle')}</H3>
          <UL>
            <LI>{t('docs.cfg.bLi1')}</LI>
            <LI>{t('docs.cfg.bLi2')}</LI>
          </UL>

          <H3>{t('docs.cfg.dangerTitle')}</H3>
          <P>{t('docs.cfg.dangerP')}</P>

          <Divider />

          {/* ── 14. Plugins ────────────────────────────────────────────── */}
          <H2 id="plugins">{t('docs.plg.h2')}</H2>
          <P>{t('docs.plg.p1')}</P>

          <H3>{t('docs.plg.installTitle')}</H3>
          <Steps>
            <Step n={1}>{t('docs.plg.is1')}</Step>
            <Step n={2}>{t('docs.plg.is2')}</Step>
            <Step n={3}>{t('docs.plg.is3')}</Step>
          </Steps>

          <H3>{t('docs.plg.manageTitle')}</H3>
          <UL>
            <LI>{t('docs.plg.mLi1')}</LI>
            <LI>{t('docs.plg.mLi2')}</LI>
            <LI>{t('docs.plg.mLi3')}</LI>
          </UL>

          <H3>{t('docs.plg.resourcesTitle')}</H3>
          <UL>
            <LI>{t('docs.plg.rLi1')}</LI>
            <LI>{t('docs.plg.rLi2')}</LI>
          </UL>

          <Tip>{t('docs.plg.tip')}</Tip>

          <Divider />

          {/* ── 15. Atajos y trucos ────────────────────────────────────── */}
          <H2 id="trucos">{t('docs.trk.h2')}</H2>
          <UL>
            <LI>{t('docs.trk.li1')}</LI>
            <LI>{t('docs.trk.li2')}</LI>
            <LI>{t('docs.trk.li3')}</LI>
            <LI>{t('docs.trk.li4')}</LI>
            <LI>{t('docs.trk.li5')}</LI>
            <LI>{t('docs.trk.li6')}</LI>
            <LI>{t('docs.trk.li7')}</LI>
            <LI>{t('docs.trk.li8')}</LI>
            <LI>{t('docs.trk.li9')}</LI>
            <LI>{t('docs.trk.li10')}</LI>
          </UL>

          <H3>{t('docs.faq.h3')}</H3>
          <QA q={t('docs.faq.q1')}>{t('docs.faq.a1')}</QA>
          <QA q={t('docs.faq.q2')}>{t('docs.faq.a2')}</QA>
          <QA q={t('docs.faq.q3')}>{t('docs.faq.a3')}</QA>
          <QA q={t('docs.faq.q4')}>{t('docs.faq.a4')}</QA>
          <QA q={t('docs.faq.q5')}>{t('docs.faq.a5')}</QA>
          <QA q={t('docs.faq.q6')}>{t('docs.faq.a6')}</QA>
          <QA q={t('docs.faq.q7')}>{t('docs.faq.a7')}</QA>
          <QA q={t('docs.faq.q8')}>{t('docs.faq.a8')}</QA>
          <QA q={t('docs.faq.q9')}>{t('docs.faq.a9')}</QA>
          <QA q={t('docs.faq.q10')}>{t('docs.faq.a10')}</QA>
          <QA q={t('docs.faq.q11')}>{t('docs.faq.a11')}</QA>
          <QA q={t('docs.faq.q12')}>{t('docs.faq.a12')}</QA>
          <QA q={t('docs.faq.q13')}>{t('docs.faq.a13')}</QA>

          <div className="pb-12" />
        </div>
      </div>
    </div>
  )
}

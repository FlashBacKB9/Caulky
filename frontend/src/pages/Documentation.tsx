import { Download } from 'lucide-react'

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

const SECTIONS = [
  { id: 'ia',            label: 'Usar con IA' },
  { id: 'intro',         label: 'Introducción' },
  { id: 'conceptos',     label: 'Conceptos clave' },
  { id: 'movimientos',   label: 'Movimientos' },
  { id: 'plantillas',    label: 'Plantillas y recurrencias' },
  { id: 'graficos',      label: 'Gráficos' },
  { id: 'cuentas',       label: 'Cuentas' },
  { id: 'comparaciones', label: 'Comparaciones' },
  { id: 'annual',        label: 'Finanzas del Año' },
  { id: 'dashboard',     label: 'Dashboard' },
  { id: 'inversiones',   label: 'Inversiones' },
  { id: 'presupuestos',  label: 'Presupuestos' },
  { id: 'importar',      label: 'Importar Excel' },
  { id: 'config',        label: 'Configuración' },
  { id: 'plugins',       label: 'Plugins' },
  { id: 'trucos',        label: 'Atajos y trucos' },
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

      {/* ── Right content ── */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl px-6 md:px-10 py-10">

          <div className="mb-10">
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Documentación</h1>
            <p className="text-base text-gray-500 dark:text-gray-400 mt-2">Guía completa de uso de Caulky</p>
          </div>

          {/* ── 0. Usar con IA ─────────────────────────────────────────── */}
          <H2 id="ia">Usar con IA</H2>
          <P>
            Descarga el archivo <B>.md</B> y adjúntalo al inicio de una conversación con cualquier IA
            (ChatGPT, Claude, Gemini…). La IA leerá la guía completa y podrá guiarte en cualquier tarea
            como si fuera un experto en Caulky.
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
            <LI>"Quiero que el alquiler aparezca solo el día 5 de cada mes"</LI>
            <LI>"¿Cómo veo la evolución del saldo de mis cuentas?"</LI>
            <LI>"Quiero comparar cuánto gasté este año vs el año pasado"</LI>
            <LI>"¿Cómo divido un gasto con otra persona?"</LI>
            <LI>"¿Cómo instalo un plugin para cambiar la fuente?"</LI>
            <LI>"¿Cómo exporto todos mis datos?"</LI>
          </UL>
          <Tip>
            El archivo incluye todos los conceptos, páginas, campos, flujos paso a paso, atajos y preguntas
            frecuentes. La IA puede darte instrucciones precisas sin necesidad de que conozcas la app de antemano.
          </Tip>

          <Divider />

          {/* ── 1. Introducción ────────────────────────────────────────── */}
          <H2 id="intro">Introducción</H2>
          <P>
            Caulky es una aplicación web de finanzas personales autoalojada con interfaz en español.
            Backend: FastAPI + PostgreSQL. Frontend: React + TypeScript.
          </P>
          <UL>
            <LI>Registrar y categorizar cualquier transacción (gastos, ingresos, transferencias, ahorros)</LI>
            <LI>Ver las finanzas en distintos formatos: tabla, calendario, resumen anual, gráficos</LI>
            <LI>Analizar la evolución de saldos por cuenta y comparar años</LI>
            <LI>Gestionar presupuestos por categoría con historial de periodos</LI>
            <LI>Crear plantillas de movimientos y programar recurrencias (diaria, semanal, mensual)</LI>
            <LI>Hacer seguimiento de inversiones en fondos con precios de Yahoo Finance</LI>
            <LI>Dividir gastos con otras personas</LI>
            <LI>Importar datos desde hojas de cálculo Excel</LI>
            <LI>Gestionar varias cuentas bancarias con saldos automáticos</LI>
            <LI>Exportar e importar copias de seguridad completas en JSON</LI>
            <LI>Personalizar la interfaz con plugins JavaScript</LI>
          </UL>

          <Divider />

          {/* ── 2. Conceptos clave ─────────────────────────────────────── */}
          <H2 id="conceptos">Conceptos clave</H2>

          <H3>Movimiento</H3>
          <P>Una transacción de dinero. Es la entidad central de Caulky.</P>
          <FieldTable rows={[
            ['Nombre',          'Descripción libre (ej. "Mercadona", "Nómina Mayo")'],
            ['Importe',         'En euros. Positivo = ingreso, Negativo = gasto'],
            ['Fecha',           'La fecha que tú registras'],
            ['Fecha banco',     'Cuándo lo procesa el banco. Opcional. Afecta al calendario y a inversiones'],
            ['Tipo',            'Categoría del movimiento (ej. "Supermercado", "Nómina")'],
            ['Cuenta',          'Cuenta bancaria asociada'],
            ['Pagado',          'Si el movimiento está confirmado. Solo los pagados computan en saldos e inversiones'],
            ['No contar',       'Excluye el movimiento de estadísticas, gráficos, presupuestos e inversiones'],
            ['Notas',           'Texto libre adicional'],
            ['Adjuntos',        'Facturas, justificantes, imágenes'],
            ['Compartido',      'Marca el gasto como dividido con otra persona'],
            ['Compartido con',  'Nombre de la persona con quien se comparte'],
            ['Dividido entre',  'Número de personas entre las que se divide (ej. 2 para la mitad)'],
            ['Mi parte',        'Importe exacto que te corresponde (alternativa a "dividido entre")'],
          ]} />

          <H3>Tipos de movimiento</H3>
          <P>
            Categorías para clasificar movimientos (ej. "Supermercado", "Nómina", "Alquiler").
            Cada tipo tiene nombre, color y pertenece a un <B>grupo</B>.
            Opcionalmente tienen una <B>cuenta vinculada</B>: los movimientos de ese tipo afectan al saldo de esa cuenta.
          </P>

          <H3>Grupos</H3>
          <P>
            Agrupaciones de tipos de movimiento (ej. "Alimentación", "Transporte", "Ingresos").
            Se usan en Finanzas del Año, Comparaciones, Gráficos con desglose por grupo y vista Kanban.
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
            Las plantillas son movimientos preconfigurados para crearlos en un clic.
            Las recurrencias generan movimientos automáticamente según una regla periódica.
            Variables dinámicas en el nombre: <Code>{'{mes}'}</Code>, <Code>{'{año}'}</Code>,{' '}
            <Code>{'{mesfecha}'}</Code>, <Code>{'{mesfechabanco}'}</Code>.
          </P>

          <H3>Fondos de inversión</H3>
          <P>
            Fondos vinculados a un tipo de movimiento. Cada movimiento de ese tipo = una compra del fondo.
            Con el ticker de Yahoo Finance (ej. <Code>IWDA.AS</Code>) se obtienen precios actuales e históricos.
          </P>

          <Divider />

          {/* ── 3. Movimientos ─────────────────────────────────────────── */}
          <H2 id="movimientos">Movimientos</H2>
          <P>
            Página principal de gestión de transacciones. Disponible en tres vistas:
            <B> Tabla</B>, <B>Calendario</B> y <B>Kanban</B>.
          </P>

          <H3>Añadir un movimiento</H3>
          <Steps>
            <Step n={1}>Ir a <B>Movimientos</B> y clic en <B>"+ Nuevo"</B></Step>
            <Step n={2}>Rellenar <B>Nombre</B> e <B>Importe</B> (negativo para gastos, positivo para ingresos)</Step>
            <Step n={3}>Seleccionar <B>Fecha</B>, <B>Tipo</B> y <B>Cuenta</B> (opcionales pero recomendados)</Step>
            <Step n={4}>Marcar <B>Pagado</B> si ya está confirmado. <B>No contar</B> para excluirlo de estadísticas</Step>
            <Step n={5}>
              Para gastos compartidos: activar el toggle <B>Compartido</B> → indicar con quién → elegir entre
              "dividido entre N personas" o "mi parte es X€"
            </Step>
            <Step n={6}>Opcionalmente añadir <B>notas</B> y <B>archivos adjuntos</B></Step>
            <Step n={7}>
              Botones en la parte inferior:
              <UL>
                <LI><B>Cancelar</B>: cierra sin guardar</LI>
                <LI><B>Crear varios</B>: crea el mismo movimiento en múltiples fechas según una regla</LI>
                <LI><B>Guardar</B>: crea el movimiento único</LI>
              </UL>
            </Step>
          </Steps>

          <H3>Crear varios movimientos de golpe</H3>
          <P>El botón <B>"Crear varios"</B> crea múltiples copias del mismo movimiento distribuidas en el tiempo. Ideal para financiaciones a plazos, pagos escalonados, suscripciones con fecha de inicio conocida, etc.</P>
          <Steps>
            <Step n={1}>Rellenar el formulario con nombre, importe, tipo, etc.</Step>
            <Step n={2}>Clic en <B>"Crear varios"</B> (entre Cancelar y Guardar)</Step>
            <Step n={3}>Elegir el <B>tipo de repetición</B>: Diario, Semanal, Mensual por día, Mensual por semana</Step>
            <Step n={4}>Configurar la <B>fecha del primer movimiento</B></Step>
            <Step n={5}>Indicar <B>cuántos movimientos</B> crear en total</Step>
            <Step n={6}>Activar opcionalmente <B>"Numerar pagos en el nombre"</B> → añade "1/N", "2/N"… al nombre</Step>
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
            <Step n={1}>Activar los <B>checkboxes</B> de las filas a editar. El checkbox del encabezado selecciona todos los visibles</Step>
            <Step n={2}>En la barra de acciones → clic en <B>"Modificar campo"</B></Step>
            <Step n={3}>Elegir el campo: Nombre, Importe, Tipo, Cuenta, Fecha, Fecha banco, Pagado, No contar, Notas</Step>
            <Step n={4}>Introducir el nuevo valor y clic en <B>"Aplicar"</B></Step>
          </Steps>
          <Example label="Caso de uso">
            Marcar como pagados todos los movimientos de enero: filtrar por enero → checkbox encabezado → Modificar campo → Pagado → Sí → Aplicar.
          </Example>

          <H3>Vista Tabla</H3>
          <UL>
            <LI>Columnas configurables: mostrar/ocultar, reordenar arrastrando el encabezado, redimensionar arrastrando el borde</LI>
            <LI>Ordenación: clic en el encabezado de columna</LI>
            <LI>Filtros avanzados: rango de fechas, importe mín/máx, tipo(s), cuenta(s), pagado, no contar, búsqueda libre por texto</LI>
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

          {/* ── 4. Plantillas y recurrencias ───────────────────────────── */}
          <H2 id="plantillas">Plantillas y recurrencias</H2>

          <H3>Crear una plantilla</H3>
          <Steps>
            <Step n={1}>Movimientos → clic en <B>"+ Nuevo"</B> → clic en el icono de <B>plantillas</B> (arriba a la derecha del panel)</Step>
            <Step n={2}>Clic en <B>"+ Nueva plantilla"</B></Step>
            <Step n={3}>Rellenar la <B>etiqueta</B> (nombre corto para identificarla) y el resto de campos del movimiento</Step>
            <Step n={4}>En el campo de nombre puedes usar <Code>{'{mes}'}</Code> para insertar el mes actual automáticamente. Ej: "Nómina {'{mes}'}" → "Nómina Mayo"</Step>
            <Step n={5}>Elegir si <B>Fecha</B> y <B>Fecha banco</B> se rellenan solas como "hoy" o se dejan en blanco para rellenar manualmente</Step>
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
                <LI><B>Creación masiva</B>: tú eliges cuántas ocurrencias crear ahora de golpe</LI>
              </UL>
            </Step>
            <Step n={5}>Guardar</Step>
          </Steps>

          <Example label="Todos los lunes">
            Plantilla "Compra semanal" → icono calendario → tipo <B>Semanal</B> → marcar <B>Lunes</B> → modo <B>Auto-crear</B> → Guardar.
          </Example>
          <Example label="El día 5 de cada mes">
            Plantilla "Alquiler" → tipo <B>Mensual (día)</B> → día <B>5</B>, cada <B>1</B> mes → Auto-crear → Guardar.
          </Example>
          <Example label="El primer viernes de cada mes">
            Plantilla → tipo <B>Mensual (semana)</B> → "el <B>primer Viernes</B> de cada mes" → Auto-crear → Guardar.
          </Example>

          <Note>
            Con <B>Auto-crear</B>, si llevas varios días sin abrir la app, al abrirla Caulky crea automáticamente todos los movimientos pendientes de golpe.
          </Note>

          <Divider />

          {/* ── 5. Gráficos ────────────────────────────────────────────── */}
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
          <Example label="Todos los gastos por categoría">
            Tipo: Apilado · Eje X: Mes · Desglose: Grupo · Signo: Solo gastos
          </Example>
          <Example label="Evolución del saldo de cuentas">
            Tipo: Líneas · Eje X: Mes · Desglose: Cuenta · Signo: Todos
          </Example>

          <Divider />

          {/* ── 6. Cuentas ─────────────────────────────────────────────── */}
          <H2 id="cuentas">Cuentas</H2>
          <P>
            Página de analítica de saldos. Muestra la evolución histórica de todas tus cuentas bancarias
            con gráficos interactivos.
          </P>

          <H3>Tarjetas de resumen</H3>
          <P>En la cabecera aparecen las tarjetas de cada cuenta con su saldo actual, saldo inicial y variación total desde el inicio. También hay un indicador del saldo total combinado de todas las cuentas.</P>

          <H3>Filtro de año</H3>
          <P>Botones en la cabecera para filtrar los gráficos por un año concreto o ver <B>"Todo"</B> el historial disponible.</P>

          <H3>Gráfico de evolución del saldo</H3>
          <UL>
            <LI>Muestra el saldo de cada cuenta mes a mes</LI>
            <LI>Toggle <B>Líneas / Apilado</B>: líneas independientes por cuenta o área apilada con el total</LI>
          </UL>

          <H3>Gráfico de variación mensual</H3>
          <P>Barras que muestran cuánto ha cambiado el saldo de cada cuenta cada mes. Barras positivas = el saldo subió ese mes; negativas = bajó.</P>

          <H3>Gráfico de distribución</H3>
          <P>Donut que muestra el porcentaje del saldo total que corresponde a cada cuenta en el momento actual.</P>

          <Tip>Para gestionar las cuentas (crear, editar, eliminar), ve a Configuración → Cuentas. La página Cuentas es solo para analítica; las operaciones CRUD están en Configuración.</Tip>

          <Divider />

          {/* ── 7. Comparaciones ───────────────────────────────────────── */}
          <H2 id="comparaciones">Comparaciones</H2>
          <P>
            Compara dos años entre sí para detectar patrones, mejoras o desviaciones en tus finanzas.
          </P>

          <H3>Controles principales</H3>
          <P><B>Selección de años:</B> botones para elegir el Año A (azul) y el Año B (naranja). Solo aparecen los años que tienen datos.</P>

          <H3>Tipos de gráfico</H3>
          <UL>
            <LI><B>Gastos por categoría</B>: desglose mensual de gastos por grupo</LI>
            <LI><B>Total de gastos</B>: total mensual de gastos (una línea por año)</LI>
            <LI><B>Ingresos</B>: total mensual de ingresos</LI>
            <LI><B>Balance neto</B>: ingresos − gastos cada mes</LI>
            <LI><B>Distribución</B>: donut con el porcentaje de gasto por categoría</LI>
          </UL>

          <H3>Tipo de visualización</H3>
          <P>Para todos los gráficos excepto Distribución: <B>Línea</B>, <B>Barra</B> o <B>Área</B>.</P>

          <H3>Modo de vista</H3>
          <UL>
            <LI><B>Lado a lado</B>: dos gráficos independientes con el mismo eje Y para comparar visualmente. Los ejes Y son iguales para que la comparación sea directa</LI>
            <LI><B>Superpuesto</B>: los datos de ambos años en un mismo gráfico. El tooltip muestra los dos valores</LI>
          </UL>

          <H3>Periodo</H3>
          <UL>
            <LI><B>Año completo</B>: todos los meses del año (por defecto)</LI>
            <LI><B>Mes concreto</B>: disponible para el tipo Distribución; muestra los datos de ese mes específico</LI>
          </UL>

          <Example label="Ver si gasto más en alimentación este año que el anterior">
            Tipo: Gastos por categoría · Modo: Lado a lado · Año A: 2024 · Año B: 2025
          </Example>
          <Example label="Comparar ingresos totales entre dos años">
            Tipo: Ingresos · Modo: Superpuesto · Visualización: Área
          </Example>

          <Divider />

          {/* ── 8. Finanzas del Año ────────────────────────────────────── */}
          <H2 id="annual">Finanzas del Año</H2>
          <P>
            Tabla resumen anual con desglose mensual por categoría. Solo lectura.
          </P>
          <UL>
            <LI>Filas: grupos y tipos de movimiento</LI>
            <LI>Columnas: 12 meses + total anual + media mensual</LI>
            <LI>Los valores cero aparecen como "—" para facilitar la lectura</LI>
            <LI>Selector de año en la parte superior</LI>
          </UL>
          <Tip>Ideal para ver de un vistazo cuánto has gastado en cada categoría mes a mes y detectar variaciones o meses atípicos.</Tip>

          <Divider />

          {/* ── 9. Dashboard ───────────────────────────────────────────── */}
          <H2 id="dashboard">Dashboard</H2>
          <P>Página de inicio personalizable con widgets de estadísticas, gráficos y presupuestos.</P>

          <H3>Selector de mes/año</H3>
          <P>El pill junto al título muestra el mes y año. <B>Clic en él</B> para abrir el selector y navegar a cualquier mes pasado. Los widgets mensuales (ingresos del mes, gastos del mes, balance neto, presupuestos) reflejan el periodo seleccionado. El pill se vuelve <B>azul</B> cuando no estás viendo el mes actual.</P>

          <H3>Editar el Dashboard</H3>
          <P>Accede desde el botón "Editar" del propio Dashboard o desde Configuración → Editar Dashboard. En modo edición:</P>
          <UL>
            <LI>Arrastrar widgets para reordenarlos</LI>
            <LI>Handles de resize en los bordes para cambiar el tamaño</LI>
            <LI>Botones <B>"+ Estadística"</B>, <B>"+ Gráfico"</B>, <B>"+ Presupuesto"</B> para añadir widgets</LI>
            <LI>"Restablecer" devuelve el layout por defecto</LI>
            <LI>"Guardar" confirma los cambios y sale del modo edición</LI>
          </UL>

          <H3>Widgets de Estadística</H3>
          <P>Al pulsar <B>"+ Estadística"</B> se muestran tres secciones:</P>
          <UL>
            <LI><B>Métricas:</B> Ingresos del año/mes · Gastos del año/mes · Balance neto del año/mes (verde si positivo, rojo si negativo)</LI>
            <LI><B>Cuentas:</B> un widget por cada cuenta bancaria configurada, que muestra su saldo actual</LI>
            <LI><B>Paneles especiales:</B> "Cuenta de uso" (cuenta principal) · "Panel de ahorro" (cíclico entre cuentas de ahorro)</LI>
          </UL>
          <Tip>Puedes añadir varios widgets de cuenta a la vez. Por ejemplo: "Cuenta corriente", "Cuenta ahorro" y "Efectivo" en la misma fila del dashboard.</Tip>

          <H3>Widgets de Presupuesto</H3>
          <UL>
            <LI>Presupuestos individuales: barra de progreso con importe gastado vs límite</LI>
            <LI><B>Todos los presupuestos:</B> tarjeta combinada que muestra todos los presupuestos activos en una sola vista</LI>
          </UL>

          <Divider />

          {/* ── 10. Inversiones ────────────────────────────────────────── */}
          <H2 id="inversiones">Inversiones</H2>
          <Note>
            La sección Inversiones está oculta por defecto. Actívala en <B>Configuración → Navegación</B> (toggle de Inversiones) o en <B>Configuración → Apariencia</B> (toggle "Mostrar inversiones").
          </Note>
          <Note>
            Para que un movimiento aparezca en Inversiones debe estar <B>Pagado</B>, no tener <B>No contar</B> activo, y si tiene fecha banco no puede ser futura.
          </Note>

          <H3>Configurar un fondo nuevo</H3>
          <Steps>
            <Step n={1}>En <B>Configuración</B>, crear un <B>tipo de movimiento</B> para las compras del fondo (ej. "Compra MSCI World"), asignarlo a un grupo</Step>
            <Step n={2}>Ir a <B>Inversiones</B> en el menú lateral</Step>
            <Step n={3}>Clic en <B>"+ Nuevo fondo"</B></Step>
            <Step n={4}>Rellenar nombre, <B>ticker de Yahoo Finance</B> (ej. <Code>IWDA.AS</Code>, <Code>0P0000XMVJ.F</Code>) y vincular al tipo del paso 1</Step>
            <Step n={5}>Cada aportación = crear un movimiento con ese tipo (importe negativo, marcado como Pagado)</Step>
            <Step n={6}>En la lista de compras del fondo → clic en <B>"Obtener"</B> para buscar el precio histórico en Yahoo Finance</Step>
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
          <P>Clic en una fila → abre el modal de detalle del movimiento. Clic en el valor actual del fondo → sobreescribirlo manualmente si lo necesitas.</P>

          <Divider />

          {/* ── 11. Presupuestos ───────────────────────────────────────── */}
          <H2 id="presupuestos">Presupuestos</H2>

          <H3>Crear un presupuesto</H3>
          <Steps>
            <Step n={1}>Ir a <B>Presupuestos</B> → clic en <B>"+ Nuevo presupuesto"</B></Step>
            <Step n={2}>Poner un <B>nombre</B> descriptivo (ej. "Alimentación mensual")</Step>
            <Step n={3}>Vincular uno o varios <B>tipos de movimiento</B> al presupuesto</Step>
            <Step n={4}>Elegir el <B>periodo</B>: Mensual, Semanal, Anual o Personalizado (rango de fechas fijo)</Step>
            <Step n={5}>Establecer el <B>importe límite</B> de gasto para ese periodo</Step>
            <Step n={6}>Opcionalmente indicar la <B>fecha de inicio de seguimiento</B> (para ignorar periodos anteriores)</Step>
          </Steps>

          <H3>Cambiar el importe sin perder el historial</H3>
          <Steps>
            <Step n={1}>Abrir el presupuesto → clic en <B>"Nueva versión"</B></Step>
            <Step n={2}>Indicar el nuevo importe y la <B>fecha desde la que aplica</B></Step>
            <Step n={3}>Guardar — los periodos anteriores mantienen el importe anterior</Step>
          </Steps>

          <H3>Visualización</H3>
          <UL>
            <LI>Barra de progreso del periodo actual (gasto real vs límite)</LI>
            <LI>Histórico de periodos pasados</LI>
            <LI>Gráfico de líneas con la evolución temporal</LI>
          </UL>

          <Divider />

          {/* ── 12. Importar Excel ─────────────────────────────────────── */}
          <H2 id="importar">Importar Excel</H2>
          <P>Asistente de 4 pasos para importar movimientos desde un fichero .xlsx.</P>
          <Steps>
            <Step n={1}><B>Archivo</B>: subir el fichero Excel (arrastrar al área o clic para seleccionar)</Step>
            <Step n={2}><B>Columnas</B>: mapear cada columna del Excel al campo de Caulky correspondiente (Fecha, Nombre, Importe, Fecha banco, Tipo, Notas). Vista previa del resultado</Step>
            <Step n={3}><B>Tipos</B>: si el Excel tiene categorías en texto, mapearlas a tipos de movimiento de Caulky</Step>
            <Step n={4}><B>Importar</B>: previsualización completa → simulación previa → importación definitiva</Step>
          </Steps>

          <Divider />

          {/* ── 13. Configuración ──────────────────────────────────────── */}
          <H2 id="config">Configuración</H2>

          <H3>Apariencia</H3>
          <UL>
            <LI><B>Tema</B>: toggle Modo oscuro / Modo claro</LI>
            <LI><B>Moneda</B>: símbolo junto a los importes (€, $, £, ¥, CHF…)</LI>
            <LI><B>Formato de fecha</B>: DD/MM/AAAA, MM/DD/AAAA o AAAA-MM-DD</LI>
            <LI><B>Tamaño de la interfaz</B>: ajuste de zoom de la UI en porcentaje con botones −/+ (útil para pantallas muy grandes o pequeñas)</LI>
          </UL>

          <H3>Navegación</H3>
          <P>Controla qué páginas aparecen en el menú lateral y en qué orden.</P>
          <UL>
            <LI>Toggle para mostrar u ocultar cada página</LI>
            <LI>Flechas ▲▼ para reordenar las páginas en el menú</LI>
          </UL>

          <H3>Dashboard</H3>
          <P>Botón directo <B>"Editar Dashboard"</B> para entrar en modo edición del layout sin necesidad de ir al Dashboard primero.</P>

          <H3>Crear tipos de movimiento y grupos</H3>
          <Steps>
            <Step n={1}>Ir a <B>Configuración</B> → sección <B>"Tipos de movimiento y Grupos"</B></Step>
            <Step n={2}>Para crear un <B>grupo</B>: clic en <B>"+ Nuevo grupo"</B> → nombre → guardar</Step>
            <Step n={3}>Para crear un <B>tipo</B>: clic en <B>"+ Nuevo tipo"</B> → nombre, color, grupo al que pertenece</Step>
            <Step n={4}>Opcionalmente: asignar una <B>cuenta vinculada</B> → los movimientos de ese tipo afectarán al saldo de esa cuenta</Step>
          </Steps>

          <H3>Crear una cuenta bancaria</H3>
          <Steps>
            <Step n={1}>Configuración → sección <B>"Cuentas"</B> → clic en <B>"+ Nueva cuenta"</B></Step>
            <Step n={2}>Rellenar nombre, color, icono y <B>saldo inicial</B> (el saldo que tenía cuando empezaste a usar Caulky)</Step>
            <Step n={3}>Guardar — el saldo actual se calculará automáticamente con cada movimiento</Step>
          </Steps>
          <Note>Al eliminar una cuenta con movimientos asociados: puedes elegir entre <B>borrar los movimientos</B> o <B>convertirlos en gastos sin cuenta</B>.</Note>

          <H3>Copia de seguridad</H3>
          <UL>
            <LI><B>Exportar backup</B>: descarga un fichero JSON con todos los datos (movimientos, tipos, grupos, cuentas, presupuestos, fondos)</LI>
            <LI><B>Importar backup</B>: restaura desde un JSON de backup. ⚠️ Sobreescribe todos los datos actuales</LI>
          </UL>

          <H3>Zona de peligro — Restablecer sistema</H3>
          <P>Borra todos los datos y deja la app como nueva. Requiere escribir <Code>DELETE</Code> para confirmar. Esta acción es irreversible.</P>

          <Divider />

          {/* ── 14. Plugins ────────────────────────────────────────────── */}
          <H2 id="plugins">Plugins</H2>
          <P>
            Los plugins son archivos <B>.js</B> que modifican o amplían la interfaz de Caulky.
            Se instalan desde <B>Configuración → Plugins</B> y se ejecutan automáticamente en cada carga de página.
          </P>

          <H3>Instalar un plugin</H3>
          <Steps>
            <Step n={1}>Ir a <B>Configuración</B> → sección <B>"Plugins"</B></Step>
            <Step n={2}>Clic en <B>"Instalar plugin (.js)"</B> y seleccionar el archivo</Step>
            <Step n={3}>El plugin aparece en la lista. Está activado por defecto</Step>
          </Steps>

          <H3>Gestionar plugins instalados</H3>
          <UL>
            <LI>Toggle azul: activa o desactiva el plugin sin desinstalarlo</LI>
            <LI>Botón de papelera: elimina el plugin permanentemente</LI>
            <LI>Cada plugin muestra nombre, descripción y versión</LI>
          </UL>

          <H3>Recursos incluidos</H3>
          <UL>
            <LI><B>"Ejemplo"</B>: descarga un plugin de muestra que cambia la fuente de texto de la app</LI>
            <LI><B>"Guía IA"</B>: descarga el manual completo de desarrollo de plugins en formato .md, diseñado para dárselo a una IA que te ayude a crear tu propio plugin</LI>
          </UL>

          <Tip>
            Para crear tu propio plugin, descarga la "Guía IA" desde Configuración → Plugins y adjúntala a una conversación con ChatGPT o Claude. Dile qué quieres que haga el plugin y la IA te generará el código listo para instalar.
          </Tip>

          <Divider />

          {/* ── 15. Atajos y trucos ────────────────────────────────────── */}
          <H2 id="trucos">Atajos y trucos</H2>
          <UL>
            <LI><B>Clic derecho</B> en cualquier movimiento → menú rápido: Duplicar, Eliminar</LI>
            <LI><B>Arrastrar</B> en el calendario → cambia la fecha del movimiento sin abrir el modal</LI>
            <LI><B>Clic en el nombre</B> en la tabla → modal de detalle completo con todos los campos</LI>
            <LI>Selección múltiple + <B>"Modificar campo"</B> → edición masiva de cualquier campo</LI>
            <LI><B>"No contar"</B>: excluye de estadísticas, gráficos, presupuestos e inversiones. Ideal para gastos futuros inciertos o traspasos entre tus propias cuentas</LI>
            <LI>Movimientos con <B>fecha banco futura</B> no computan en inversiones hasta que esa fecha llegue</LI>
            <LI>Con <B>Auto-crear</B>, si llevas días sin abrir la app, al abrirla se crean todos los movimientos recurrentes pendientes de golpe</LI>
            <LI>Las preferencias de columnas (orden, ancho, visibilidad) y los <B>filtros favoritos</B> persisten entre sesiones</LI>
            <LI>El <B>zoom de la UI</B> se ajusta en Configuración → Apariencia → Tamaño de la interfaz</LI>
            <LI>El menú lateral se personaliza en <B>Configuración → Navegación</B>: ocultar páginas no utilizadas y reordenar</LI>
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
          <QA q="¿Cómo comparo cuánto gasté este año vs el año pasado?">
            Ir a Comparaciones → seleccionar Año A y Año B → tipo "Total de gastos" o "Gastos por categoría".
          </QA>
          <QA q="¿Cómo veo la evolución del saldo de mis cuentas?">
            Ir a Cuentas. El gráfico de evolución muestra el saldo mes a mes de todas las cuentas. Usa el filtro de año o "Todo" para ver el historial completo.
          </QA>
          <QA q="¿Puedo cambiar el límite de un presupuesto sin perder el historial?">
            Sí. Abre el presupuesto → "Nueva versión" → nuevo importe y fecha efectiva. El historial anterior no cambia.
          </QA>
          <QA q="¿Cómo marco varios movimientos como pagados de golpe?">
            Vista Tabla → seleccionar con checkboxes → Modificar campo → Pagado → Sí → Aplicar.
          </QA>
          <QA q="¿Qué significa 'No contar'?">
            El movimiento queda fuera de estadísticas, gráficos, presupuestos e inversiones. Solo aparece en la tabla. Úsalo para gastos futuros que pueden ocurrir o no, o para traspasos entre tus propias cuentas.
          </QA>
          <QA q="¿Cómo divido un gasto con otra persona?">
            Al crear o editar el movimiento, activa el toggle "Compartido". Indica con quién, y elige entre dividir entre N personas o poner tu parte exacta en euros.
          </QA>
          <QA q="¿Cómo oculto la sección Inversiones del menú?">
            Configuración → Navegación → toggle de Inversiones para desactivarla.
          </QA>
          <QA q="¿Cómo instalo un plugin?">
            Configuración → Plugins → "Instalar plugin (.js)" → seleccionar el archivo .js.
          </QA>
          <QA q="¿Cómo obtengo el precio histórico de una compra de fondo?">
            Inversiones → expandir el fondo → fila de la compra → botón "Obtener".
          </QA>
          <QA q="¿Cómo exporto todos mis datos?">
            Configuración → Copia de seguridad → Exportar backup.
          </QA>

          <div className="pb-12" />
        </div>
      </div>
    </div>
  )
}

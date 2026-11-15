# Notas de desarrollo — Caulky

## Publicar una release

```bash
# 1. Asegúrate de que dev está al día
git push origin dev

# 2. Crea y sube el tag de versión
git tag v1.2.1
git push origin v1.2.1
```

Eso dispara el workflow `.github/workflows/build-standalone.yml` que:
- Compila `Caulky-windows.exe`, `Caulky-linux` y `Caulky-macos` en paralelo
- Crea una GitHub Release con los tres ejecutables y changelog automático

La release aparece en unos minutos en la pestaña **Actions** → luego en **Releases**.

## App Android (APK)

La APK es el mismo frontend envuelto con Capacitor (`frontend/android/`). Se conecta al
servidor que se escribe en el login y no necesita cambios en el backend. El código propio de
la APK está en `frontend/src/offline/` y solo se activa dentro de la app (en la web queda
apagado; para probarlo en el navegador: `localStorage.setItem('caulky-offline-dev', '1')`).

```bash
# Desde frontend/: compila la web, la copia al proyecto Android y genera la APK
npm run android:sync
cd android && JAVA_HOME="/c/Program Files/Android/Android Studio/jbr" ./gradlew assembleDebug
# → android/app/build/outputs/apk/debug/app-debug.apk
```

- Requiere JDK 21 (el de Android Studio) y el SDK de Android 36.
- Sin conexión: las lecturas salen de la copia local (IndexedDB) y los cambios van a una cola;
  al reconectar se revisan en una ventana (duplicados, conflictos) antes de mandarlos.
- Widget / acceso directo «Añadir rápido» → `QuickAddActivity` (ventana transparente) abre
  `caulky://speedmode`, que muestra el speedmode como diálogo flotante.
- Widgets de datos (Cuentas, Presupuestos, Este mes): la web prepara los datos ya formateados
  (`src/offline/widgets.ts`) y se los pasa a Android por el plugin propio `CaulkyNative`;
  `Widgets.java` los pinta según el tamaño. Colores en Ajustes → Widgets (solo APK).
- Acerca de → Almacenamiento local (solo APK): conexión, servidor, espacio, sincronizar.

## Historial de actividad y deshacer

- `app/services/audit.py` escucha la `Session` de SQLAlchemy y guarda en `audit_logs` la fila
  entera de cada alta, cambio y borrado (también `delete(...)`/`update(...)` masivos), en la
  misma transacción. Una transacción = una operación (`group_id`); la frase de `write_log`
  va en la misma operación. Tabla nueva: se registra sola (salvo las de `SKIP_TABLES`).
- Deshacer (`POST /api/audit-log/undo`): solo admin con sesión del navegador, todo o nada.
  Lo que se apunta entre sí por clave foránea dentro de la operación (o un ticket y sus
  movimientos) es un bloque y se deshace junto. Si la fila cambió después, se rechaza.
- Lo registrado antes de esta versión (sin `group_id`) no se puede deshacer. Los datos para
  deshacer se guardan 90 días. Tests: `tests/test_audit_undo.py`.

## Copias diarias de la base (Docker)

- Servicio `db-backup` en `docker-compose.yml`: `pg_dump -Fc` diario al volumen `backup_data`
  (`caulky_AAAAMMDD_HHMMSS.dump`, 14 últimas). Pantalla: Ajustes → Copia de seguridad (admin).
- Volver a una: el backend escribe `/backups/restaurar/pedido` y sale (`RESTORE_SELF_RESTART=1`);
  `db-backup` guarda una copia de ahora, carga la elegida en una base nueva y la cambia por
  `spendly` (la anterior queda como `spendly_anterior`). El CMD del Dockerfile espera
  (`python -m app.services.db_backups wait`) antes de `alembic upgrade head`.

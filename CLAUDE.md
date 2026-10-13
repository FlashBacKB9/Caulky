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

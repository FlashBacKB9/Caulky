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

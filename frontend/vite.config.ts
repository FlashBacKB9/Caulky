import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// `vite build --mode android` (APK): la interfaz se dibuja también bajo la barra de estado
const androidViewport = {
  name: 'caulky-android-viewport',
  transformIndexHtml: (html: string) =>
    html.replace('content="width=device-width, initial-scale=1.0"', 'content="width=device-width, initial-scale=1.0, viewport-fit=cover"'),
}

export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwindcss(), ...(mode === 'android' ? [androidViewport] : [])],
  server: {
    proxy: {
      // VITE_PROXY_TARGET permite levantar un segundo backend en otro puerto
      '/api': process.env.VITE_PROXY_TARGET ?? 'http://localhost:8000',
    },
  },
  test: {
    environment: 'node',
  },
}))

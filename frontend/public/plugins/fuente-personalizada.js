// ==Plugin==
// @name        Fuente personalizada
// @description Cambia la fuente de la interfaz a Nunito (más redondeada y legible)
// @version     1.0
// ==/Plugin==

const __link = document.createElement('link');
__link.id = '__plugin_font_link';
__link.rel = 'stylesheet';
__link.href = 'https://fonts.googleapis.com/css2?family=Nunito:wght@300;400;500;600;700&display=swap';
document.head.appendChild(__link);

const __style = document.createElement('style');
__style.id = '__plugin_font_style';
__style.textContent = '*, body { font-family: "Nunito", sans-serif !important; }';
document.head.appendChild(__style);

function __cleanup() {
  document.getElementById('__plugin_font_link')?.remove();
  document.getElementById('__plugin_font_style')?.remove();
}

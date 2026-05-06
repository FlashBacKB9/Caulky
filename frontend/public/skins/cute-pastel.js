export default {
  name: "Cute Pastel",
  author: "Caulky Skins",
  version: "1.0",
  description: "Paleta rosa-lavanda suave, tipografía Nunito redondeada y menú superior. Optimizado para modo claro.",
  layout: "topnav",
  css: `@import url('https://fonts.googleapis.com/css2?family=Nunito:ital,wght@0,400;0,500;0,600;0,700;0,800;0,900;1,400&display=swap');

*, *::before, *::after {
  font-family: 'Nunito', system-ui, sans-serif !important;
}

/* ── Page & card backgrounds ── */
.bg-gray-50  { background-color: #fdf4ff !important; }
.bg-white    { background-color: #fff8ff !important; }
.bg-gray-100 { background-color: #fae8ff !important; }

/* ── Borders & dividers ── */
.border-gray-100 { border-color: #f3d4fe !important; }
.border-gray-200 { border-color: #e9d5ff !important; }
.divide-gray-50  > :not([hidden]) ~ :not([hidden]) { border-color: #faf0ff !important; }
.divide-gray-100 > :not([hidden]) ~ :not([hidden]) { border-color: #f3d4fe !important; }

/* ── Accent: replace blues with fuchsia ── */
.bg-blue-500  { background-color: #d946ef !important; }
.bg-blue-600  { background-color: #c026d3 !important; }
.text-blue-500 { color: #d946ef !important; }
.text-blue-600 { color: #c026d3 !important; }
.text-blue-700 { color: #a21caf !important; }
.border-blue-500 { border-color: #d946ef !important; }
.bg-blue-50   { background-color: #fdf4ff !important; }
.ring-blue-400 { --tw-ring-color: #f0abfc !important; }

/* ── Border radius — mucho más redondeado ── */
.rounded    { border-radius: 0.5rem   !important; }
.rounded-lg { border-radius: 0.875rem !important; }
.rounded-xl { border-radius: 1.25rem  !important; }
.rounded-2xl { border-radius: 1.75rem !important; }

/* ── Top navigation bar ── */
#topnav {
  background: linear-gradient(135deg, #fce7f3 0%, #ede9fe 100%) !important;
  border-bottom: 1.5px solid #f9a8d4 !important;
  box-shadow: 0 4px 24px rgba(236, 72, 153, 0.12) !important;
}

/* ── Section labels uppercase ── */
.uppercase.tracking-widest { color: #a855f7 !important; }

/* ── Page title gradient ── */
h1.font-bold {
  background: linear-gradient(135deg, #ec4899 0%, #8b5cf6 100%);
  -webkit-background-clip: text !important;
  -webkit-text-fill-color: transparent !important;
  background-clip: text !important;
}

/* ── Subtle card shadow ── */
.border-gray-100.rounded-xl,
.border-gray-100.rounded-2xl {
  box-shadow: 0 2px 16px rgba(168, 85, 247, 0.08) !important;
}

/* ── Custom scrollbar ── */
::-webkit-scrollbar { width: 6px; height: 6px; }
::-webkit-scrollbar-track { background: #fdf4ff; }
::-webkit-scrollbar-thumb { background: #d8b4fe; border-radius: 3px; }
::-webkit-scrollbar-thumb:hover { background: #c084fc; }
`
}

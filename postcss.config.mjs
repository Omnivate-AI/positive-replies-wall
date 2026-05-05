// Tailwind v4 uses a single PostCSS plugin (no tailwind.config.js needed —
// theme tokens are defined inline via @theme in globals.css).
const config = {
  plugins: {
    "@tailwindcss/postcss": {},
  },
};

export default config;

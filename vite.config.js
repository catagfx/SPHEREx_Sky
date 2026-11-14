import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// One config, two modes:
//   dev   (`npm run dev`)  Vite serves index.html with HMR for ui/src and proxies /api to the Python backend.
//   build (`npm run build`) one classic IIFE script -> js/ui.bundle.js (committed), so plain
//                          `python server.py` keeps working with no npm.
const API = process.env.API_TARGET || 'http://127.0.0.1:8080';

// dev only: index.html loads the committed bundle; in dev the module entry replaces it. It is started after the
// first paint: otherwise the browser runs all that JS before it ever draws, and the page stays blank for seconds
// while Vite serves the modules. window.__SPX_DEV keeps the service worker out of dev.
function devHtml() {
  return {
    name: 'spx-dev-html',
    apply: 'serve',
    transformIndexHtml: {
      order: 'pre',
      handler(html) {
        const loader = `<script>
  addEventListener('DOMContentLoaded', function () {
    requestAnimationFrame(function () { setTimeout(function () { import('/ui/src/main.tsx'); }, 0); });
  });
</script>
`;
        return html
          .replace(/<script src="js\/ui\.bundle\.js[^"]*"><\/script>\s*/, '')
          .replace('<head>', '<head>\n  <script>window.__SPX_DEV = true;</script>')
          .replace('</body>', loader + '</body>');
      },
    },
  };
}

export default defineConfig(({ command }) => ({
  plugins: [react(), devHtml()],
  publicDir: false,
  // the module entry is started by the dev loader above, so tell Vite where to pre-bundle deps from
  optimizeDeps: { entries: ['ui/src/main.tsx'] },
  define: command === 'build' ? { 'process.env.NODE_ENV': JSON.stringify('production') } : {},
  server: {
    port: 5173,
    strictPort: false,
    open: false,
    proxy: { '/api': { target: API, changeOrigin: true } },
    watch: { ignored: ['**/data/**', '**/assets/**', '**/js/ui.bundle.js', '**/.playwright*/**'] },
  },
  build: {
    lib: { entry: 'ui/src/main.tsx', name: 'SpherexUIBundle', formats: ['iife'], fileName: () => 'ui.bundle.js' },
    outDir: 'js',
    emptyOutDir: false, // js/ holds only this bundle, but never wipe the folder
    minify: true,
    sourcemap: false,
  },
}));

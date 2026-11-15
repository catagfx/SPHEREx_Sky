import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import basicSsl from '@vitejs/plugin-basic-ssl';
import fs from 'node:fs';
import path from 'node:path';

// One config, two modes:
//   dev   (`npm run dev`)  Vite serves index.html with HMR for ui/src and proxies /api to the Python backend.
//   build (`npm run build`) one classic IIFE script -> js/ui.bundle.js (committed), so plain
//                          `python server.py` keeps working with no npm.
const VOICE_API = process.env.VOICE_TARGET || 'http://127.0.0.1:8787'; // voice-server/ (rooms + LiveKit tokens)
const API = process.env.API_TARGET || 'http://127.0.0.1:8080';
// `npm run dev:vr`: https on the local network with an auto-generated IP SAN certificate.
const HTTPS = !!process.env.SPX_HTTPS;
const CERT_FILE = process.env.SPX_CERT_FILE;
const KEY_FILE = process.env.SPX_KEY_FILE;
const LAN_IPS = (process.env.SPX_LAN_IPS || '').split(',').filter(Boolean);
const hasCustomCert = HTTPS && CERT_FILE && KEY_FILE && fs.existsSync(CERT_FILE) && fs.existsSync(KEY_FILE);

function devHtml() {
  return {
    name: 'spx-dev-html',
    apply: 'serve',
    configureServer(server) {
      // Serve /rootCA.crt so any browser or VR headset can install the Root CA in 1 click
      server.middlewares.use((req, res, next) => {
        if (req.url === '/rootCA.crt') {
          const rootCaPath = path.resolve('.certs/rootCA.crt');
          if (fs.existsSync(rootCaPath)) {
            res.setHeader('Content-Type', 'application/x-x509-ca-cert');
            res.setHeader('Content-Disposition', 'attachment; filename="spherex-rootCA.crt"');
            res.end(fs.readFileSync(rootCaPath));
            return;
          }
        }
        next();
      });
    },
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
  plugins: [
    react(),
    devHtml(),
    ...(HTTPS && !hasCustomCert
      ? [basicSsl({ name: 'spherex-sky', domains: ['localhost', '127.0.0.1', ...LAN_IPS] })]
      : []),
  ],
  publicDir: false,
  optimizeDeps: { entries: ['ui/src/main.tsx'] },
  define: command === 'build' ? { 'process.env.NODE_ENV': JSON.stringify('production') } : {},
  server: {
    port: 5173,
    strictPort: false,
    open: false,
    ...(hasCustomCert
      ? {
          https: {
            key: fs.readFileSync(KEY_FILE),
            cert: fs.readFileSync(CERT_FILE),
          },
        }
      : {}),
    proxy: { '/api/rooms': { target: VOICE_API, changeOrigin: true }, '/api': { target: API, changeOrigin: true } },
    watch: { ignored: ['**/ui/src/data/field/**', '**/assets/**', '**/js/ui.bundle.js', '**/.playwright*/**', '**/.certs/**'] },
  },
  build: {
    lib: { entry: 'ui/src/main.tsx', name: 'SpherexUIBundle', formats: ['iife'], fileName: () => 'ui.bundle.js' },
    outDir: 'js',
    emptyOutDir: false,
    minify: true,
    sourcemap: false,
  },
}));

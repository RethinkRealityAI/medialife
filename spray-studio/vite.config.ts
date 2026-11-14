// Spray Studio: the Spray Bobo web companion (ported from AiroHub), a small React + three.js app of its
// own inside the site. Built to public/spray/ before the site build (npm run build:studio), so the site
// serves it as static files at /spray/ and its API calls (/api/spray/*) go to the site's own functions.
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { defineConfig } from 'vite';

// Realtime rooms (studio <-> phones) ride Supabase Realtime broadcast channels. The project's browser values
// are read at run time from /api/spray/realtime (server env SPRAY_SUPABASE_URL / SPRAY_SUPABASE_KEY).

export default defineConfig({
  root: __dirname,
  base: '/spray/',
  plugins: [react(), tailwindcss()],
  build: {
    outDir: path.resolve(__dirname, '../public/spray'),
    emptyOutDir: true,
    chunkSizeWarningLimit: 1600,
  },
  server: {
    port: 5180,
    // the site's dev server (npm run dev, port 8080) answers /api
    proxy: { '/api': 'http://localhost:8080' },
  },
});

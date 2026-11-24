// EVADE Hub (/evade/hub/): Bobo's Hideout in 3D, AR, Selfie and Photo, with every EVADE game and experience in
// Bobo's Arcade. A small React + three.js app of its own inside the site (forked from the Happi / Cheer Bear hub in
// RethinkRealityAI/CheerBearAR), built to public/evade/hub/ before the site build (npm run build:evade-hub), so the
// site serves it as static files on the same origin as the experiences it links to.
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { defineConfig } from 'vite';

const here = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  root: here,
  base: '/evade/hub/',
  plugins: [react()],
  resolve: { alias: { '@': path.resolve(here, 'src') } },
  build: {
    outDir: path.resolve(here, '../public/evade/hub'),
    emptyOutDir: true,
    target: 'es2022',
    chunkSizeWarningLimit: 1600,
  },
  server: { host: true, port: Number(process.env.PORT) || 5190, proxy: { '/api': 'http://localhost:8080' } },
});

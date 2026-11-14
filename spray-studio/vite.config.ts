// Spray Studio: the Spray Bobo web companion (ported from AiroHub), a small React + three.js app of its
// own inside the site. Built to public/spray/ before the site build (npm run build:studio), so the site
// serves it as static files at /spray/ and its API calls (/api/spray/*) go to the site's own functions.
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { defineConfig } from 'vite';

// Realtime rooms (studio <-> phones) ride Supabase Realtime broadcast channels. These are the publishable
// (browser) values from AiroHub; Realtime broadcast needs no tables and exposes no data. Override with
// VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY in the build environment to use another project.
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://zrtftliozslrjomxbfrr.supabase.co';
const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_4JZPu-HuA4MmYFqLW6DcnQ_HkfMvqSn';

export default defineConfig({
  root: __dirname,
  define: {
    'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(SUPABASE_URL),
    'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(SUPABASE_KEY),
  },
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

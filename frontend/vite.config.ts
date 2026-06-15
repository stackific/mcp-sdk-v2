import path from 'node:path';

import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, type PluginOption } from 'vite';

export default defineConfig({
  // @tailwindcss/vite resolves its own copy of vite's types under pnpm; cast to this project's
  // PluginOption to avoid a duplicate-vite type clash (runtime/build are unaffected).
  plugins: [react(), tailwindcss()] as unknown as PluginOption[],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src'),
    },
  },
  server: {
    // Bind all interfaces so http://localhost (IPv4 127.0.0.1) resolves — Vite's
    // default `localhost` bound IPv6 (::1) only. 8000-series avoids macOS AirPlay
    // Receiver, which squats on :5000/:7000 and returns 403.
    host: true,
    port: 8000,
  },
});

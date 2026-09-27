import { defineConfig } from 'vite';
import basicSsl from '@vitejs/plugin-basic-ssl';

// `npm run dev:phone` serves over HTTPS on your LAN: phones only expose the
// gyroscope to secure pages.
export default defineConfig(({ mode }) => ({
  base: './',
  plugins: mode === 'phone' ? [basicSsl()] : [],
  server: mode === 'phone' ? { host: true } : {},
  build: { chunkSizeWarningLimit: 1000 },
}));

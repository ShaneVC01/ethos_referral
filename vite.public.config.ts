import { copyFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

/**
 * Public referral form build (refer.) only. No PWA, no service worker, no app code, no seed data.
 * Output: dist-public/. The staff build (vite.config.ts) is a separate deployment.
 *
 * The public deployment serves this build at its root, so refer.html is copied to index.html and
 * the public headers replace the staff headers copied from public/. Turnstile needs its own origins.
 */

const PUBLIC_HEADERS = `/*
  Content-Security-Policy: default-src 'self'; script-src 'self' https://challenges.cloudflare.com; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self' https://challenges.cloudflare.com; frame-src https://challenges.cloudflare.com; manifest-src 'self'; base-uri 'self'; form-action 'self'; object-src 'none'; frame-ancestors 'none'
  Strict-Transport-Security: max-age=31536000; includeSubDomains
  X-Frame-Options: DENY
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=()
  Cross-Origin-Opener-Policy: same-origin
`;

function publicDeployFiles(): Plugin {
  return {
    name: 'public-deploy-files',
    apply: 'build',
    closeBundle() {
      const out = fileURLToPath(new URL('./dist-public', import.meta.url));
      copyFileSync(`${out}/refer.html`, `${out}/index.html`);
      writeFileSync(`${out}/_headers`, PUBLIC_HEADERS);
      writeFileSync(`${out}/_redirects`, '/*  /index.html  200\n');
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), publicDeployFiles()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  build: {
    outDir: 'dist-public',
    emptyOutDir: true,
    rollupOptions: {
      input: { refer: fileURLToPath(new URL('./refer.html', import.meta.url)) },
    },
  },
});

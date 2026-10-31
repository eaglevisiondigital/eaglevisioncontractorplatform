import { build } from 'vite';
import { chmodSync, mkdirSync } from 'node:fs';
mkdirSync('.staging/provider-readiness', { recursive: true, mode: 0o700 });
chmodSync('.staging/provider-readiness', 0o700);
await build({
  configFile: false,
  build: {
    ssr: 'scripts/provider-sandbox-acceptance.ts',
    outDir: '.staging/provider-readiness',
    emptyOutDir: false,
    rollupOptions: {
      external: ['pg'],
      output: { entryFileNames: 'runner.mjs' },
    },
  },
  logLevel: 'warn',
});
console.log(
  'Offline runner built; no credentials read or provider calls. Use plan only until exact sandbox authorization.',
);

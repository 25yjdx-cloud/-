import { cp, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import JavaScriptObfuscator from 'javascript-obfuscator';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const projectRoot = path.dirname(fileURLToPath(import.meta.url));
const outputRoot = path.join(projectRoot, 'dist');

function obfuscateProductionAssets() {
  return {
    name: 'obfuscate-production-assets',
    apply: 'build',
    generateBundle(_options, bundle) {
      for (const outputFile of Object.values(bundle)) {
        if (outputFile.type !== 'chunk' || outputFile.fileName.startsWith('react-vendor')) continue;
        outputFile.code = JavaScriptObfuscator.obfuscate(outputFile.code, {
          compact: true,
          controlFlowFlattening: false,
          identifierNamesGenerator: 'hexadecimal',
          numbersToExpressions: false,
          renameGlobals: false,
          selfDefending: false,
          stringArray: true,
          stringArrayEncoding: [],
          stringArrayThreshold: 0.75,
        }).getObfuscatedCode();
      }
    },

    async writeBundle() {
      const runtimeFiles = [
        'data.json',
        'duas.json',
        'manifest.json',
        'manifest-default.json',
        'manifest-fallback.json',
        'manifest-ramadan.json',
        'manifest-fitr.json',
        'manifest-adha.json',
        'quran-text.json',
      ];
      if (process.env.GITHUB_PAGES !== 'true') {
        runtimeFiles.push(
          'api.php',
          'auth.php',
          'create-payment.php',
          'feedback.php',
          'paymob-webhook.php',
          'security.php',
          '.htaccess',
        );
      }
      await Promise.all(runtimeFiles.map((name) => cp(
        path.join(projectRoot, name),
        path.join(outputRoot, name),
      )));
      await cp(
        path.join(projectRoot, 'src', 'assets', 'icons'),
        path.join(outputRoot, 'assets', 'icons'),
        { recursive: true },
      );
      const htmlPath = path.join(outputRoot, 'index.html');
      const html = await readFile(htmlPath, 'utf8');
      await writeFile(
        htmlPath,
        html.replace(/href="[^"]*manifest-[^"]+\.json"/, 'href="./manifest.json"'),
      );
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [react(), obfuscateProductionAssets()],
  esbuild: {
    drop: ['debugger'],
    pure: ['console.log', 'console.debug'],
  },
  server: {
    port: 5173,
    strictPort: true,
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2022',
    minify: 'esbuild',
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('/node_modules/react/') || id.includes('/node_modules/react-dom/')
            || id.includes('/node_modules/scheduler/')) return 'react-vendor';
          return undefined;
        },
      },
    },
  },
});

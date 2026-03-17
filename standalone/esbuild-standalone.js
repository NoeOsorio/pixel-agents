const esbuild = require('esbuild');
const path = require('path');

async function main() {
  await esbuild.build({
    entryPoints: [path.join(__dirname, 'cli.ts')],
    bundle: true,
    format: 'cjs',
    platform: 'node',
    outfile: path.join(__dirname, '..', 'dist', 'standalone', 'cli.js'),
    external: ['vite', 'esbuild'],
    sourcemap: true,
  });
  console.log('✓ Built dist/standalone/cli.js');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

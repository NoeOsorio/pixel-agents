import { exec, spawn } from 'child_process';
import * as path from 'path';

import { DEFAULT_PORT } from './constants.js';

interface CliArgs {
  port: number;
  project: string;
  noOpen: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    port: DEFAULT_PORT,
    project: process.cwd(),
    noOpen: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--port' && argv[i + 1]) {
      args.port = parseInt(argv[++i], 10);
    } else if (arg === '--project' && argv[i + 1]) {
      args.project = path.resolve(argv[++i]);
    } else if (arg === '--no-open') {
      args.noOpen = true;
    }
  }

  return args;
}

function openBrowser(url: string): void {
  const platform = process.platform;
  let cmd: string;

  if (platform === 'darwin') {
    cmd = `open "${url}"`;
  } else if (platform === 'win32') {
    cmd = `start "" "${url}"`;
  } else {
    cmd = `xdg-open "${url}"`;
  }

  exec(cmd, (err) => {
    if (err) {
      console.log(`[Standalone] Could not open browser automatically. Visit: ${url}`);
    }
  });
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  console.log('[Standalone] Starting Pixel Agents...');
  console.log(`[Standalone] Project: ${args.project}`);

  // webview-ui/ is two levels up from dist/standalone/
  const webviewDir = path.join(__dirname, '..', '..', 'webview-ui');

  const child = spawn(
    'npm',
    ['run', 'dev', '--', '--port', String(args.port), '--mode', 'standalone'],
    {
      cwd: webviewDir,
      env: { ...process.env, PIXEL_AGENTS_PROJECT: args.project },
      stdio: 'pipe',
      shell: process.platform === 'win32',
    },
  );

  let opened = false;

  child.stdout?.on('data', (chunk: Buffer) => {
    const text = chunk.toString();
    process.stdout.write(text);
    if (!opened) {
      const match = /Local:\s+(http:\/\/localhost:\d+\/)/.exec(text);
      if (match) {
        opened = true;
        const url = match[1].replace(/\/$/, '');
        console.log(`\nPixel Agents running at ${url}`);
        console.log('Press Ctrl+C to stop\n');
        if (!args.noOpen) {
          openBrowser(url);
        }
      }
    }
  });

  child.stderr?.on('data', (chunk: Buffer) => {
    process.stderr.write(chunk);
  });

  child.on('exit', (code) => {
    process.exit(code ?? 0);
  });

  process.on('SIGINT', () => {
    console.log('\n[Standalone] Shutting down...');
    child.kill('SIGINT');
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    child.kill('SIGTERM');
    process.exit(0);
  });
}

main().catch((err) => {
  console.error('[Standalone] Fatal error:', err);
  process.exit(1);
});

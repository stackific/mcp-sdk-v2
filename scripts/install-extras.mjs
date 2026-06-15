// Runs after the root `pnpm install`. The MCP server (`ts-mcp-server/`) and the SDK
// it builds on (`ts-sdk/`) are intentionally NOT workspace members (so the
// companion stays server-agnostic and the reference is deletable), which means a
// plain `pnpm install` skips them. This hook installs their packages standalone
// so `pnpm dev` brings the whole TypeScript stack up after a single `pnpm i`.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Guard against re-entrancy: the nested installs below also fire lifecycle
// scripts; this env flag stops them from recursing back into this hook.
if (process.env.MCP_COMPANION_INSTALL_EXTRAS === '1') process.exit(0);

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// SDK first (ts-mcp-server links it via file:../ts-sdk), then the server.
const extras = [
  { name: 'ts-sdk', dir: join(root, 'ts-sdk') },
  { name: 'ts-mcp-server', dir: join(root, 'ts-mcp-server') },
];

for (const { name, dir } of extras) {
  if (!existsSync(join(dir, 'package.json'))) {
    console.log(`[install-extras] ${name} not present — skipping`);
    continue;
  }
  console.log(`[install-extras] installing ${name}…`);
  const result = spawnSync('pnpm', ['install', '--ignore-workspace'], {
    cwd: dir,
    stdio: 'inherit',
    env: { ...process.env, MCP_COMPANION_INSTALL_EXTRAS: '1' },
  });
  if (result.status !== 0) {
    console.error(`[install-extras] ${name} install failed (exit ${result.status})`);
    process.exit(result.status ?? 1);
  }
}

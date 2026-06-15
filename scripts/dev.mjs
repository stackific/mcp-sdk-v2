// Runs the TypeScript stack in dev/live-reload: the workspace packages
// (ts-mcp-client + frontend) AND the external `ts-mcp-server/` (which is
// intentionally NOT a workspace member, so `pnpm -r` skips it). Forwards Ctrl+C to
// every child so nothing lingers; `pnpm stop` is the belt-and-braces port cleanup.
// NOTE: the root Taskfile is the primary monorepo entrypoint; this script remains
// the implementation behind `task dev:ts`.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(new URL('.', import.meta.url)));
const mcpServerDir = join(root, 'ts-mcp-server');

// The ts-mcp-server installs standalone (it isn't a workspace member). Make sure its
// deps exist before starting its watcher.
if (existsSync(mcpServerDir) && !existsSync(join(mcpServerDir, 'node_modules'))) {
  console.log('[dev] installing ts-mcp-server deps (standalone)…');
  spawnSync('pnpm', ['install', '--ignore-workspace'], { cwd: mcpServerDir, stdio: 'inherit' });
}

const children = [];
const start = (label, cmd, args, cwd) => {
  const child = spawn(cmd, args, { cwd: cwd ?? root, stdio: 'inherit', env: process.env });
  child.on('exit', (code) => {
    console.log(`[dev] ${label} exited (${code ?? 'signal'}) — shutting everything down`);
    shutdown(code ?? 0);
  });
  children.push(child);
};

let shuttingDown = false;
function shutdown(code) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const c of children) {
    try {
      c.kill('SIGTERM');
    } catch {
      /* already gone */
    }
  }
  process.exit(code);
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

// Workspace packages (ts-mcp-client :8002 + frontend :8000) and the MCP server (:8001 + :8003).
start('workspace', 'pnpm', ['-r', '--parallel', '--stream', 'dev']);
if (existsSync(mcpServerDir)) {
  start('ts-mcp-server', 'pnpm', ['--dir', 'ts-mcp-server', 'dev']);
} else {
  console.log('[dev] ts-mcp-server/ not present — skipping (the companion is server-agnostic).');
}

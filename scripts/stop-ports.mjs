// Stop whatever is listening on the monorepo's dev ports (macOS/Linux; uses lsof).
// Ports are resolved in priority order: CLI args → STOP_PORTS env (space/comma
// separated) → the full known set below. The root Taskfile passes its authoritative
// port list via STOP_PORTS; `pnpm stop` falls back to the defaults here.
import { execSync } from 'node:child_process';

// Default labelled targets — every stack's dev ports across all languages.
const DEFAULT_TARGETS = [
  { name: 'frontend', port: 8000 },
  { name: 'ts-mcp-server', port: 8001 },
  { name: 'ts-mcp-client', port: 8002 },
  { name: 'ts-auth', port: 8003 },
  { name: 'py-mcp-server', port: 8101 },
  { name: 'py-mcp-client', port: 8102 },
  { name: 'csharp-mcp-server', port: 8201 },
  { name: 'csharp-mcp-client', port: 8202 },
];

function parsePorts(src) {
  return src
    .split(/[\s,]+/)
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isInteger(n) && n > 0);
}

// Reuse the known labels for any overridden ports that match a default target.
const KNOWN = new Map(DEFAULT_TARGETS.map((t) => [t.port, t.name]));
const override = process.argv.slice(2).join(' ') || process.env.STOP_PORTS || '';
const targets = override
  ? parsePorts(override).map((port) => ({ name: KNOWN.get(port) ?? 'port', port }))
  : DEFAULT_TARGETS;

let killed = 0;
for (const { name, port } of targets) {
  let pids = [];
  try {
    // `lsof -ti` exits non-zero when nothing is listening — caught below as "free".
    pids = execSync(`lsof -ti tcp:${port}`, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
  } catch {
    pids = [];
  }

  if (pids.length === 0) {
    console.log(`  ${name} :${port} — free`);
    continue;
  }

  try {
    execSync(`kill -9 ${pids.join(' ')}`, { stdio: 'ignore' });
    killed += pids.length;
    console.log(`  ${name} :${port} — killed ${pids.join(', ')}`);
  } catch (e) {
    console.log(`  ${name} :${port} — could not kill ${pids.join(', ')} (${e.message})`);
  }
}

console.log(
  killed ? `Done — stopped ${killed} process(es).` : 'Done — all ports were already free.',
);

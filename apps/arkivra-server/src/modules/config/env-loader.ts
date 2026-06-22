import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

function parseEnvLine(line: string): { key: string; value: string } | null {
  const trimmed = line.trim();
  if (trimmed.length === 0 || trimmed.startsWith('#')) return null;

  const normalized = trimmed.startsWith('export ') ? trimmed.slice('export '.length).trimStart() : trimmed;
  const separatorIndex = normalized.indexOf('=');
  if (separatorIndex <= 0) return null;

  const key = normalized.slice(0, separatorIndex).trim();
  if (!/^[a-z_]\w*$/i.test(key)) return null;

  const rawValue = normalized.slice(separatorIndex + 1).trim();
  const quote = rawValue[0];
  const isQuoted = (quote === '"' || quote === '\'' || quote === '`') && rawValue.endsWith(quote);
  const value = isQuoted ? rawValue.slice(1, -1) : rawValue;

  return { key, value };
}

function findRepoRoot(startDirectory: string) {
  let current = resolve(startDirectory);

  while (true) {
    if (
      existsSync(join(current, 'package.json'))
      && existsSync(join(current, 'apps', 'arkivra-server', 'package.json'))
    ) {
      return current;
    }

    const parent = dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

function loadEnvFile(path: string, env: NodeJS.ProcessEnv) {
  if (!existsSync(path)) return;

  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const parsed = parseEnvLine(line);
    if (parsed === null || env[parsed.key] !== undefined) continue;
    env[parsed.key] = parsed.value;
  }
}

export function loadApiEnvFiles({
  cwd = process.cwd(),
  env = process.env,
}: {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
} = {}) {
  const repoRoot = findRepoRoot(cwd);
  if (repoRoot === null) return;

  loadEnvFile(join(repoRoot, '.env'), env);
  loadEnvFile(join(repoRoot, 'apps', 'arkivra-server', '.env'), env);
}

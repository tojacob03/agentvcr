import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir, userInfo } from 'node:os';
import { parseTranscript } from './parse.js';
import { secretValues } from './redact.js';
import { renderHtml, renderViewer, toPlayerData } from './render.js';
import { renderMarkdown } from './markdown.js';

export { renderHtml, renderViewer, renderMarkdown, toPlayerData, parseTranscript };

export function loadSession(path, opts = {}) {
  let user = '';
  try { user = userInfo().username; } catch { /* no user, nothing to mask */ }
  // Cline keeps the working directory in a manifest next to the messages file.
  let cwd = '';
  if (/\.messages\.json$/.test(path)) {
    try { cwd = JSON.parse(readFileSync(path.replace(/\.messages\.json$/, '.json'), 'utf8')).cwd || ''; } catch { /* no manifest */ }
  }
  let raw = readFileSync(path, 'utf8');
  if (opts.sidechains && path.endsWith('.jsonl')) raw = withSubagents(path, raw);
  const secrets = opts.redact === false ? [] : localSecrets();
  return parseTranscript(raw, { ...opts, path, home: homedir(), user, cwd, secrets });
}

// Secret values from the environment and from .env files in the folder agentvcr
// runs in. They are only used to mask; nothing here is written or sent anywhere.
export function localSecrets(env = process.env, dir = process.cwd()) {
  const pairs = Object.entries(env);
  for (const f of ['.env', '.env.local']) {
    let text = '';
    try { text = readFileSync(join(dir, f), 'utf8'); } catch { continue; }
    for (const line of text.split(/\r?\n/)) {
      const m = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_.-]*)\s*=\s*(.*?)\s*$/);
      if (m) pairs.push([m[1], m[2].replace(/^(['"])(.*)\1$/, '$2')]);
    }
  }
  return secretValues(pairs);
}

// Newer Claude Code keeps subagent turns in <session>/subagents/*.jsonl instead
// of inline. Merge them in by timestamp, so they land where they happened.
function withSubagents(path, raw) {
  const dir = join(path.slice(0, -'.jsonl'.length), 'subagents');
  let files = [];
  try { files = readdirSync(dir).filter((f) => f.endsWith('.jsonl')); } catch { return raw; }
  if (!files.length) return raw;
  const rows = [];
  for (const text of [raw, ...files.map((f) => readFileSync(join(dir, f), 'utf8'))]) {
    let at = 0;
    for (const line of text.split('\n')) {
      if (!line.trim()) continue;
      let t = NaN;
      try { t = Date.parse(JSON.parse(line).timestamp); } catch { /* not a record */ }
      if (!Number.isNaN(t)) at = t;
      rows.push({ line, at, i: rows.length });
    }
  }
  return rows.sort((a, b) => a.at - b.at || a.i - b.i).map((r) => r.line).join('\n');
}

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir, userInfo } from 'node:os';
import { parseTranscript } from './parse.js';
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
  return parseTranscript(raw, { ...opts, path, home: homedir(), user, cwd });
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

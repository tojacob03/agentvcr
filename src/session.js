// Shared pieces of the normalized session model that both parsers produce.
//
// Session: { agent, title, cwd, branch, model, startedAt, endedAt, events, stats }
// Event:   { type: 'prompt' | 'text' | 'thinking' | 'tool', ts, ... }
// Tool:    { type: 'tool', kind, name, title, detail, output, error, ts, end }

const MAX_OUTPUT_CHARS = 6000;
const MAX_OUTPUT_LINES = 120;

export function truncate(text, maxLines = MAX_OUTPUT_LINES, maxChars = MAX_OUTPUT_CHARS) {
  if (typeof text !== 'string') return '';
  let out = text;
  let cut = false;
  const lines = out.split('\n');
  if (lines.length > maxLines) {
    out = lines.slice(0, maxLines).join('\n');
    cut = true;
  }
  if (out.length > maxChars) {
    out = out.slice(0, maxChars);
    cut = true;
  }
  if (cut) {
    const rest = lines.length - out.split('\n').length;
    out += rest > 0 ? `\n… ${rest} more lines` : '\n…';
  }
  return out;
}

// Line diff via LCS. Edits from agents are small, so O(n*m) is fine; above a
// size limit we fall back to "all removed, all added".
export function lineDiff(oldText = '', newText = '') {
  const a = oldText === '' ? [] : oldText.split('\n');
  const b = newText === '' ? [] : newText.split('\n');
  if (a.length * b.length > 250000) {
    return [...a.map((l) => ['-', l]), ...b.map((l) => ['+', l])];
  }
  const dp = Array.from({ length: a.length + 1 }, () => new Uint32Array(b.length + 1));
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const out = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { out.push([' ', a[i]]); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { out.push(['-', a[i]]); i++; }
    else { out.push(['+', b[j]]); j++; }
  }
  while (i < a.length) out.push(['-', a[i++]]);
  while (j < b.length) out.push(['+', b[j++]]);
  return out;
}

// Keep changed lines plus a little context; collapse long unchanged runs.
export function trimDiff(diff, context = 3, maxLines = 160) {
  const keep = diff.map(() => false);
  diff.forEach(([op], i) => {
    if (op === ' ') return;
    for (let k = Math.max(0, i - context); k <= Math.min(diff.length - 1, i + context); k++) keep[k] = true;
  });
  const out = [];
  let skipped = 0;
  diff.forEach((row, i) => {
    if (keep[i]) {
      if (skipped) out.push(['…', `${skipped} unchanged lines`]);
      skipped = 0;
      out.push(row);
    } else skipped++;
  });
  if (out.length > maxLines) {
    const rest = out.length - maxLines;
    return [...out.slice(0, maxLines), ['…', `${rest} more lines`]];
  }
  return out;
}

// Edit/write detail with line counts taken before trimming, so stats stay exact.
export function editDetail(path, diff) {
  let added = 0;
  let removed = 0;
  for (const [op] of diff) {
    if (op === '+') added++;
    if (op === '-') removed++;
  }
  return { path, diff: trimDiff(diff), added, removed };
}

export function firstLine(text, max = 90) {
  const line = String(text ?? '').trim().split('\n')[0];
  return line.length > max ? line.slice(0, max - 1) + '…' : line;
}

export function shortPath(path, cwd) {
  if (!path) return '';
  if (cwd && path.startsWith(cwd + '/')) return path.slice(cwd.length + 1);
  return path;
}

export function computeStats(events) {
  const files = new Set();
  let added = 0;
  let removed = 0;
  let tools = 0;
  let commands = 0;
  let errors = 0;
  let prompts = 0;
  let activeMs = 0;
  let prev = null;
  for (const e of events) {
    if (e.type === 'prompt') prompts++;
    if (e.type === 'tool') {
      tools++;
      if (e.kind === 'shell') commands++;
      if (e.error) errors++;
      if ((e.kind === 'edit' || e.kind === 'write') && !e.error) {
        for (const p of e.detail.paths || [e.detail.path]) if (p) files.add(p);
        added += e.detail.added || 0;
        removed += e.detail.removed || 0;
      }
    }
    const t = Date.parse(e.ts);
    if (!Number.isNaN(t)) {
      // Gaps over five minutes are the human being away, not the agent working.
      if (prev !== null) activeMs += Math.min(Math.max(t - prev, 0), 5 * 60 * 1000);
      prev = t;
    }
  }
  return { prompts, tools, commands, errors, files: files.size, added, removed, activeMs };
}

// Strip harness-injected blocks from user text; what remains is what a human typed.
export function cleanPrompt(text) {
  let t = String(text ?? '');
  t = t.replace(/<(system-reminder|environment_context|user_instructions|local-command-stdout|local-command-caveat|ide_selection|ide_opened_file)>[\s\S]*?<\/\1>/g, '');
  const cmd = t.match(/<command-name>([\s\S]*?)<\/command-name>/);
  if (cmd) {
    const args = (t.match(/<command-args>([\s\S]*?)<\/command-args>/) || [])[1] || '';
    t = `${cmd[1].trim()} ${args.trim()}`;
  }
  t = t.replace(/<\/?command-(message|name|args)>/g, '');
  return t.trim();
}

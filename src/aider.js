// Aider: .aider.chat.history.md in the project folder, read from aider's io.py.
// Every run appends "# aider chat started at <local time>"; what you type is
// "#### " lines, aider's own messages are "> " lines, and the model's replies
// are plain Markdown with edits as SEARCH/REPLACE blocks after a file name.
// Only the start of a run has a time, so the replay counts steps.

import { firstLine, computeStats } from './session.js';
import { toolEvent } from './claude.js';
import { editEvent } from './cline.js';

export function parseAider(raw, { path = '' } = {}) {
  // Replay the last run in the file.
  const starts = [...raw.matchAll(/^# aider chat started at (\d{4}-\d\d-\d\d \d\d:\d\d:\d\d)[ \t]*$/gm)];
  const start = starts.at(-1);
  const body = start ? raw.slice(start.index + start[0].length) : raw;
  const started = start ? new Date(start[1].replace(' ', 'T')) : null;
  const cwd = path.replace(/[\\/]?\.aider\.chat\.history\.md$/, '');
  const meta = { agent: 'Aider', title: '', cwd, branch: '', model: '', version: '' };
  const events = [];
  const tokens = { in: 0, out: 0 };
  let pending = [];
  let prompt = [];
  let reply = [];

  const flushPrompt = () => {
    const text = prompt.join('\n').trim();
    if (text && text !== '<blank>') events.push({ type: 'prompt', text, ts: null });
    prompt = [];
  };
  const flushReply = () => {
    if (reply.length) { pending = addReply(reply, events, cwd); reply = []; }
  };

  for (const line of body.split(/\r?\n/)) {
    if (line.startsWith('#### ') || line === '####') {
      flushReply();
      prompt.push(line.slice(5).replace(/ {2}$/, ''));
      continue;
    }
    flushPrompt();
    if (line.startsWith('> ') || line === '>') {
      flushReply();
      const msg = line.slice(2).replace(/ {2}$/, '').trim();
      let m;
      if ((m = msg.match(/^Aider v(\S+)/))) meta.version = m[1];
      else if ((m = msg.match(/^(?:Main model|Model): (\S+)/))) meta.model ||= m[1];
      else if ((m = msg.match(/^Applied edit to (.+)$/))) pending = pending.filter((e) => e.detail.path !== m[1].trim());
      else if (/SEARCH\/REPLACE blocks? failed to match|did not conform to the edit format/.test(msg)) for (const e of pending) e.error = true;
      else if ((m = msg.match(/^Running (.+)$/))) events.push(toolEvent('Bash', { command: m[1] }, cwd, null));
      else if ((m = msg.match(/^Commit ([0-9a-f]{7,40}) (.+)$/))) events.push({ type: 'note', text: `Committed ${m[1].slice(0, 7)}: ${m[2]}`, ts: null });
      else if ((m = msg.match(/^Tokens: (.+?) received\./))) {
        for (const [, n] of m[1].matchAll(/([\d.]+[kM]?) (?:sent|cache write|cache hit)/g)) tokens.in += count(n);
        tokens.out += count(m[1].split(', ').at(-1));
      }
      continue;
    }
    reply.push(line);
  }
  flushPrompt();
  flushReply();

  meta.title = firstLine(events.find((e) => e.type === 'prompt' && !e.text.startsWith('/'))?.text || events.find((e) => e.type === 'prompt')?.text || 'Untitled session', 80);
  const startedAt = started && !Number.isNaN(started.getTime()) ? started.toISOString() : null;
  return { ...meta, startedAt, endedAt: null, events, stats: { ...computeStats(events), tokens } };
}

// "4.2k" -> 4200, "1.3M" -> 1300000.
function count(s) {
  const m = String(s).trim().match(/^([\d.]+)([kM]?)$/);
  return m ? Math.round(parseFloat(m[1]) * (m[2] === 'k' ? 1e3 : m[2] === 'M' ? 1e6 : 1)) : 0;
}

// A model reply: text, with each "file name, fence, SEARCH/REPLACE or diff,
// fence" turned into an edit. Returns the edits, which wait for "Applied edit".
function addReply(lines, events, cwd) {
  const edits = [];
  let text = [];
  const flushText = () => {
    const t = text.join('\n').trim();
    if (t) events.push({ type: 'text', text: t, ts: null });
    text = [];
  };
  for (let i = 0; i < lines.length; i++) {
    // The udiff edit format has no file name line: the fence opens on "--- path".
    if (/^`{3,}diff\s*$/.test(lines[i]) && /^--- /.test(lines[i + 1] || '') && /^\+\+\+ /.test(lines[i + 2] || '')) lines.splice(i, 0, '(diff)');
    const fence = lines[i + 1]?.match(/^(`{3,})\S*\s*$/);
    const opens = fence && /^(<{5,} SEARCH|--- )/.test(lines[i + 2] || '');
    const file = lines[i].trim();
    if (!opens || !file || /\s{2,}|^[`#>]/.test(file)) { text.push(lines[i]); continue; }
    let end = i + 2;
    while (end < lines.length && lines[end].trim() !== fence[1]) end++;
    const inner = lines.slice(i + 2, end).join('\n');
    const plus = inner.match(/^\+\+\+ (?:b\/)?(.+)$/m);
    flushText();
    const ev = editEvent(plus ? plus[1].trim() : file, inner, cwd, null);
    events.push(ev);
    edits.push(ev);
    i = end;
  }
  flushText();
  return edits;
}

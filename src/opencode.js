// OpenCode keeps sessions in a database; `opencode export <id> > session.json`
// writes one as JSON. Two shapes exist: current messages tagged by `type`
// (user, assistant, shell, compaction, idle) with tool `state`, and older
// exports where each message is { info: { role }, parts: [...] }.

import { truncate, firstLine, computeStats, cleanPrompt } from './session.js';
import { toolEvent } from './claude.js';

export function parseOpenCode(raw) {
  let doc;
  try { doc = JSON.parse(raw); } catch { doc = {}; }
  const info = doc.info || doc.session || {};
  const messages = Array.isArray(doc) ? doc : doc.messages || doc.data?.messages || [];
  const meta = { agent: 'OpenCode', title: info.title || '', cwd: info.directory || info.location?.directory || '', branch: '', model: '', version: info.version || '' };
  const events = [];
  const tokens = { in: 0, out: 0 };

  for (const m of messages) {
    if (m.info && Array.isArray(m.parts)) legacyMessage(m, meta, events, tokens);
    else currentMessage(m, meta, events, tokens);
  }

  if (!meta.title) meta.title = firstLine(events.find((e) => e.type === 'prompt')?.text || 'Untitled session', 80);
  const stamps = events.map((e) => e.ts).filter(Boolean);
  return { ...meta, startedAt: stamps[0] || null, endedAt: stamps.at(-1) || null, events, stats: { ...computeStats(events), tokens } };
}

function currentMessage(m, meta, events, tokens) {
  const ts = iso(m.time?.created);
  switch (m.type) {
    case 'user': {
      const text = cleanPrompt(typeof m.text === 'string' ? m.text : partsText(m.text));
      if (text) events.push({ type: 'prompt', text, ts });
      return;
    }
    case 'assistant':
      if (!meta.model && m.model) meta.model = typeof m.model === 'string' ? m.model : m.model.modelID || m.model.id || '';
      addTokens(tokens, m.tokens);
      for (const c of m.content || []) {
        if (c.type === 'text' && c.text?.trim()) events.push({ type: 'text', text: c.text, ts });
        else if (c.type === 'tool') events.push(tool(c.name, c.state || {}, meta.cwd, iso(c.time?.created) || ts, iso(c.time?.completed)));
      }
      if (m.error) events.push({ type: 'note', text: firstLine(m.error.message || m.error.name || 'Error', 120), ts });
      return;
    case 'shell': {
      const ev = toolEvent('Bash', { command: m.command }, meta.cwd, ts);
      ev.output = truncate(typeof m.output === 'string' ? m.output : partsText(m.output));
      ev.error = typeof m.exit === 'number' && m.exit !== 0;
      ev.end = iso(m.time?.completed);
      events.push(ev);
      return;
    }
    case 'compaction':
      events.push({ type: 'note', text: 'Context compacted', ts });
      return;
    case 'idle':
      if (m.outcome === 'interrupted') events.push({ type: 'note', text: 'Interrupted by user', ts });
      return;
  }
}

function legacyMessage(m, meta, events, tokens) {
  const ts = iso(m.info.time?.created);
  if (m.info.role === 'user') {
    const text = cleanPrompt(m.parts.filter((p) => p.type === 'text' && !p.synthetic).map((p) => p.text).join('\n'));
    if (text) events.push({ type: 'prompt', text, ts });
    return;
  }
  if (!meta.model && m.info.modelID) meta.model = m.info.modelID;
  addTokens(tokens, m.info.tokens);
  for (const p of m.parts) {
    if (p.type === 'text' && p.text?.trim()) events.push({ type: 'text', text: p.text, ts: iso(p.time?.start) || ts });
    else if (p.type === 'tool') {
      const s = p.state || {};
      events.push(tool(p.tool, { status: s.status, input: s.input, content: s.output, error: s.error }, meta.cwd, iso(s.time?.start) || ts, iso(s.time?.end)));
    }
  }
}

// OpenCode's tool names and argument names, translated to the shared kinds.
const MAP = {
  bash: (a) => ['Bash', { command: a.command, description: a.description }],
  edit: (a) => ['Edit', { file_path: a.filePath, old_string: a.oldString, new_string: a.newString }],
  write: (a) => ['Write', { file_path: a.filePath, content: a.content }],
  read: (a) => ['Read', { file_path: a.filePath }],
  glob: (a) => ['Glob', { pattern: a.pattern, path: a.path }],
  grep: (a) => ['Grep', { pattern: a.pattern, path: a.path }],
  list: (a) => ['Glob', { pattern: a.path || '.' }],
  webfetch: (a) => ['WebFetch', { url: a.url }],
  websearch: (a) => ['WebSearch', { query: a.query }],
  todowrite: (a) => ['TodoWrite', { todos: a.todos }],
  task: (a) => ['Task', { description: a.description, prompt: a.prompt }],
};

function tool(name, state, cwd, ts, end) {
  const input = state.input && typeof state.input === 'object' ? state.input : {};
  const [n, args] = MAP[name] ? MAP[name](input) : [name, input];
  const ev = toolEvent(n, args, cwd, ts);
  const out = typeof state.content === 'string' ? state.content : partsText(state.content);
  const err = state.error ? (typeof state.error === 'string' ? state.error : state.error.message || JSON.stringify(state.error)) : '';
  ev.output = ev.kind === 'read' ? truncate(out || err, 30, 3000) : truncate(out || err);
  ev.error = state.status === 'error';
  ev.end = end || null;
  return ev;
}

function addTokens(t, u) {
  if (!u) return;
  t.in += (u.input || 0) + (u.cache?.read || 0) + (u.cache?.write || 0);
  t.out += (u.output || 0) + (u.reasoning || 0);
}

function partsText(parts) {
  if (!Array.isArray(parts)) return parts?.text || '';
  return parts.map((p) => (typeof p === 'string' ? p : p?.text || '')).join('\n');
}

function iso(t) {
  if (t == null) return null;
  const d = typeof t === 'number' ? new Date(t) : new Date(String(t));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

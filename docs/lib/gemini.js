// Gemini CLI chats: ~/.gemini/tmp/<project>/chats/session-*.jsonl (or .json in
// older versions). JSONL lines are a metadata record, message records, and edits
// to earlier messages: {$patch}, {$rewindTo}, {$set}. Replaying those in order
// gives the conversation as the CLI itself would load it.

import { truncate, firstLine, computeStats, cleanPrompt } from './session.js';
import { toolEvent } from './claude.js';

export function parseGemini(raw, { thinking = false } = {}) {
  const messages = new Map();
  const meta = { agent: 'Gemini CLI', title: '', cwd: '', branch: '', model: '', version: '' };
  let summary = '';

  const trimmed = raw.trim();
  if (trimmed.startsWith('{') && !trimmed.includes('\n{')) {
    // Legacy single JSON document.
    try {
      const doc = JSON.parse(trimmed);
      summary = doc.summary || '';
      meta.cwd = doc.directories?.[0] || '';
      for (const m of doc.messages || []) messages.set(m.id, m);
    } catch { /* fall through to JSONL */ }
  }
  if (!messages.size) {
    for (const line of raw.split('\n')) {
      if (!line.trim()) continue;
      let r;
      try { r = JSON.parse(line); } catch { continue; }
      if (typeof r.$rewindTo === 'string') {
        let cut = false;
        for (const id of [...messages.keys()]) { if (id === r.$rewindTo) cut = true; if (cut) messages.delete(id); }
      } else if (r.$patch && typeof r.$patch === 'object') {
        for (const p of [r.$patch, ...(r.$patch.updates || [])]) applyPatch(messages, p);
        for (const id of r.$patch.removeIds || []) messages.delete(id);
      } else if (r.$set && typeof r.$set === 'object') {
        if (Array.isArray(r.$set.messages)) { messages.clear(); for (const m of r.$set.messages) messages.set(m.id, m); }
        if (r.$set.summary) summary = r.$set.summary;
        if (r.$set.directories?.[0]) meta.cwd = r.$set.directories[0];
      } else if (typeof r.id === 'string') {
        messages.set(r.id, r);
      } else if (r.sessionId && r.projectHash) {
        if (r.summary) summary = r.summary;
        if (r.directories?.[0]) meta.cwd = r.directories[0];
      }
    }
  }

  const events = [];
  for (const m of messages.values()) {
    const ts = m.timestamp || null;
    const text = partsText(m.displayContent ?? m.content);
    if (m.type === 'user') {
      const clean = cleanPrompt(text);
      if (clean) events.push({ type: 'prompt', text: clean, ts });
    } else if (m.type === 'gemini') {
      if (m.model && !meta.model) meta.model = m.model;
      if (thinking) for (const t of m.thoughts || []) events.push({ type: 'thinking', text: [t.subject, t.description].filter(Boolean).join(': '), ts: t.timestamp || ts });
      if (text.trim()) events.push({ type: 'text', text, ts });
      for (const tc of m.toolCalls || []) events.push(geminiTool(tc, meta.cwd));
    } else if (m.type === 'error' && text.trim()) {
      events.push({ type: 'note', text: firstLine(text, 120), ts });
    }
  }

  meta.title = firstLine(summary || events.find((e) => e.type === 'prompt')?.text || 'Untitled session', 80);
  const stamps = events.map((e) => e.ts).filter(Boolean);
  return { ...meta, startedAt: stamps[0] || null, endedAt: stamps.at(-1) || null, events, stats: computeStats(events) };
}

function applyPatch(messages, p) {
  const m = p && messages.get(p.id);
  if (!m) return;
  if (p.content !== undefined) m.content = p.content;
  for (const tp of p.toolCalls || []) {
    const tc = (m.toolCalls || []).find((t) => t.id === tp.id);
    if (tc && 'result' in tp) tc.result = tp.result;
  }
}

// Gemini tool names, translated to the shared kinds.
const MAP = {
  run_shell_command: (a) => ['Bash', { command: a.command, description: a.description }],
  replace: (a) => ['Edit', { file_path: a.file_path, old_string: a.old_string, new_string: a.new_string }],
  write_file: (a) => ['Write', { file_path: a.file_path, content: a.content }],
  read_file: (a) => ['Read', { file_path: a.absolute_path || a.file_path || a.path }],
  read_many_files: (a) => ['Read', { file_path: (a.paths || a.include || []).join(', ') }],
  list_directory: (a) => ['Glob', { pattern: a.path || a.dir_path || '.' }],
  glob: (a) => ['Glob', { pattern: a.pattern, path: a.path }],
  search_file_content: (a) => ['Grep', { pattern: a.pattern, path: a.path }],
  grep: (a) => ['Grep', { pattern: a.pattern, path: a.path }],
  google_web_search: (a) => ['WebSearch', { query: a.query }],
  web_fetch: (a) => ['WebFetch', { url: a.url || firstLine(a.prompt, 120) }],
  write_todos: (a) => ['TodoWrite', { todos: (a.todos || []).map((t) => ({ content: t.description || t.content, status: t.status })) }],
};

function geminiTool(tc, cwd) {
  const args = tc.args || {};
  const [name, input] = MAP[tc.name] ? MAP[tc.name](args) : [tc.name, args];
  const ev = toolEvent(name, input, cwd, tc.timestamp || null);
  ev.error = tc.status === 'error' || tc.status === 'cancelled';
  const display = typeof tc.resultDisplay === 'string' ? tc.resultDisplay : '';
  const out = display || resultText(tc.result);
  ev.output = ev.kind === 'read' ? truncate(out, 30, 3000) : truncate(out);
  ev.end = tc.timestamp || null;
  return ev;
}

function partsText(content) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return content?.text || '';
  return content.map((p) => (typeof p === 'string' ? p : p?.text || '')).join('');
}

function resultText(result) {
  if (!result) return '';
  if (typeof result === 'string') return result;
  const parts = Array.isArray(result) ? result : [result];
  return parts.map((p) => {
    if (typeof p === 'string') return p;
    if (p?.text) return p.text;
    const r = p?.functionResponse?.response;
    if (r) return typeof r.output === 'string' ? r.output : typeof r.error === 'string' ? r.error : JSON.stringify(r);
    return '';
  }).join('\n');
}

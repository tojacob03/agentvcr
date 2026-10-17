// Claude Code transcripts: ~/.claude/projects/<encoded-cwd>/<session-id>.jsonl
// One JSON object per line; assistant content blocks arrive one per line.

import { truncate, lineDiff, editDetail, firstLine, shortPath, computeStats, cleanPrompt } from './session.js';

// Claude Code SDK output (claude -p --output-format json/stream-json, and the
// execution file of anthropics/claude-code-action): the same messages without
// per-message timestamps, as a JSON array. Rewrite it as transcript lines.
export function parseClaudeSdk(raw, opts) {
  let list = [];
  try { list = JSON.parse(raw); } catch { list = []; }
  const init = list.find((m) => m.type === 'system' && m.subtype === 'init') || {};
  const lines = list
    .filter((m) => (m.type === 'assistant' || m.type === 'user') && m.message && !m.parent_tool_use_id)
    .map((m) => JSON.stringify({ type: m.type, message: m.message, cwd: init.cwd, timestamp: null }));
  const session = parseClaude(lines.join('\n'), opts);
  if (!session.model && init.model) session.model = init.model;
  // The prompt is the run's input, not one of its messages; title it by its first answer.
  if (!session.events.some((e) => e.type === 'prompt')) {
    const first = session.events.find((e) => e.type === 'text');
    if (first) session.title = firstLine(first.text, 80);
  }
  const result = list.find((m) => m.type === 'result');
  if (result?.is_error) session.events.push({ type: 'note', text: `Run ended with an error (${result.subtype || 'error'})`, ts: null });
  return session;
}

export function parseClaude(raw, { sidechains = false, thinking = false } = {}) {
  const events = [];
  const tools = new Map();
  // Every content block line repeats its message's usage, so count each message id once.
  const usage = new Map();
  const meta = { agent: 'Claude Code', title: '', cwd: '', branch: '', model: '', version: '' };

  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;
    let d;
    try { d = JSON.parse(line); } catch { continue; }

    if (d.type === 'custom-title' && d.customTitle) meta.title = d.customTitle;
    if (d.type === 'summary' && d.summary && !meta.title) meta.title = d.summary;
    if (d.type !== 'user' && d.type !== 'assistant') continue;
    if (d.isSidechain && !sidechains) continue;
    if (!meta.cwd && d.cwd) meta.cwd = d.cwd;
    if (!meta.branch && d.gitBranch) meta.branch = d.gitBranch;
    if (!meta.version && d.version) meta.version = d.version;

    const ts = d.timestamp;
    const content = d.message?.content;

    if (d.type === 'assistant') {
      if (d.message?.usage && d.message.id) usage.set(d.message.id, d.message.usage);
      const model = d.message?.model;
      if (model && !model.startsWith('<') && !meta.model) meta.model = model;
      for (const b of Array.isArray(content) ? content : []) {
        if (b.type === 'text' && b.text?.trim()) events.push({ type: 'text', text: b.text, ts });
        else if (b.type === 'thinking' && thinking && b.thinking?.trim()) events.push({ type: 'thinking', text: b.thinking, ts });
        else if (b.type === 'tool_use') {
          const ev = toolEvent(b.name, b.input || {}, meta.cwd, ts);
          tools.set(b.id, ev);
          events.push(ev);
        }
      }
      continue;
    }

    // User entries: human prompts, harness-injected context (isMeta), or tool results.
    if (d.isMeta) continue;
    if (d.isCompactSummary) { events.push({ type: 'note', text: 'Context compacted', ts }); continue; }
    const blocks = typeof content === 'string' ? [{ type: 'text', text: content }] : Array.isArray(content) ? content : [];
    let prompt = '';
    let images = 0;
    for (const b of blocks) {
      if (b.type === 'tool_result') {
        const ev = tools.get(b.tool_use_id);
        if (!ev) continue;
        ev.output = resultText(b.content, ev.kind);
        ev.error = Boolean(b.is_error);
        ev.end = ts;
      } else if (b.type === 'text') prompt += (prompt ? '\n' : '') + b.text;
      else if (b.type === 'image') images++;
    }
    // A subagent's user turn is its task from the main agent, already shown on the Task call.
    if (d.isSidechain) continue;
    const text = cleanPrompt(prompt);
    if (/^\[Request interrupted/.test(text)) events.push({ type: 'note', text: 'Interrupted by user', ts });
    else if (text || images) events.push({ type: 'prompt', text: text + (images ? `${text ? '\n' : ''}[${images} image${images > 1 ? 's' : ''}]` : ''), ts });
  }

  if (!meta.title) meta.title = firstLine(events.find((e) => e.type === 'prompt')?.text || 'Untitled session', 80);
  const stamps = events.map((e) => e.ts).filter(Boolean);
  const tokens = { in: 0, out: 0 };
  for (const u of usage.values()) {
    tokens.in += (u.input_tokens || 0) + (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0);
    tokens.out += u.output_tokens || 0;
  }
  return { ...meta, startedAt: stamps[0] || null, endedAt: stamps.at(-1) || null, events, stats: { ...computeStats(events), tokens } };
}

function resultText(content, kind) {
  let text = '';
  if (typeof content === 'string') text = content;
  else if (Array.isArray(content)) {
    text = content.map((c) => (c.type === 'text' ? c.text : c.type === 'image' ? '[image]' : '')).join('\n');
  }
  // File reads are long and rarely the interesting part of a replay.
  return kind === 'read' ? truncate(text, 30, 3000) : truncate(text);
}

export function toolEvent(name, input, cwd, ts) {
  const base = { type: 'tool', name, ts, end: null, output: '', error: false };
  const path = input.file_path || input.path || input.notebook_path || '';
  switch (name) {
    case 'Bash':
      return { ...base, kind: 'shell', title: firstLine(input.command, 120), detail: { command: input.command || '', description: input.description || '' } };
    case 'Edit':
      return { ...base, kind: 'edit', title: shortPath(path, cwd), detail: editDetail(shortPath(path, cwd), lineDiff(input.old_string, input.new_string)) };
    case 'MultiEdit': {
      const diff = (input.edits || []).flatMap((e, i) => [...(i ? [['…', 'next edit']] : []), ...lineDiff(e.old_string, e.new_string)]);
      return { ...base, kind: 'edit', title: shortPath(path, cwd), detail: editDetail(shortPath(path, cwd), diff) };
    }
    case 'Write':
      // A trailing newline is the end of the last line, not an extra empty line.
      return { ...base, kind: 'write', title: shortPath(path, cwd), detail: editDetail(shortPath(path, cwd), lineDiff('', (input.content || '').replace(/\n$/, ''))) };
    case 'Read':
    case 'NotebookRead':
      return { ...base, kind: 'read', title: shortPath(path, cwd), detail: { path: shortPath(path, cwd) } };
    case 'Grep':
    case 'Glob':
      return { ...base, kind: 'search', title: input.pattern || '', detail: { pattern: input.pattern || '', path: shortPath(path, cwd) } };
    case 'WebSearch':
      return { ...base, kind: 'web', title: input.query || '', detail: { query: input.query || '' } };
    case 'WebFetch':
      return { ...base, kind: 'web', title: input.url || '', detail: { url: input.url || '' } };
    case 'Task':
    case 'Agent':
      return { ...base, kind: 'task', title: input.description || 'Subagent', detail: { prompt: truncate(input.prompt || '', 40, 3000) } };
  }
  const items = input.todos || input.items;
  if (Array.isArray(items)) {
    return { ...base, kind: 'plan', title: 'Plan', detail: { items: items.map((t) => ({ text: t.content || t.text || '', status: t.status || 'pending' })) } };
  }
  const pretty = name.startsWith('mcp__') ? name.slice(5).replace(/__/g, ' · ') : name;
  return { ...base, kind: name.startsWith('mcp__') ? 'mcp' : 'other', title: pretty, detail: { input: truncate(JSON.stringify(input, null, 2), 40, 3000) } };
}

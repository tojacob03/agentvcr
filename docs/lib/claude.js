// Claude Code transcripts: ~/.claude/projects/<encoded-cwd>/<session-id>.jsonl
// One JSON object per line; assistant content blocks arrive one per line.

import { truncate, lineDiff, editDetail, firstLine, shortPath, computeStats, cleanPrompt } from './session.js';

export function parseClaude(raw, { sidechains = false, thinking = false } = {}) {
  const events = [];
  const tools = new Map();
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
    const text = cleanPrompt(prompt);
    if (/^\[Request interrupted/.test(text)) events.push({ type: 'note', text: 'Interrupted by user', ts });
    else if (text || images) events.push({ type: 'prompt', text: text + (images ? `${text ? '\n' : ''}[${images} image${images > 1 ? 's' : ''}]` : ''), ts });
  }

  if (!meta.title) meta.title = firstLine(events.find((e) => e.type === 'prompt')?.text || 'Untitled session', 80);
  const stamps = events.map((e) => e.ts).filter(Boolean);
  return { ...meta, startedAt: stamps[0] || null, endedAt: stamps.at(-1) || null, events, stats: computeStats(events) };
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

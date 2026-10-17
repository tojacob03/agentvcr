// Qwen Code: ~/.qwen/projects/<encoded-cwd>/chats/<session-id>.jsonl
// One record per line ({uuid, parentUuid, type: user|assistant|tool_result|system,
// message: {role, parts}}), with Gemini-style parts. Rewinds leave abandoned
// branches in the file, so the conversation is the chain from the last record
// back through parentUuid, as Qwen Code's own transcript loader walks it.

import { truncate, lineDiff, editDetail, firstLine, computeStats, cleanPrompt } from './session.js';
import { toolEvent } from './claude.js';

const MAP = {
  run_shell_command: (a) => ['Bash', { command: a.command, description: a.description }],
  edit: (a) => ['Edit', { file_path: a.file_path, old_string: a.old_string, new_string: a.new_string }],
  write_file: (a) => ['Write', { file_path: a.file_path, content: a.content }],
  read_file: (a) => ['Read', { file_path: a.absolute_path || a.file_path || a.path }],
  grep_search: (a) => ['Grep', { pattern: a.pattern, path: a.path }],
  glob: (a) => ['Glob', { pattern: a.pattern, path: a.path }],
  list_directory: (a) => ['Glob', { pattern: a.path || '.' }],
  web_fetch: (a) => ['WebFetch', { url: a.url || firstLine(a.prompt, 120) }],
  web_search: (a) => ['WebSearch', { query: a.query }],
  todo_write: (a) => ['TodoWrite', { todos: a.todos || [] }],
  agent: (a) => ['Task', { description: a.description || a.subagent_type, prompt: a.prompt }],
};

// Records that are not part of the conversation (Qwen Code's NON_CONVERSATION
// subtypes and artifact records); everything else can be the last message.
const OFF_RECORD = /^(session_sources_snapshot|managed_session_|session_artifact_)/;

export function parseQwen(raw, { thinking = false } = {}) {
  const records = [];
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;
    try { const r = JSON.parse(line); if (r && r.uuid) records.push(r); } catch { /* partial line */ }
  }
  const meta = { agent: 'Qwen Code', title: '', cwd: '', branch: '', model: '', version: '' };
  for (const r of records) {
    if (r.subtype === 'custom_title' && r.systemPayload?.customTitle) meta.title = r.systemPayload.customTitle;
  }

  const events = [];
  const tools = new Map();
  const tokens = { in: 0, out: 0 };
  for (const r of activeChain(records)) {
    if (!meta.cwd && r.cwd) meta.cwd = r.cwd;
    if (!meta.branch && r.gitBranch) meta.branch = r.gitBranch;
    if (!meta.version && r.version) meta.version = r.version;
    const ts = r.timestamp || null;
    const parts = Array.isArray(r.message?.parts) ? r.message.parts : [];

    if (r.type === 'system') {
      if (r.subtype === 'chat_compression') events.push({ type: 'note', text: 'Context compacted', ts });
      continue;
    }
    if (r.type === 'user') {
      // Background notifications and agent-to-agent messages are not the person typing.
      if (r.subtype && r.subtype !== 'mid_turn_user_message') continue;
      const typed = r.systemPayload?.displayText ?? parts.filter((p) => typeof p.text === 'string' && !p.thought).map((p) => p.text).join('\n');
      const text = cleanPrompt(typed);
      if (text) events.push({ type: 'prompt', text, ts });
      continue;
    }
    if (r.type === 'assistant') {
      if (!meta.model && r.model) meta.model = r.model;
      if (r.usageMetadata) {
        tokens.in += r.usageMetadata.promptTokenCount || 0;
        tokens.out += r.usageMetadata.candidatesTokenCount || 0;
      }
      for (const p of parts) {
        if (p.functionCall) {
          const ev = qwenTool(p.functionCall, meta.cwd, ts);
          tools.set(p.functionCall.id || `${p.functionCall.name}:${tools.size}`, ev);
          events.push(ev);
        } else if (typeof p.text === 'string' && p.text.trim()) {
          if (p.thought) { if (thinking) events.push({ type: 'thinking', text: p.text, ts }); }
          else events.push({ type: 'text', text: p.text, ts });
        }
      }
      continue;
    }
    if (r.type === 'tool_result') {
      const result = r.toolCallResult || {};
      for (const p of parts) {
        const fr = p.functionResponse;
        if (!fr) continue;
        const ev = tools.get(fr.id || result.callId);
        if (!ev) continue;
        const display = result.resultDisplay;
        const out = typeof display === 'string' ? display : responseText(fr.response);
        ev.output = ev.kind === 'read' ? truncate(out, 30, 3000) : truncate(out);
        ev.error = result.status === 'error' || result.status === 'cancelled' || Boolean(fr.response?.error);
        ev.end = ts;
        // Writes and edits record the file before and after; that diff is exact.
        if ((ev.kind === 'edit' || ev.kind === 'write') && display && typeof display.newContent === 'string') {
          const path = ev.detail.path;
          ev.detail = editDetail(path, lineDiff((display.originalContent || '').replace(/\n$/, ''), display.newContent.replace(/\n$/, '')));
          if (display.originalContent) ev.kind = 'edit';
        }
      }
    }
  }

  if (!meta.title) meta.title = firstLine(events.find((e) => e.type === 'prompt')?.text || 'Untitled session', 80);
  const stamps = events.map((e) => e.ts).filter(Boolean);
  return { ...meta, startedAt: stamps[0] || null, endedAt: stamps.at(-1) || null, events, stats: { ...computeStats(events), tokens } };
}

// The last conversation record and its ancestors, with fragments that share a
// uuid merged into one record.
function activeChain(records) {
  const byUuid = new Map();
  for (const r of records) {
    const prev = byUuid.get(r.uuid);
    if (!prev) { byUuid.set(r.uuid, { ...r, message: r.message && { ...r.message, parts: [...(r.message.parts || [])] } }); continue; }
    if (r.message) prev.message = prev.message ? { ...prev.message, parts: [...(prev.message.parts || []), ...(r.message.parts || [])] } : r.message;
    if (r.usageMetadata) prev.usageMetadata = r.usageMetadata;
    if (r.toolCallResult && !prev.toolCallResult) prev.toolCallResult = r.toolCallResult;
    if (r.model && !prev.model) prev.model = r.model;
  }
  const leaf = [...records].reverse().find((r) => !(r.type === 'system' && OFF_RECORD.test(r.subtype || '')));
  const chain = [];
  const seen = new Set();
  for (let r = leaf && byUuid.get(leaf.uuid); r && !seen.has(r.uuid); r = r.parentUuid ? byUuid.get(r.parentUuid) : null) {
    seen.add(r.uuid);
    chain.push(r);
  }
  return chain.reverse();
}

function qwenTool(call, cwd, ts) {
  const args = call.args || {};
  const [name, input] = MAP[call.name] ? MAP[call.name](args) : [call.name, args];
  return toolEvent(name, input, cwd, ts);
}

function responseText(response) {
  if (!response) return '';
  if (typeof response.output === 'string') return response.output;
  if (typeof response.error === 'string') return response.error;
  if (typeof response.error?.message === 'string') return response.error.message;
  return JSON.stringify(response);
}


// Cline, and the Roo Code and Kilo Code forks that kept its format.
//
// Two formats, both read from Cline's own source:
// - ui_messages.json (Cline before its SDK, Roo Code, older Kilo Code): a JSON
//   array of {ts, type: 'say'|'ask', say|ask, text}, where tool calls are JSON
//   in `text`. Lives in the editor's globalStorage/<extension>/tasks/<id>/.
// - <id>.messages.json (Cline now, ~/.cline/data/sessions/<id>/): {version: 1,
//   messages}, Anthropic-style content blocks with tool_use and tool_result.

import { truncate, editDetail, firstLine, shortPath, computeStats } from './session.js';
import { toolEvent } from './claude.js';
import { patch } from './codex.js';

export function parseCline(raw, { path = '', cwd = '', thinking = false } = {}) {
  let doc;
  try { doc = JSON.parse(raw); } catch { doc = []; }
  const session = Array.isArray(doc) ? parseUiMessages(doc, { cwd, thinking }) : parseSdkMessages(doc.messages || [], { cwd, thinking });
  session.agent = clineAgent(path, Array.isArray(doc) ? doc : []);
  return session;
}

function clineAgent(path, list) {
  if (/rooveterinaryinc\.roo-cline/i.test(path)) return 'Roo Code';
  if (/kilocode\.kilo-code/i.test(path)) return 'Kilo Code';
  if (/saoudrizwan\.claude-dev|[\\/]\.cline[\\/]/i.test(path)) return 'Cline';
  // A dropped file has no telling path; Roo Code says and tools Cline never had.
  const roo = /^(api_req_retry_delayed|subtask_result|checkpoint_saved|condense_context|codebase_search_result)$/;
  const rooTools = /"tool":"(appliedDiff|switchMode|newTask|updateTodoList|codebaseSearch)"/;
  return list.some((m) => roo.test(m.say || '') || (m.say === 'tool' || m.ask === 'tool') && rooTools.test(m.text || '')) ? 'Roo Code' : 'Cline';
}

const iso = (ms) => (typeof ms === 'number' && ms > 0 ? new Date(ms).toISOString() : null);
const json = (text) => { try { return JSON.parse(text); } catch { return null; } };

function parseUiMessages(list, { cwd, thinking }) {
  const events = [];
  const meta = { title: '', cwd, branch: '', model: '', version: '' };
  const tokens = { in: 0, out: 0 };
  let lastShell = null;
  let lastMcp = null;
  let lastWeb = null;
  let lastEdit = null;

  const prompt = (m) => {
    const images = m.images?.length || 0;
    const text = (m.text || '').trim();
    if (text || images) events.push({ type: 'prompt', text: text + (images ? `${text ? '\n' : ''}[${images} image${images > 1 ? 's' : ''}]` : ''), ts: iso(m.ts) });
  };
  const say = (text, ts) => { if (text?.trim()) events.push({ type: 'text', text: text.trim(), ts }); };
  const note = (text, ts) => events.push({ type: 'note', text, ts });

  for (const m of list) {
    if (!m || (m.type !== 'say' && m.type !== 'ask')) continue;
    const ts = iso(m.ts);
    const kind = m.type === 'say' ? m.say : m.ask;
    if (!meta.model && m.modelInfo?.modelId) meta.model = m.modelInfo.modelId;

    switch (kind) {
      case 'task':
      case 'user_feedback':
        prompt(m);
        break;
      case 'text':
        // Roo Code opens a task with say:"text" instead of say:"task".
        if (!events.some((e) => e.type === 'prompt')) prompt(m);
        else say(m.text, ts);
        break;
      case 'reasoning':
        if (thinking && m.text?.trim()) events.push({ type: 'thinking', text: m.text, ts });
        break;
      case 'completion_result':
        say((m.text || '').replace(/HAS_CHANGES$/, ''), ts);
        break;
      case 'followup': {
        const q = json(m.text);
        say(q ? [q.question, ...(q.options || []).map((o) => `- ${o}`)].filter(Boolean).join('\n') : m.text, ts);
        break;
      }
      case 'plan_mode_respond':
      case 'act_mode_respond': {
        const r = json(m.text);
        say(r ? r.response : m.text, ts);
        break;
      }
      case 'command': {
        // Commands that need approval end in this marker.
        const command = (m.text || '').replace(/REQ_APP$/, '').trim();
        if (!command) break;
        lastShell = toolEvent('Bash', { command }, meta.cwd, ts);
        events.push(lastShell);
        break;
      }
      case 'command_output':
        if (lastShell && m.text) {
          lastShell.output = truncate((lastShell.raw = (lastShell.raw || '') + m.text + '\n').trimEnd());
          lastShell.end = ts;
        }
        break;
      case 'tool': {
        const t = json(m.text);
        if (!t) break;
        const ev = sayTool(t, meta.cwd, ts);
        if (!ev) break;
        if (ev.type === 'note') { events.push(ev); break; }
        if (ev.kind === 'edit' || ev.kind === 'write') lastEdit = ev;
        events.push(ev);
        break;
      }
      case 'diff_error':
        if (lastEdit) lastEdit.error = true;
        break;
      case 'use_mcp_server': {
        const u = json(m.text);
        if (!u) break;
        const args = json(u.arguments) || (u.uri ? { uri: u.uri } : {});
        lastMcp = toolEvent(`mcp__${u.serverName || 'mcp'}__${u.toolName || 'resource'}`, args, meta.cwd, ts);
        events.push(lastMcp);
        break;
      }
      case 'mcp_server_response':
        if (lastMcp) { lastMcp.output = truncate(m.text || ''); lastMcp.end = ts; }
        break;
      case 'browser_action_launch':
        lastWeb = toolEvent('WebFetch', { url: m.text || '' }, meta.cwd, ts);
        events.push(lastWeb);
        break;
      case 'browser_action': {
        const a = json(m.text);
        if (!a) break;
        lastWeb = { ...toolEvent('WebFetch', { url: '' }, meta.cwd, ts), title: ['Browser', a.action, a.coordinate || a.text].filter(Boolean).join(' ') };
        events.push(lastWeb);
        break;
      }
      case 'browser_action_result': {
        // The result carries a base64 screenshot; keep only the logs and the page.
        const r = json(m.text);
        if (lastWeb && r) { lastWeb.output = truncate([r.currentUrl, r.logs].filter(Boolean).join('\n')); lastWeb.end = ts; }
        break;
      }
      case 'api_req_started': {
        const r = json(m.text);
        if (!r) break;
        tokens.in += (r.tokensIn || 0) + (r.cacheReads || 0) + (r.cacheWrites || 0);
        tokens.out += r.tokensOut || 0;
        const dir = !meta.cwd && String(r.request || '').match(/# Current Working Directory \(([^)\n]+)\)/);
        if (dir) meta.cwd = dir[1];
        if (r.cancelReason === 'user_cancelled') note('Interrupted by user', ts);
        break;
      }
      case 'error':
        note(`Error: ${firstLine(m.text, 160)}`, ts);
        break;
      case 'api_req_failed':
        note('API request failed', ts);
        break;
      case 'mistake_limit_reached':
        note('Stopped after repeated mistakes', ts);
        break;
      case 'condense_context':
      case 'summarize_task':
        note('Context compacted', ts);
        break;
      case 'compaction':
        if (json(m.text)?.status === 'completed') note('Context compacted', ts);
        break;
      case 'subtask_result':
        say(m.text, ts);
        break;
    }
  }

  for (const e of events) delete e.raw;
  return finish(events, meta, tokens);
}

// The JSON a tool message carries (ClineSayTool; Roo Code added a few tools).
function sayTool(t, cwd, ts) {
  const p = t.path || '';
  const out = (ev) => ({ ...ev, output: t.content && ev.kind !== 'read' ? truncate(t.content) : '' });
  switch (t.tool) {
    case 'editedExistingFile':
    case 'appliedDiff':
    case 'searchAndReplace':
    case 'insertContent':
      return editEvent(p, t.diff || t.content || '', cwd, ts);
    case 'newFileCreated':
      return toolEvent('Write', { file_path: p, content: t.content || '' }, cwd, ts);
    case 'fileDeleted':
      return deleted(p, cwd, ts);
    case 'readFile':
      return toolEvent('Read', { file_path: p }, cwd, ts);
    case 'listFilesTopLevel':
    case 'listFilesRecursive':
      return out(toolEvent('Glob', { pattern: `${p || '.'}/${t.tool === 'listFilesRecursive' ? '**' : '*'}` }, cwd, ts));
    case 'listCodeDefinitionNames':
      return out(toolEvent('Grep', { pattern: 'definitions', path: p }, cwd, ts));
    case 'searchFiles':
      return out(toolEvent('Grep', { pattern: t.regex || '', path: p }, cwd, ts));
    case 'codebaseSearch':
      return out(toolEvent('Grep', { pattern: t.query || '', path: p }, cwd, ts));
    case 'webFetch':
      return toolEvent('WebFetch', { url: p }, cwd, ts);
    case 'webSearch':
      return toolEvent('WebSearch', { query: p }, cwd, ts);
    case 'updateTodoList':
      return Array.isArray(t.todos) ? toolEvent('TodoWrite', { todos: t.todos }, cwd, ts) : null;
    case 'newTask':
      return toolEvent('Task', { description: t.mode ? `${t.mode} subtask` : 'Subtask', prompt: t.content || '' }, cwd, ts);
    case 'switchMode':
      return { type: 'note', text: `Switched to ${t.mode || 'another'} mode`, ts };
    case 'summarizeTask':
      return { type: 'note', text: 'Context compacted', ts };
    case 'finishTask':
      return null;
  }
  return toolEvent(t.tool || 'tool', { ...(p ? { path: p } : {}), ...(t.content ? { content: t.content } : {}) }, cwd, ts);
}

function parseSdkMessages(messages, { cwd, thinking }) {
  const events = [];
  const tools = new Map();
  const meta = { title: '', cwd, branch: '', model: '', version: '' };
  const tokens = { in: 0, out: 0 };

  for (const m of messages) {
    const ts = iso(m.ts);
    if (!meta.model && m.modelInfo?.id) meta.model = m.modelInfo.id;
    if (m.metrics) {
      tokens.in += (m.metrics.inputTokens || 0) + (m.metrics.cacheReadTokens || 0) + (m.metrics.cacheWriteTokens || 0);
      tokens.out += m.metrics.outputTokens || 0;
    }
    const blocks = typeof m.content === 'string' ? [{ type: 'text', text: m.content }] : Array.isArray(m.content) ? m.content : [];

    if (m.role === 'user') {
      let text = '';
      let images = 0;
      for (const b of blocks) {
        if (b.type === 'tool_result') {
          const ev = tools.get(b.tool_use_id);
          if (!ev) continue;
          const result = typeof b.content === 'string' ? b.content : (b.content || []).map((c) => (c.type === 'text' ? c.text : c.type === 'image' ? '[image]' : '')).join('\n');
          ev.output = ev.kind === 'read' ? truncate(result, 30, 3000) : truncate(result);
          ev.error = Boolean(b.is_error);
          ev.end = ts;
        } else if (b.type === 'text') text += (text ? '\n' : '') + userInput(b.text);
        else if (b.type === 'image') images++;
      }
      text = text.trim();
      if (text || images) events.push({ type: 'prompt', text: text + (images ? `${text ? '\n' : ''}[${images} image${images > 1 ? 's' : ''}]` : ''), ts });
      continue;
    }

    for (const b of blocks) {
      if (b.type === 'text' && b.text?.trim()) events.push({ type: 'text', text: b.text, ts });
      else if (b.type === 'thinking' && thinking && b.thinking?.trim()) events.push({ type: 'thinking', text: b.thinking, ts });
      else if (b.type === 'tool_use') {
        // Some tools pass their input as a JSON string, a bare string or a list.
        const input = typeof b.input === 'string' ? json(b.input) ?? b.input : b.input || {};
        const ev = sdkTool(b.name, input, meta.cwd, ts);
        if (!ev) continue;
        if (ev.type === 'tool') tools.set(b.id, ev);
        events.push(ev);
      }
    }
  }
  return finish(events, meta, tokens);
}

// SDK tool names, mapped the way Cline's own message translator maps them.
function sdkTool(name, input, cwd, ts) {
  const p = input.path || input.file_path || '';
  switch (name) {
    case 'submit_and_exit':
    case 'attempt_completion': {
      const text = input.summary || input.result || '';
      return text.trim() ? { type: 'text', text, ts } : null;
    }
    case 'ask_question':
    case 'ask_followup_question': {
      const text = [input.question, ...(input.options || []).map((o) => `- ${o}`)].filter(Boolean).join('\n');
      return text ? { type: 'text', text, ts } : null;
    }
    case 'run_commands':
    case 'execute_command':
      return toolEvent('Bash', { command: commandText(input) }, cwd, ts);
    case 'read_files':
    case 'read_file': {
      const files = (Array.isArray(input.files) ? input.files : []).map((f) => (typeof f === 'string' ? f : f?.path)).filter(Boolean);
      const first = files[0] || p;
      const ev = toolEvent('Read', { file_path: first }, cwd, ts);
      return files.length > 1 ? { ...ev, title: `${ev.title} +${files.length - 1} more` } : ev;
    }
    case 'list_files':
      return toolEvent('Glob', { pattern: `${p || '.'}/${input.recursive ? '**' : '*'}` }, cwd, ts);
    case 'list_code_definition_names':
      return toolEvent('Grep', { pattern: 'definitions', path: p }, cwd, ts);
    case 'search_codebase':
    case 'search_files': {
      const q = typeof input === 'string' ? input : Array.isArray(input) ? input.join(', ')
        : Array.isArray(input.queries) ? input.queries.join(', ') : input.queries || input.regex || '';
      return toolEvent('Grep', { pattern: q, path: p }, cwd, ts);
    }
    case 'editor':
    case 'replace_in_file': {
      const oldText = input.old_text ?? input.old_str;
      const newText = input.new_text ?? input.new_str ?? input.content ?? '';
      if (input.diff || input.patch) return editEvent(p, input.diff || input.patch, cwd, ts);
      if (oldText != null) return toolEvent('Edit', { file_path: p, old_string: oldText, new_string: newText }, cwd, ts);
      if (input.insert_line != null) return toolEvent('Edit', { file_path: p, old_string: '', new_string: newText }, cwd, ts);
      return toolEvent('Write', { file_path: p, content: newText }, cwd, ts);
    }
    case 'write_to_file':
      return toolEvent('Write', { file_path: p, content: input.content ?? input.new_text ?? '' }, cwd, ts);
    case 'apply_patch':
      return editEvent(p, typeof input === 'string' ? input : input.input || input.patch || '', cwd, ts);
    case 'delete_file':
      return deleted(p, cwd, ts);
    case 'fetch_web_content':
    case 'web_fetch':
      return toolEvent('WebFetch', { url: input.url || input.requests?.[0]?.url || '' }, cwd, ts);
    case 'web_search':
      return toolEvent('WebSearch', { query: input.query || input.q || '' }, cwd, ts);
    case 'spawn_agent':
      return toolEvent('Task', { description: input.description || input.name || 'Subagent', prompt: input.prompt || input.task || '' }, cwd, ts);
  }
  // MCP tools are named server__tool.
  return toolEvent(name.includes('__') ? `mcp__${name}` : name, input, cwd, ts);
}

function commandText(input) {
  const one = (c) => (typeof c === 'string' ? c : [c?.command, ...(c?.args || [])].filter(Boolean).join(' '));
  if (typeof input === 'string') return input;
  if (Array.isArray(input)) return input.map(one).join(' && ');
  if (Array.isArray(input.commands)) return input.commands.map(one).join(' && ');
  if (input.commands) return one(input.commands);
  return one(input);
}

// What the person typed, without the wrappers Cline adds around it.
function userInput(text) {
  const t = String(text || '');
  const typed = t.match(/<user_input\b[^>]*>([\s\S]*?)<\/user_input>/);
  if (typed) return typed[1].trim();
  const cmd = t.match(/<user_command slash="([^"]*)">([\s\S]*?)<\/user_command>/);
  if (cmd) return `/${cmd[1]} ${cmd[2]}`.trim();
  return t.replace(/<(mode_notice|file_content|environment_details)\b[^>]*>[\s\S]*?<\/\1>/g, '').trim();
}

// An edit as Cline records it: SEARCH/REPLACE blocks, an apply_patch, a unified
// diff (Roo Code), or the whole new file when the model rewrote it.
function editEvent(path, text, cwd, ts) {
  const base = { type: 'tool', name: 'Edit', ts, end: null, output: '', error: false };
  const s = String(text || '');
  if (/^\*\*\* (Begin Patch|Update File|Add File|Delete File)/m.test(s)) return patch(base, s, cwd);
  const blocks = searchReplace(s);
  if (blocks.length) return toolEvent('MultiEdit', { file_path: path, edits: blocks }, cwd, ts);
  if (/^@@ /m.test(s)) {
    const diff = [];
    for (const line of s.split('\n')) {
      if (/^(@@|\+\+\+ |--- |Index: |=+$|\\ No newline)/.test(line)) continue;
      if (line.startsWith('+')) diff.push(['+', line.slice(1)]);
      else if (line.startsWith('-')) diff.push(['-', line.slice(1)]);
      else if (line.startsWith(' ')) diff.push([' ', line.slice(1)]);
    }
    return { ...base, kind: 'edit', title: shortPath(path, cwd), detail: editDetail(shortPath(path, cwd), diff) };
  }
  return { ...toolEvent('Write', { file_path: path, content: s }, cwd, ts), kind: 'edit', name: 'Edit' };
}

// "------- SEARCH / ======= / +++++++ REPLACE" (Cline) and "<<<<<<< SEARCH /
// ======= / >>>>>>> REPLACE" (older Cline, Roo Code with :start_line: hints).
export function searchReplace(text) {
  const edits = [];
  let mode = null;
  let oldLines = [];
  let newLines = [];
  for (const line of text.split('\n')) {
    if (/^(-{3,}|<{3,}) ?SEARCH>?\s*$/.test(line)) { mode = 'old'; oldLines = []; newLines = []; continue; }
    if (mode === 'old' && /^={3,}\s*$/.test(line)) { mode = 'new'; continue; }
    if (mode === 'new' && /^(\+{3,}|>{3,}) ?REPLACE<?\s*$/.test(line)) {
      edits.push({ old_string: oldLines.join('\n'), new_string: newLines.join('\n') });
      mode = null;
      continue;
    }
    if (mode === 'old') {
      if (!oldLines.length && /^:(start|end)_line:\s*\d+\s*$/.test(line)) continue;
      if (!oldLines.length && /^-{3,}\s*$/.test(line)) continue;
      oldLines.push(line);
    } else if (mode === 'new') newLines.push(line);
  }
  return edits;
}

function deleted(path, cwd, ts) {
  const p = shortPath(path, cwd);
  return { type: 'tool', name: 'Delete', kind: 'edit', title: p, detail: editDetail(p, [['-', '(file deleted)']]), ts, end: null, output: '', error: false };
}

function finish(events, meta, tokens) {
  meta.title = firstLine(events.find((e) => e.type === 'prompt')?.text || 'Untitled session', 80);
  const stamps = events.map((e) => e.ts).filter(Boolean);
  return { agent: 'Cline', ...meta, startedAt: stamps[0] || null, endedAt: stamps.at(-1) || null, events, stats: { ...computeStats(events), tokens } };
}

// Codex rollouts: ~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl
// Only `response_item` lines are used; `event_msg` lines repeat the same content.

import { truncate, editDetail, firstLine, shortPath, computeStats, cleanPrompt } from './session.js';
import { toolEvent } from './claude.js';

export function parseCodex(raw, { thinking = false } = {}) {
  const events = [];
  const calls = new Map();
  const tokens = { in: 0, out: 0 };
  const meta = { agent: 'Codex', title: '', cwd: '', branch: '', model: '', version: '' };

  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;
    let d;
    try { d = JSON.parse(line); } catch { continue; }
    const p = d.payload || {};
    const ts = d.timestamp;

    if (d.type === 'session_meta') {
      meta.cwd = p.cwd || meta.cwd;
      meta.version = p.cli_version || '';
      meta.branch = p.git?.branch || '';
      continue;
    }
    if (d.type === 'turn_context') {
      if (p.model && !meta.model) meta.model = p.model;
      continue;
    }
    // token_count events carry running totals; the last one is the session's.
    if (d.type === 'event_msg' && p.type === 'token_count' && p.info?.total_token_usage) {
      const t = p.info.total_token_usage;
      tokens.in = t.input_tokens || 0;
      tokens.out = t.output_tokens || 0;
      continue;
    }
    if (d.type === 'compacted') { events.push({ type: 'note', text: 'Context compacted', ts }); continue; }
    if (d.type !== 'response_item') continue;

    switch (p.type) {
      case 'message': {
        const text = (p.content || []).map((c) => c.text || '').join('\n');
        if (p.role === 'assistant' && text.trim()) events.push({ type: 'text', text, ts });
        if (p.role === 'user') {
          const clean = cleanPrompt(text);
          if (clean && !clean.startsWith('# AGENTS.md instructions')) events.push({ type: 'prompt', text: clean, ts });
        }
        break;
      }
      case 'reasoning': {
        const text = (p.summary || []).map((s) => s.text || '').join('\n\n');
        if (thinking && text.trim()) events.push({ type: 'thinking', text, ts });
        break;
      }
      case 'function_call':
      case 'custom_tool_call':
      case 'local_shell_call': {
        const ev = codexTool(p, meta.cwd, ts);
        calls.set(p.call_id || p.id, ev);
        events.push(ev);
        break;
      }
      case 'function_call_output':
      case 'custom_tool_call_output':
      case 'local_shell_call_output': {
        const ev = calls.get(p.call_id);
        if (!ev) break;
        const { text, error } = codexOutput(p.output);
        ev.output = truncate(text);
        ev.error = error;
        ev.end = ts;
        break;
      }
    }
  }

  meta.title = firstLine(events.find((e) => e.type === 'prompt')?.text || 'Untitled session', 80);
  const stamps = events.map((e) => e.ts).filter(Boolean);
  return { ...meta, startedAt: stamps[0] || null, endedAt: stamps.at(-1) || null, events, stats: { ...computeStats(events), tokens } };
}

function codexTool(p, cwd, ts) {
  const base = { type: 'tool', name: p.name || 'shell', ts, end: null, output: '', error: false };
  if (p.type === 'local_shell_call') return shell(base, p.action?.command);

  let args = {};
  if (p.type === 'function_call') {
    try { args = JSON.parse(p.arguments || '{}'); } catch { args = { raw: p.arguments }; }
  }
  const name = p.name || '';
  if (name === 'apply_patch') return patch(base, p.input ?? args.input ?? '', cwd);
  if (['shell', 'shell_command', 'exec_command', 'container.exec'].includes(name)) return shell(base, args.command ?? args.cmd);
  if (name === 'update_plan' && Array.isArray(args.plan)) {
    return { ...base, kind: 'plan', title: 'Plan', detail: { items: args.plan.map((s) => ({ text: s.step || '', status: s.status || 'pending' })) } };
  }
  if (p.type === 'custom_tool_call') {
    return { ...base, kind: 'other', title: `${name}: ${firstLine(p.input, 80)}`, detail: { input: truncate(String(p.input || ''), 40, 3000) } };
  }
  return toolEvent(name, args, cwd, ts);
}

function shell(base, command) {
  let cmd = Array.isArray(command) ? command : [String(command ?? '')];
  // ["bash", "-lc", "npm test"] -> "npm test"
  if (cmd.length === 3 && /(^|\/)(ba|z)?sh$/.test(cmd[0]) && /^-l?c$/.test(cmd[1])) cmd = [cmd[2]];
  const text = cmd.join(' ');
  return { ...base, kind: 'shell', title: firstLine(text, 120), detail: { command: text, description: '' } };
}

export function patch(base, input, cwd) {
  const diff = [];
  const paths = [];
  for (const line of String(input).split('\n')) {
    const file = line.match(/^\*\*\* (Update|Add|Delete) File: (.+)$/);
    if (file) {
      const path = shortPath(file[2].trim(), cwd);
      if (paths.length) diff.push(['…', path]);
      paths.push(path);
      if (file[1] === 'Delete') diff.push(['-', '(file deleted)']);
      continue;
    }
    if (line.startsWith('***') || line.startsWith('@@')) continue;
    if (line.startsWith('+')) diff.push(['+', line.slice(1)]);
    else if (line.startsWith('-')) diff.push(['-', line.slice(1)]);
    else if (line.startsWith(' ')) diff.push([' ', line.slice(1)]);
  }
  const title = paths.length > 1 ? `${paths[0]} +${paths.length - 1} more` : paths[0] || 'patch';
  return { ...base, kind: 'edit', title, detail: { ...editDetail(paths[0] || '', diff), paths } };
}

function codexOutput(output) {
  let text = typeof output === 'string' ? output : Array.isArray(output) ? output.map((o) => o.text || '').join('') : JSON.stringify(output ?? '');
  let error = false;
  // Classic CLI wraps shell output as {"output": "...", "metadata": {"exit_code": 0}}
  if (text.startsWith('{"output"')) {
    try {
      const j = JSON.parse(text);
      text = j.output ?? text;
      error = (j.metadata?.exit_code ?? 0) !== 0;
    } catch { /* keep raw text */ }
  }
  const code = text.match(/^(?:Exit code|Process exited with code):? (\d+)/m);
  if (code) error = code[1] !== '0';
  return { text, error };
}


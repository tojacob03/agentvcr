// Cursor agent transcripts: ~/.cursor/projects/<encoded-cwd>/agent-transcripts/<id>/<id>.jsonl
// One {role, message} object per line. Cursor records tool calls but not their
// results, and no per-step timestamps, so replays play by step, not by clock.

import { firstLine, computeStats } from './session.js';
import { toolEvent } from './claude.js';

export function parseCursor(raw) {
  const events = [];
  const meta = { agent: 'Cursor', title: '', cwd: '', branch: '', model: '', version: '', startedAt: null };

  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;
    let d;
    try { d = JSON.parse(line); } catch { continue; }

    if (d.type === 'turn_ended') {
      if (d.status === 'error') events.push({ type: 'note', text: /abort/i.test(d.error || '') ? 'Interrupted by user' : `Turn failed: ${d.error || 'unknown error'}`, ts: null });
      continue;
    }
    const blocks = Array.isArray(d.message?.content) ? d.message.content : [];

    if (d.role === 'user') {
      const text = blocks.filter((b) => b.type === 'text').map((b) => b.text).join('\n');
      if (!meta.startedAt) meta.startedAt = cursorTimestamp(text);
      const prompt = userQuery(text);
      if (prompt) events.push({ type: 'prompt', text: prompt, ts: null });
      continue;
    }
    if (d.role !== 'assistant') continue;
    for (const b of blocks) {
      if (b.type === 'text' && b.text?.trim()) events.push({ type: 'text', text: b.text, ts: null });
      else if (b.type === 'tool_use') {
        const ev = cursorTool(b.name, b.input || {});
        if (ev) events.push(ev);
      }
    }
  }

  meta.title = firstLine(events.find((e) => e.type === 'prompt')?.text || 'Untitled session', 80);
  return { ...meta, endedAt: null, events, stats: computeStats(events) };
}

function cursorTool(name, input) {
  const p = input.path || '';
  switch (name) {
    case 'GetDynamicTools': return null; // tool discovery, not work
    case 'Shell': return toolEvent('Bash', { command: input.command, description: input.description }, '', null);
    case 'StrReplace': return toolEvent('Edit', { file_path: p, old_string: input.old_string, new_string: input.new_string }, '', null);
    case 'Write': return toolEvent('Write', { file_path: p, content: input.contents ?? input.content ?? '' }, '', null);
    case 'Read': return toolEvent('Read', { file_path: p }, '', null);
    case 'Glob': return toolEvent('Glob', { pattern: input.glob_pattern, path: input.target_directory }, '', null);
    case 'Grep': return toolEvent('Grep', { pattern: input.pattern, path: p }, '', null);
    case 'CallDynamicTool': {
      const args = input.arguments || {};
      if (/todo/i.test(input.toolName || '')) return toolEvent('TodoWrite', args, '', null);
      return toolEvent(`mcp__${input.namespace || 'cursor'}__${input.toolName || 'tool'}`, args, '', null);
    }
  }
  return toolEvent(name, input, '', null);
}

// Cursor wraps what the user typed in <user_query> next to context it attached.
function userQuery(text) {
  const q = text.match(/<user_query>([\s\S]*?)<\/user_query>/);
  const body = q ? q[1] : text.replace(/<(\w+)[^>]*>[\s\S]*?<\/\1>/g, '');
  return body.trim();
}

// "<timestamp>Thursday, Sep 17, 2026, 7:30 PM (UTC+2)</timestamp>"
export function cursorTimestamp(text) {
  const m = String(text).match(/<timestamp>\w+, (\w{3}) (\d{1,2}), (\d{4}), (\d{1,2}):(\d{2}) (AM|PM) \(UTC([+-]\d{1,2})(?::?(\d{2}))?\)<\/timestamp>/);
  if (!m) return null;
  const [, mon, day, year, hh, mm, ap, oh, om = '00'] = m;
  const month = 'JanFebMarAprMayJunJulAugSepOctNovDec'.indexOf(mon) / 3;
  if (month < 0) return null;
  let hour = +hh % 12 + (ap === 'PM' ? 12 : 0);
  const offset = Math.sign(+oh || 1) * (Math.abs(+oh) * 60 + +om);
  const utc = Date.UTC(+year, month, +day, hour, +mm) - offset * 60000;
  return new Date(utc).toISOString();
}

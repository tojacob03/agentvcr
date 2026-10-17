// Finds session files on disk for each supported agent.

import { readdirSync, statSync, openSync, readSync, closeSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';
import { homedir } from 'node:os';
import { createHash } from 'node:crypto';
import { detectAgent } from './detect.js';

export const claudeRoot = () => join(process.env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude'), 'projects');
export const codexRoot = () => join(process.env.CODEX_HOME || join(homedir(), '.codex'), 'sessions');
export const cursorRoot = () => join(homedir(), '.cursor', 'projects');
export const geminiRoot = () => join(process.env.GEMINI_CLI_HOME || join(homedir(), '.gemini'), 'tmp');

// Claude Code stores each project under its cwd with every non-alphanumeric char as "-".
export const encodeCwd = (cwd) => cwd.replace(/[^A-Za-z0-9]/g, '-');

export { detectAgent };

export function listSessions({ cwd = process.cwd(), all = false } = {}) {
  const out = [];
  const croot = claudeRoot();
  if (existsSync(croot)) {
    const dirs = all ? safeReaddir(croot).map((d) => join(croot, d)) : [join(croot, encodeCwd(cwd))];
    for (const dir of dirs) {
      for (const f of safeReaddir(dir)) {
        if (f.endsWith('.jsonl')) out.push(entry('claude', join(dir, f)));
      }
    }
  }
  for (const path of walk(codexRoot(), (f) => f.startsWith('rollout-') && f.endsWith('.jsonl'))) {
    if (!all && codexCwd(path) !== cwd) continue;
    out.push(entry('codex', path));
  }
  // Cursor encodes the project path like Claude Code, minus the leading slash.
  const cursorDir = all ? cursorRoot() : join(cursorRoot(), cwd.replace(/^[\\/]+/, '').replace(/[^A-Za-z0-9]/g, '-'));
  for (const path of walk(cursorDir, (f, p) => f.endsWith('.jsonl') && /agent-transcripts/.test(p))) out.push(entry('cursor', path));
  // Gemini CLI keys project folders by a hash of the project root.
  const hash = createHash('sha256').update(cwd).digest('hex');
  for (const path of walk(geminiRoot(), (f, p) => /^session-.*\.jsonl?$/.test(f) && /[\\/]chats[\\/]/.test(p))) {
    if (!all && !path.includes(hash) && !readHead(path).includes(JSON.stringify(cwd).slice(1, -1))) continue;
    out.push(entry('gemini', path));
  }
  return out.filter((s) => s.size > 0).sort((a, b) => b.mtime - a.mtime);
}

// Resolve "abc123" (a session id prefix) to a file across both agents.
export function findById(id) {
  return listSessions({ all: true }).find((s) => basename(s.path).includes(id)) || null;
}

function entry(agent, path) {
  const st = statSync(path);
  return { agent, path, mtime: st.mtimeMs, size: st.size };
}

function codexCwd(path) {
  const m = readHead(path).match(/"cwd":"((?:[^"\\]|\\.)*)"/);
  if (!m) return '';
  try { return JSON.parse(`"${m[1]}"`); } catch { return m[1]; }
}

export function readHead(path, bytes = 65536) {
  try {
    const fd = openSync(path, 'r');
    const buf = Buffer.alloc(bytes);
    const n = readSync(fd, buf, 0, bytes, 0);
    closeSync(fd);
    return buf.subarray(0, n).toString('utf8');
  } catch {
    return '';
  }
}

export function readTail(path, bytes = 65536) {
  try {
    const fd = openSync(path, 'r');
    const size = statSync(path).size;
    const start = Math.max(0, size - bytes);
    const buf = Buffer.alloc(size - start);
    const n = readSync(fd, buf, 0, buf.length, start);
    closeSync(fd);
    return buf.subarray(0, n).toString('utf8');
  } catch {
    return '';
  }
}

function* walk(dir, match) {
  for (const name of safeReaddir(dir)) {
    const p = join(dir, name);
    let st;
    try { st = statSync(p); } catch { continue; }
    if (st.isDirectory()) yield* walk(p, match);
    else if (match(name, p)) yield p;
  }
}

function safeReaddir(dir) {
  try { return readdirSync(dir); } catch { return []; }
}

// Finds session files on disk for each supported agent.

import { readdirSync, readFileSync, statSync, openSync, readSync, closeSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';
import { homedir } from 'node:os';
import { createHash } from 'node:crypto';
import { detectAgent } from './detect.js';

export const claudeRoot = () => join(process.env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude'), 'projects');
export const codexRoot = () => join(process.env.CODEX_HOME || join(homedir(), '.codex'), 'sessions');
export const cursorRoot = () => join(homedir(), '.cursor', 'projects');
// Gemini CLI treats GEMINI_CLI_HOME as the home directory, with .gemini inside it.
export const geminiRoot = () => join(process.env.GEMINI_CLI_HOME || homedir(), '.gemini', 'tmp');

// Cline keeps its data in ~/.cline/data: tasks/ for the Cline CLI before its SDK,
// sessions/ for every Cline session since. Before the SDK, the VS Code extension
// and its forks Roo Code and Kilo Code kept tasks in the editor's global storage.
export const clineDataRoot = () => process.env.CLINE_DATA_DIR || join(process.env.CLINE_DIR || join(homedir(), '.cline'), 'data');
const EDITORS = ['Code', 'Code - Insiders', 'Cursor', 'Windsurf', 'VSCodium'];
const CLINE_EXTENSIONS = ['saoudrizwan.claude-dev', 'rooveterinaryinc.roo-cline', 'kilocode.kilo-code'];
export function clineTaskRoots() {
  const config = process.platform === 'darwin' ? join(homedir(), 'Library', 'Application Support')
    : process.platform === 'win32' ? process.env.APPDATA || join(homedir(), 'AppData', 'Roaming')
    : process.env.XDG_CONFIG_HOME || join(homedir(), '.config');
  return [join(clineDataRoot(), 'tasks'), ...EDITORS.flatMap((e) => CLINE_EXTENSIONS.map((x) => join(config, e, 'User', 'globalStorage', x, 'tasks')))];
}

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
  // Older Cline tasks name the project in their first request (JSON inside JSON);
  // SDK sessions keep it in a manifest next to the messages.
  const quoted = [cwd, JSON.stringify(cwd).slice(1, -1), JSON.stringify(JSON.stringify(cwd).slice(1, -1)).slice(1, -1)];
  for (const root of clineTaskRoots()) {
    for (const id of safeReaddir(root)) {
      const path = join(root, id, 'ui_messages.json');
      if (!existsSync(path)) continue;
      const head = all ? '' : readHead(path, 262144);
      if (!all && !quoted.some((q) => head.includes(`Current Working Directory (${q})`))) continue;
      out.push(entry('cline', path));
    }
  }
  const sessions = process.env.CLINE_SESSION_DATA_DIR || join(clineDataRoot(), 'sessions');
  for (const id of safeReaddir(sessions)) {
    const path = join(sessions, id, `${id}.messages.json`);
    if (!existsSync(path)) continue;
    if (!all && manifestCwd(join(sessions, id, `${id}.json`)) !== cwd) continue;
    out.push(entry('cline', path));
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

function manifestCwd(path) {
  try { return JSON.parse(readFileSync(path, 'utf8')).cwd || ''; } catch { return ''; }
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

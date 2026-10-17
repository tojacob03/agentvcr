import { readFileSync } from 'node:fs';
import { homedir, userInfo } from 'node:os';
import { parseTranscript } from './parse.js';
import { renderHtml, renderViewer, toPlayerData } from './render.js';

export { renderHtml, renderViewer, toPlayerData, parseTranscript };

export function loadSession(path, opts = {}) {
  let user = '';
  try { user = userInfo().username; } catch { /* no user, nothing to mask */ }
  return parseTranscript(readFileSync(path, 'utf8'), { ...opts, path, home: homedir(), user });
}

import { readFileSync } from 'node:fs';
import { homedir, userInfo } from 'node:os';
import { parseTranscript } from './parse.js';
import { renderHtml, renderViewer, toPlayerData } from './render.js';
import { renderMarkdown } from './markdown.js';

export { renderHtml, renderViewer, renderMarkdown, toPlayerData, parseTranscript };

export function loadSession(path, opts = {}) {
  let user = '';
  try { user = userInfo().username; } catch { /* no user, nothing to mask */ }
  // Cline keeps the working directory in a manifest next to the messages file.
  let cwd = '';
  if (/\.messages\.json$/.test(path)) {
    try { cwd = JSON.parse(readFileSync(path.replace(/\.messages\.json$/, '.json'), 'utf8')).cwd || ''; } catch { /* no manifest */ }
  }
  return parseTranscript(readFileSync(path, 'utf8'), { ...opts, path, home: homedir(), user, cwd });
}

import { readFileSync } from 'node:fs';
import { parseClaude } from './claude.js';
import { parseCodex } from './codex.js';
import { parseCursor } from './cursor.js';
import { parseGemini } from './gemini.js';
import { makeRedactor, deepMap } from './redact.js';
import { detectAgent, readHead } from './sources.js';
import { renderHtml, renderViewer, toPlayerData } from './render.js';

export { renderHtml, renderViewer, toPlayerData };

export function loadSession(path, { redact = true, thinking = false, sidechains = false, title } = {}) {
  const raw = readFileSync(path, 'utf8');
  const agent = detectAgent(path, readHead(path));
  const parsers = {
    codex: () => parseCodex(raw, { thinking }),
    cursor: () => parseCursor(raw),
    gemini: () => parseGemini(raw, { thinking }),
    claude: () => parseClaude(raw, { thinking, sidechains }),
  };
  let session = parsers[agent]();
  if (title) session.title = title;
  let redactions = 0;
  if (redact) {
    const r = makeRedactor();
    session = deepMap(session, r);
    redactions = r.count;
  }
  return { session, redactions };
}

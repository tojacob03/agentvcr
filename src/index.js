import { readFileSync } from 'node:fs';
import { parseClaude } from './claude.js';
import { parseCodex } from './codex.js';
import { makeRedactor, deepMap } from './redact.js';
import { detectAgent, readHead } from './sources.js';
import { renderHtml } from './render.js';

export { renderHtml };

export function loadSession(path, { redact = true, thinking = false, sidechains = false, title } = {}) {
  const raw = readFileSync(path, 'utf8');
  const agent = detectAgent(path, readHead(path));
  let session = agent === 'codex' ? parseCodex(raw, { thinking }) : parseClaude(raw, { thinking, sidechains });
  if (title) session.title = title;
  let redactions = 0;
  if (redact) {
    const r = makeRedactor();
    session = deepMap(session, r);
    redactions = r.count;
  }
  return { session, redactions };
}

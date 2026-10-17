import { parseClaude } from './claude.js';
import { parseCodex } from './codex.js';
import { parseCursor } from './cursor.js';
import { parseGemini } from './gemini.js';
import { detectAgent } from './detect.js';
import { makeRedactor, deepMap } from './redact.js';

// Parse any supported transcript and optionally mask it. No Node APIs, so the
// same code runs in the CLI and on the website.
export function parseTranscript(raw, { path = '', redact = true, home = '', user = '', thinking = false, sidechains = false, title } = {}) {
  const agent = detectAgent(path, raw.slice(0, 65536));
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
    const r = makeRedactor({ home, user });
    session = deepMap(session, r);
    redactions = r.count;
  }
  return { session, redactions };
}

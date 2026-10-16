// Replays get shared publicly, so anything that looks like a secret is masked
// before it ever reaches the HTML. Patterns err on the side of masking too much.

import { homedir, userInfo } from 'node:os';

const PATTERNS = [
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, '[private key]'],
  [/\bsk-ant-[A-Za-z0-9_-]{20,}/g, '[anthropic key]'],
  [/\bsk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{20,}/g, '[api key]'],
  [/\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{30,}/g, '[github token]'],
  [/\bgithub_pat_[A-Za-z0-9_]{40,}/g, '[github token]'],
  [/\bglpat-[A-Za-z0-9_-]{20,}/g, '[gitlab token]'],
  [/\bxox[abposr]-[A-Za-z0-9-]{10,}/g, '[slack token]'],
  [/\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g, '[aws key]'],
  [/\bAIza[0-9A-Za-z_-]{35}\b/g, '[google key]'],
  [/\b(?:sk|pk|rk)_(?:live|test)_[A-Za-z0-9]{20,}/g, '[stripe key]'],
  [/\bnpm_[A-Za-z0-9]{36}\b/g, '[npm token]'],
  [/\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g, '[jwt]'],
  [/\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{16,}/g, '$1 [token]'],
  [/\b([a-z][a-z0-9+.-]*:\/\/)[^\s:@/]+:[^\s@/]+@/gi, '$1[credentials]@'],
  // KEY=value / "api_key": "value" for names that suggest a secret. The value must mix
  // letters and digits, which skips `max_tokens: 5000`, `token: string` and `$ENV_VAR`.
  [/((?:api[_-]?key|secret|token(?!s)|passw(?:or)?d|pwd|auth(?!or)|credential|private[_-]?key|access[_-]?key)[A-Za-z0-9_]*["']?\s*[:=]\s*["']?)(?=[^\s"',;]*\d)(?=[^\s"',;]*[A-Za-z])([^\s"',;$][^\s"',;]{5,})/gi, '$1[redacted]'],
  // noreply addresses (commit trailers) are public by design.
  [/\b(?![A-Za-z0-9._%+-]*noreply)[A-Za-z0-9._%+-]+@(?![A-Za-z0-9.-]*noreply)[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, '[email]'],
];

export function makeRedactor({ home = homedir(), user = safeUser() } = {}) {
  const homeRe = home && home.length > 1 ? new RegExp(escapeRe(home), 'g') : null;
  const userRe = user && user.length > 2 ? new RegExp(`\\b${escapeRe(user)}\\b`, 'g') : null;
  const redact = function (text) {
    if (typeof text !== 'string' || !text) return text;
    let t = text;
    for (const [re, rep] of PATTERNS) {
      t = t.replace(re, (...m) => {
        redact.count++;
        return rep.replace(/\$(\d)/g, (_, n) => m[+n] ?? '');
      });
    }
    if (homeRe) t = t.replace(homeRe, '~');
    if (userRe) t = t.replace(userRe, 'user');
    return t;
  };
  redact.count = 0;
  return redact;
}

// Apply a string transform to every string in a JSON-like value.
export function deepMap(value, fn) {
  if (typeof value === 'string') return fn(value);
  if (Array.isArray(value)) return value.map((v) => deepMap(v, fn));
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = k === 'ts' || k === 'end' ? v : deepMap(v, fn);
    return out;
  }
  return value;
}

function safeUser() {
  try { return userInfo().username; } catch { return ''; }
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Replays get shared publicly, so anything that looks like a secret is masked
// before it ever reaches the HTML. Patterns err on the side of masking too much.

// [pattern, replacement, group]. Groups let a caller switch rules off (the
// website's demo does) and name what was masked.
export const PATTERNS = [
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, '[private key]', 'keys'],
  [/\bsk-ant-[A-Za-z0-9_-]{20,}/g, '[anthropic key]', 'keys'],
  [/\bsk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{20,}/g, '[api key]', 'keys'],
  [/\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{30,}/g, '[github token]', 'tokens'],
  [/\bgithub_pat_[A-Za-z0-9_]{40,}/g, '[github token]', 'tokens'],
  [/\bglpat-[A-Za-z0-9_-]{20,}/g, '[gitlab token]', 'tokens'],
  [/\bxox[abposr]-[A-Za-z0-9-]{10,}/g, '[slack token]', 'tokens'],
  [/\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g, '[aws key]', 'keys'],
  [/\bAIza[0-9A-Za-z_-]{35}\b/g, '[google key]', 'keys'],
  [/\b(?:sk|pk|rk)_(?:live|test)_[A-Za-z0-9]{20,}/g, '[stripe key]', 'keys'],
  [/\bnpm_[A-Za-z0-9]{36}\b/g, '[npm token]', 'tokens'],
  [/\bhf_[A-Za-z0-9]{30,}\b/g, '[hugging face token]', 'tokens'],
  [/\bsk-or-v1-[a-f0-9]{40,}\b/g, '[openrouter key]', 'keys'],
  [/\bgsk_[A-Za-z0-9]{40,}\b/g, '[groq key]', 'keys'],
  [/\br8_[A-Za-z0-9]{30,}\b/g, '[replicate token]', 'tokens'],
  [/\bsbp_[a-f0-9]{30,}\b/g, '[supabase token]', 'tokens'],
  [/\bSG\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}/g, '[sendgrid key]', 'keys'],
  [/\bpk\.eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}/g, '[mapbox token]', 'tokens'],
  [/https:\/\/(?:ptb\.|canary\.)?discord(?:app)?\.com\/api\/webhooks\/\d+\/[A-Za-z0-9_-]{30,}/g, '[discord webhook]', 'urls'],
  [/https:\/\/hooks\.slack\.com\/services\/[A-Za-z0-9/]{20,}/g, '[slack webhook]', 'urls'],
  [/\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g, '[jwt]', 'tokens'],
  [/\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{16,}/g, '$1 [token]', 'tokens'],
  [/\b([a-z][a-z0-9+.-]*:\/\/)[^\s:@/]+:[^\s@/]+@/gi, '$1[credentials]@', 'urls'],
  // KEY=value / "api_key": "value" for names that suggest a secret. The value must mix
  // letters and digits, which skips `max_tokens: 5000`, `token: string` and `$ENV_VAR`.
  [/((?:api[_-]?key|secret|token(?!s)|passw(?:or)?d|pwd|auth(?!or)|credential|private[_-]?key|access[_-]?key)[A-Za-z0-9_]*["']?\s*[:=]\s*["']?)(?=[^\s"',;]*\d)(?=[^\s"',;]*[A-Za-z])([^\s"',;$][^\s"',;]{5,})/gi, '$1[redacted]', 'variables'],
  // noreply addresses (commit trailers) are public by design.
  [/\b(?![A-Za-z0-9._%+-]*noreply)[A-Za-z0-9._%+-]+@(?![A-Za-z0-9.-]*noreply)[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, '[email]', 'emails'],
];

// Variables that hold secrets have a KEY, TOKEN, SECRET, PASSWORD ... part in
// their name: OPENAI_API_KEY counts, GIT_AUTHOR_NAME and KEYBOARD_LAYOUT don't.
const SECRET_NAME = /(?:^|[_.-])(?:KEY|APIKEY|TOKEN|SECRET|PASSWORD|PASSWD|PASSPHRASE|PASS|CREDENTIALS?|AUTH|PRIVATE|PAT)(?:$|[_.-])/i;

// The exact values worth masking from [name, value] pairs (the environment, a
// .env file). Short values and paths are left out so `true` or /usr/bin never match.
export function secretValues(pairs) {
  const out = new Map();
  for (const [name, value] of pairs) {
    if (!SECRET_NAME.test(name) || typeof value !== 'string') continue;
    const v = value.trim();
    if (v.length >= 8 && !/^[~/]/.test(v)) out.set(v, name);
  }
  return [...out].map(([value, name]) => ({ name, value }));
}

// home and user come from the caller (Node passes os.homedir(); the browser
// guesses them from the transcript's own paths). secrets are exact values from
// secretValues(), masked first, whatever their format.
export function makeRedactor({ home = '', user = '', skip = [], secrets = [] } = {}) {
  const homeRe = home && home.length > 1 ? new RegExp(escapeRe(home), 'g') : null;
  const userRe = user && user.length > 2 ? new RegExp(`\\b${escapeRe(user)}\\b`, 'g') : null;
  // Longest first, so a value that contains another is masked whole; also the
  // JSON-escaped form, for values quoted inside tool input.
  const exact = skip.includes('env') ? [] : secrets
    .flatMap(({ name, value }) => [...new Set([value, JSON.stringify(value).slice(1, -1)])].map((v) => [v, `[env:${name}]`]))
    .sort((a, b) => b[0].length - a[0].length);
  const redact = function (text) {
    if (typeof text !== 'string' || !text) return text;
    let t = text;
    for (const [v, rep] of exact) {
      const parts = t.split(v);
      if (parts.length > 1) { redact.count += parts.length - 1; t = parts.join(rep); }
    }
    for (const [re, rep, group] of PATTERNS) {
      if (skip.includes(group)) continue;
      t = t.replace(re, (...m) => {
        redact.count++;
        return rep.replace(/\$(\d)/g, (_, n) => m[+n] ?? '');
      });
    }
    if (homeRe && !skip.includes('home')) t = t.replace(homeRe, '~');
    if (userRe && !skip.includes('home')) t = t.replace(userRe, 'user');
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


function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

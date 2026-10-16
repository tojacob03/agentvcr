import { readFileSync } from 'node:fs';
import { basename } from 'node:path';

const TEMPLATE = new URL('./player.html', import.meta.url);

const escHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// JSON inside <script> must not be able to close the tag or open a comment.
const escJson = (v) => JSON.stringify(v).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');

export function renderHtml(session) {
  const { cwd, ...rest } = session;
  const data = { ...rest, project: cwd ? basename(cwd) : '' };
  const s = session.stats;
  const description = [
    `${session.agent} session`,
    s.activeMs ? `${Math.max(1, Math.round(s.activeMs / 60000))} min active` : '',
    `${s.tools} tool calls`,
    `${s.files} files changed`,
  ].filter(Boolean).join(' · ');
  const vars = { __TITLE__: escHtml(session.title), __DESCRIPTION__: escHtml(description), __DATA__: escJson(data) };
  return readFileSync(TEMPLATE, 'utf8').replace(/__TITLE__|__DESCRIPTION__|__DATA__/g, (k) => vars[k]);
}

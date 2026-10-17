// A session as GitHub-flavoured Markdown, for pull request descriptions, issues
// and docs. Prompts are quotes, answers stay Markdown, and each tool call folds
// into a <details> block so the transcript reads top to bottom.

import { toPlayerData } from './session.js';

export function renderMarkdown(session, { link = '' } = {}) {
  const s = toPlayerData(session);
  const st = s.stats || {};
  const out = [];
  out.push(`# ${s.title}`, '');
  const facts = [
    `${s.agent} session${s.project ? ` in **${s.project}**` : ''}${s.model ? `, ${s.model}` : ''}`,
    st.activeMs ? `${Math.max(1, Math.round(st.activeMs / 60000))} min of work` : null,
    `${st.prompts || 0} prompts`,
    `${st.tools || 0} tool calls`,
    st.files ? `${st.files} files changed (+${st.added} −${st.removed})` : null,
  ].filter(Boolean);
  out.push(facts.join(', ') + '.', '');
  if (link) out.push(`[▶ Watch the replay](${link})`, '');

  for (const e of s.events) {
    if (e.type === 'prompt') out.push('---', '', quote(e.text), '');
    else if (e.type === 'text') out.push(e.text.trim(), '');
    else if (e.type === 'thinking') out.push(`<details><summary><i>Thinking</i></summary>\n\n${quote(e.text)}\n\n</details>`, '');
    else if (e.type === 'note') out.push(`*${e.text}*`, '');
    else if (e.type === 'tool') out.push(tool(e), '');
  }
  out.push('---', '', `<sub>Made with [agentvcr](https://github.com/tojacob03/agentvcr). Secrets were masked before export.</sub>`, '');
  return out.join('\n');
}

const VERB = { shell: 'Ran', edit: 'Edited', write: 'Wrote', read: 'Read', search: 'Searched for', web: 'Fetched', task: 'Delegated', plan: 'Updated the plan', mcp: 'Called', other: 'Called' };

function tool(e) {
  const d = e.detail || {};
  const counts = e.kind === 'edit' || e.kind === 'write' ? ` (+${d.added || 0} −${d.removed || 0})` : '';
  const failed = e.error ? ' ❌' : '';
  const summary = `${VERB[e.kind] || 'Called'} <code>${html(e.kind === 'plan' ? planDone(d) : e.title || e.name)}</code>${counts}${failed}`;
  let body = '';
  if (e.kind === 'shell') body = block('console', `$ ${d.command || ''}${e.output ? `\n${e.output}` : ''}`);
  else if (e.kind === 'edit' || e.kind === 'write') body = block('diff', (d.diff || []).map(([op, line]) => (op === '…' ? `@@ ${line} @@` : `${op === ' ' ? ' ' : op}${line}`)).join('\n'));
  else if (e.kind === 'plan') body = (d.items || []).map((it) => `- [${it.status === 'completed' ? 'x' : ' '}] ${it.text}`).join('\n');
  else {
    const parts = [d.input, d.prompt, d.query && `query: ${d.query}`, d.url, d.pattern && `pattern: ${d.pattern}`].filter(Boolean).join('\n');
    body = [parts && block('', parts), e.output && block('', e.output)].filter(Boolean).join('\n\n');
  }
  return body ? `<details><summary>${summary}</summary>\n\n${body}\n\n</details>` : summary;
}

function planDone(d) {
  const items = d.items || [];
  return `${items.filter((x) => x.status === 'completed').length} of ${items.length} done`;
}

// A fence one backtick longer than any run inside, so output with ``` can't break out.
function block(lang, text) {
  const longest = Math.max(2, ...(String(text).match(/`+/g) || []).map((m) => m.length));
  const f = '`'.repeat(Math.max(3, longest + 1));
  return `${f}${lang}\n${text}\n${f}`;
}

function quote(text) {
  return String(text).split('\n').map((l) => `> ${l}`).join('\n');
}

function html(s) {
  return String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
}


// Builds the pull request comment for the GitHub Action from agentvcr --json
// output and, when given, the Markdown transcript of the same run.
// usage: node scripts/comment.mjs <result.json> [artifact-url] [transcript.md]

import { readFileSync, existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

// GitHub rejects comments over 65,536 characters; leave room for the frame.
const LIMIT = 60000;

export function buildComment(r, artifactUrl = '', transcript = '') {
  const minutes = r.activeMs ? `${Math.max(1, Math.round(r.activeMs / 60000))} min of work` : `${r.events} steps`;
  const facts = [minutes, `${r.tools} tool calls`, `${r.files} files changed (+${r.added} −${r.removed})`];
  const link = r.url
    ? `**[▶ Watch the replay](${r.url})**`
    : artifactUrl
      ? `**[▶ Download the replay](${artifactUrl})** (one HTML file; open it in a browser)`
      : 'The replay is attached to this workflow run as the `agentvcr-replay` artifact.';
  const body = transcriptBody(transcript);
  return [
    '### Replay of this agent run',
    '',
    `**${r.title.replace(/[\r\n]+/g, ' ')}**: ${facts.join(', ')}.`,
    '',
    link,
    ...(body ? ['', `<details><summary>Transcript</summary>`, '', body, '', '</details>'] : []),
    '',
    `<sub>Made with [agentvcr](https://github.com/tojacob03/agentvcr). ${r.redactions} secret${r.redactions === 1 ? '' : 's'} masked before upload.</sub>`,
  ].join('\n');
}

// The Markdown export opens with a title block and ends with a footer, each set
// off by a "---" line; the comment has its own, so keep what lies between.
// Long transcripts are cut after the last complete tool block that fits.
export function transcriptBody(md, limit = LIMIT) {
  if (!md) return '';
  const lines = md.split('\n');
  const first = lines.indexOf('---');
  const last = lines.lastIndexOf('---');
  let body = (first >= 0 && last > first ? lines.slice(first + 1, last) : lines).join('\n').trim();
  if (body.length <= limit) return body;
  const cut = body.lastIndexOf('</details>', limit);
  body = body.slice(0, cut > 0 ? cut + '</details>'.length : limit);
  return `${body}\n\n*The transcript is cut here; the full replay is linked above.*`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [resultPath, artifactUrl = '', transcriptPath = ''] = process.argv.slice(2);
  const r = JSON.parse(readFileSync(resultPath, 'utf8'));
  const md = transcriptPath && existsSync(transcriptPath) ? readFileSync(transcriptPath, 'utf8') : '';
  console.log(buildComment(r, artifactUrl, md));
}

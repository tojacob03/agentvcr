// Builds the pull request comment for the GitHub Action from agentvcr --json output.
// usage: node scripts/comment.mjs <result.json> [artifact-url]

import { readFileSync } from 'node:fs';

const [resultPath, artifactUrl = ''] = process.argv.slice(2);
const r = JSON.parse(readFileSync(resultPath, 'utf8'));

const minutes = r.activeMs ? `${Math.max(1, Math.round(r.activeMs / 60000))} min of work` : `${r.events} steps`;
const facts = [minutes, `${r.tools} tool calls`, `${r.files} files changed (+${r.added} −${r.removed})`];
const link = r.url
  ? `**[▶ Watch the replay](${r.url})**`
  : artifactUrl
    ? `**[▶ Download the replay](${artifactUrl})** (one HTML file; open it in a browser)`
    : 'The replay is attached to this workflow run as the `agentvcr-replay` artifact.';

console.log(`### Replay of this agent run

**${r.title.replace(/[\r\n]+/g, ' ')}**: ${facts.join(', ')}.

${link}

<sub>Made with [agentvcr](https://github.com/tojacob03/agentvcr). ${r.redactions} secret${r.redactions === 1 ? '' : 's'} masked before upload.</sub>`);

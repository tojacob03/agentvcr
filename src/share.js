// Share = upload the (already redacted) replay data as a secret gist and point
// the hosted viewer at it. No server of our own: GitHub stores, Pages plays.

import { spawnSync } from 'node:child_process';
import { toPlayerData } from './render.js';

export const VIEWER = process.env.AGENTVCR_VIEWER || 'https://tojacob03.github.io/agentvcr/v/';

export function gistBody(session) {
  return {
    description: `agentvcr replay: ${session.title}`,
    public: false,
    files: { 'agentvcr.json': { content: JSON.stringify({ agentvcr: 1, session: toPlayerData(session) }) } },
  };
}

export function viewerUrl(owner, id, base = VIEWER) {
  return `${base}${base.includes('?') ? '&' : '?'}g=${owner}/${id}`;
}

export async function share(session) {
  const body = JSON.stringify(gistBody(session));
  const gist = process.env.GITHUB_TOKEN ? await viaToken(body, process.env.GITHUB_TOKEN) : viaGh(body);
  return { url: viewerUrl(gist.owner.login, gist.id), gist: gist.html_url };
}

function viaGh(body) {
  const r = spawnSync('gh', ['api', 'gists', '--method', 'POST', '--input', '-'], { input: body, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (r.error && r.error.code === 'ENOENT') {
    throw new Error('Sharing needs the GitHub CLI (https://cli.github.com, then `gh auth login`) or a GITHUB_TOKEN with the gist scope.');
  }
  if (r.status !== 0) {
    const msg = (r.stderr || r.stdout || '').trim();
    throw new Error(/gist|scope|403|401/i.test(msg)
      ? `GitHub refused to create the gist. Run \`gh auth refresh -s gist\` and try again.\n${msg}`
      : `Creating the gist failed: ${msg}`);
  }
  return JSON.parse(r.stdout);
}

async function viaToken(body, token) {
  const res = await fetch('https://api.github.com/gists', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json', 'User-Agent': 'agentvcr' },
    body,
  });
  if (!res.ok) throw new Error(`Creating the gist failed: ${res.status} ${await res.text()}`);
  return res.json();
}

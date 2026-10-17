#!/usr/bin/env node
import { writeFileSync, existsSync, readFileSync } from 'node:fs';
import { resolve, basename } from 'node:path';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline/promises';
import { loadSession, renderHtml, renderMarkdown } from '../src/index.js';
import { listSessions, findById, readHead, readTail } from '../src/sources.js';
import { share } from '../src/share.js';
import { recordVideo } from '../src/video.js';

const HELP = `agentvcr: turn a coding agent session into a replay you can share.

Usage
  agentvcr                 pick a session from this project
  agentvcr last            the most recent session in this project
  agentvcr <file|id>       a .jsonl transcript or a session id
  agentvcr last --share    upload it as a secret gist and get a link

Options
  -s, --share        upload the redacted replay as a secret gist and print a link
                     (uses the GitHub CLI, or GITHUB_TOKEN with the gist scope)
  -o, --out <file>   where to write it (default: ./agentvcr-<title>.html);
                     .md writes a Markdown transcript for PRs and docs,
                     .mp4 or .gif records a clip (needs Chrome and ffmpeg)
  -l, --list         list sessions and exit
  -a, --all          look at sessions from every project, not just this one
      --title <t>    set the replay title
      --thinking     include reasoning blocks when the transcript has them
      --subagents    include subagent turns (Claude Code)
      --no-redact    keep secrets, emails and your home path (careful)
      --no-open      do not open the replay in a browser
      --json         print the result as JSON (for scripts and CI)
  -h, --help         show this help
  -v, --version      show the version`;

const args = process.argv.slice(2);
const opts = { redact: true, open: true, all: false, list: false, thinking: false, sidechains: false };
let target = null;
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '-h' || a === '--help') { console.log(HELP); process.exit(0); }
  else if (a === '-v' || a === '--version') { console.log(JSON.parse(readFileSync(new URL('../package.json', import.meta.url))).version); process.exit(0); }
  else if (a === '-o' || a === '--out') opts.out = args[++i];
  else if (a === '-s' || a === '--share') opts.share = true;
  else if (a === '-l' || a === '--list') opts.list = true;
  else if (a === '-a' || a === '--all') opts.all = true;
  else if (a === '--title') opts.title = args[++i];
  else if (a === '--thinking') opts.thinking = true;
  else if (a === '--subagents') opts.sidechains = true;
  else if (a === '--no-redact') opts.redact = false;
  else if (a === '--no-open') opts.open = false;
  else if (a === '--json') { opts.json = true; opts.open = false; }
  else if (a.startsWith('-')) fail(`Unknown option ${a}. Run agentvcr --help.`);
  else target = a;
}

const dim = (s) => (process.stdout.isTTY ? `\x1b[2m${s}\x1b[22m` : s);
const red = (s) => (process.stdout.isTTY ? `\x1b[31m${s}\x1b[39m` : s);

function fail(msg) {
  console.error(msg);
  process.exit(1);
}

function ago(ms) {
  const m = Math.round((Date.now() - ms) / 60000);
  if (m < 60) return `${m}m ago`;
  if (m < 48 * 60) return `${Math.round(m / 60)}h ago`;
  return `${Math.round(m / 1440)}d ago`;
}

// Cheap title for the picker: custom title, last prompt, or first prompt, without parsing the file.
function peekTitle(path) {
  const head = readHead(path, 262144);
  const tail = readTail(path);
  const last = (re) => [...tail.matchAll(re)].pop()?.[1] || [...head.matchAll(re)].pop()?.[1];
  const pick = last(/"customTitle":"((?:[^"\\]|\\.)*)"/g) || last(/"lastPrompt":"((?:[^"\\]|\\.){4,200})/g) || head.match(/"type":"user","message":\{"role":"user","content":"((?:[^"\\]|\\.){4,200})/)?.[1]
    || head.match(/"role":"user","content":\[\{"type":"input_text","text":"(?!<|# AGENTS)((?:[^"\\]|\\.){4,200})/)?.[1]
    || head.match(/<user_query>(?:\\n)?((?:[^"\\<]|\\.){4,200})/)?.[1]
    || head.match(/"type":"user","content":"((?:[^"\\]|\\.){4,200})/)?.[1]
    || head.match(/"say":"(?:task|text)","text":"((?:[^"\\]|\\.){4,200})/)?.[1]
    || head.match(/"type":"user",[^\n]*?"message":\{"role":"user","parts":\[\{"text":"((?:[^"\\]|\\.){4,200})/)?.[1]
    || head.match(/<user_input mode=\\"\w+\\">((?:[^"\\<]|\\.){4,200})/)?.[1] || '';
  let t = pick;
  try { t = JSON.parse(`"${pick}"`); } catch { /* raw */ }
  t = t.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  return t.length > 64 ? t.slice(0, 63) + '…' : t || basename(path);
}

async function choose() {
  let sessions = listSessions({ all: opts.all });
  if (!sessions.length && !opts.all) {
    sessions = listSessions({ all: true });
    if (sessions.length) console.log(dim('No sessions for this folder, showing all projects.\n'));
  }
  if (!sessions.length) fail('No agent sessions found. Pass a transcript file path instead.');
  const shown = sessions.slice(0, opts.list ? 30 : 12);
  shown.forEach((s, i) => {
    const agent = s.agent.padEnd(6);
    console.log(`${String(i + 1).padStart(3)}  ${dim(agent)}  ${peekTitle(s.path)}  ${dim(ago(s.mtime))}`);
  });
  if (opts.list) process.exit(0);
  if (!process.stdin.isTTY) return shown[0].path;
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = (await rl.question(`\nWhich session? ${dim('[1]')} `)).trim();
  rl.close();
  const n = answer ? Number(answer) : 1;
  if (!Number.isInteger(n) || n < 1 || n > shown.length) fail('No such session.');
  return shown[n - 1].path;
}

function slug(s) {
  return s.toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/[\s_]+/g, '-').slice(0, 48).replace(/-+$/, '') || 'session';
}

// .md output is a Markdown transcript; anything else is the HTML replay.
function render(session, link = '') {
  return opts.out && /\.(md|markdown)$/i.test(opts.out) ? renderMarkdown(session, { link }) : renderHtml(session);
}

function openFile(file) {
  const cmd = process.platform === 'darwin' ? ['open', [file]] : process.platform === 'win32' ? ['cmd', ['/c', 'start', '', file]] : ['xdg-open', [file]];
  try { spawn(cmd[0], cmd[1], { stdio: 'ignore', detached: true }).on('error', () => {}).unref(); } catch { /* no browser, fine */ }
}

async function main() {
  let path;
  if (!target) path = await choose();
  else if (target === 'last') {
    const s = listSessions({ all: opts.all })[0] || listSessions({ all: true })[0];
    if (!s) fail('No sessions found.');
    path = s.path;
  } else if (existsSync(target)) path = resolve(target);
  else {
    const hit = findById(target);
    if (!hit) fail(`No session file or id matching "${target}".`);
    path = hit.path;
  }

  if (opts.share && !opts.redact) fail('--share always masks secrets; it cannot be combined with --no-redact.');
  const { session, redactions } = loadSession(path, opts);
  if (!session.events.length) fail('That session has no events to replay.');
  const result = (extra) => ({
    title: session.title, agent: session.agent, events: session.events.length, tools: session.stats.tools,
    files: session.stats.files, added: session.stats.added, removed: session.stats.removed,
    activeMs: session.stats.activeMs, tokens: session.stats.tokens || null, redactions, ...extra,
  });
  const summary = () => {
    if (opts.json) return;
    console.log(dim(`  ${session.events.length} events, ${session.stats.tools} tool calls, ${session.stats.files} files changed`));
    if (opts.redact) console.log(dim(`  ${redactions} secret${redactions === 1 ? '' : 's'} masked, home path replaced with ~.`));
    else console.log(red('  Redaction is off. Do not share this file without reading it.'));
  };

  if (opts.share) {
    const { url, gist, embed } = await share(session);
    if (opts.out) writeFileSync(resolve(opts.out), render(session, url));
    if (opts.json) { console.log(JSON.stringify(result({ url, gist, embed, file: opts.out ? resolve(opts.out) : null }))); return; }
    console.log(`\n✓ ${url}`);
    summary();
    console.log(dim(`  Secret gist: ${gist} (delete it there to take the replay down)`));
    console.log(dim(`  Embed: ${embed}`));
    if (opts.open) openFile(url);
    return;
  }

  const out = resolve(opts.out || `agentvcr-${slug(session.title)}.html`);
  if (/\.(mp4|gif)$/i.test(out)) {
    if (!opts.json) process.stderr.write(dim('Recording'));
    let seconds;
    try {
      ({ seconds } = await recordVideo(renderHtml(session), out, { onProgress: () => { if (!opts.json) process.stderr.write(dim('.')); } }));
    } catch (e) {
      fail(`\n${e.message}`);
    }
    if (opts.json) { console.log(JSON.stringify(result({ file: out, url: null, seconds }))); return; }
    console.log(`\n✓ ${out} ${dim(`(${seconds.toFixed(1)} s)`)}`);
    summary();
    return;
  }
  const html = render(session);
  writeFileSync(out, html);
  if (opts.json) { console.log(JSON.stringify(result({ file: out, url: null }))); return; }
  console.log(`\n✓ ${out} ${dim(`(${Math.round(Buffer.byteLength(html) / 1024)} KB)`)}`);
  summary();
  console.log(dim('  Skim it before sharing, or run with --share to get a link.'));
  if (opts.open && !/\.(md|markdown)$/i.test(out)) openFile(out);
}

main().catch((e) => fail(e.stack || String(e)));

// Browser smoke test: opens a real replay, the share viewer and the landing page
// in headless Chrome over the DevTools protocol (no dependencies) and checks that
// they boot without errors and do what they say.
//
//   node scripts/smoke.mjs        (needs Node 22+ and Chrome or Chromium)

import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { readFileSync, existsSync, mkdtempSync } from 'node:fs';
import { join, extname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { loadSession, renderHtml, parseTranscript } from '../src/index.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const chromePath = [process.env.CHROME_PATH, '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser']
  .find((p) => p && existsSync(p));
if (!chromePath) { console.log('smoke: no Chrome found, skipping'); process.exit(0); }

// Serve docs/ plus a freshly rendered replay of the example session.
const replay = renderHtml(loadSession(join(root, 'examples/demo-session.jsonl')).session);
// Five reads in a row, to check that runs fold into one row.
const runRows = [{ type: 'user', timestamp: '2026-01-01T10:00:00Z', message: { role: 'user', content: 'read the config' } }];
for (let i = 0; i < 5; i++) {
  runRows.push({ type: 'assistant', timestamp: `2026-01-01T10:00:0${i + 1}Z`, message: { content: [{ type: 'tool_use', id: `r${i}`, name: 'Read', input: { file_path: `/w/c${i}.json` } }] } });
  runRows.push({ type: 'user', timestamp: `2026-01-01T10:00:0${i + 1}Z`, message: { content: [{ type: 'tool_result', tool_use_id: `r${i}`, content: '{}' }] } });
}
const runReplay = renderHtml(parseTranscript(runRows.map((r) => JSON.stringify(r)).join('\n')).session);
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.webp': 'image/webp', '.png': 'image/png', '.mp4': 'video/mp4', '.woff2': 'font/woff2', '.json': 'application/json', '.jsonl': 'text/plain' };
const server = createServer((req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (path === '/replay.html') { res.writeHead(200, { 'content-type': 'text/html' }); return res.end(replay); }
  if (path === '/runs.html') { res.writeHead(200, { 'content-type': 'text/html' }); return res.end(runReplay); }
  if (path === '/session.jsonl') { res.writeHead(200); return res.end(readFileSync(join(root, 'examples/demo-session.jsonl'))); }
  const file = join(root, 'docs', path.endsWith('/') ? path + 'index.html' : path);
  if (!file.startsWith(join(root, 'docs')) || !existsSync(file)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': types[extname(file)] || 'application/octet-stream' });
  res.end(readFileSync(file));
}).listen(0);
const base = `http://127.0.0.1:${server.address().port}`;

const port = 9400 + Math.floor(Math.random() * 400);
const chrome = spawn(chromePath, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), 'agentvcr-smoke-'))}`, '--no-sandbox', '--no-first-run', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? `  (${detail})` : ''}`); if (!ok) failures++; };

try {
  let target;
  for (let i = 0; i < 100 && !target; i++) { await sleep(150); try { target = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t) => t.type === 'page'); } catch { /* starting */ } }
  if (!target) throw new Error('Chrome did not start');
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r));
  let id = 0;
  const pending = new Map();
  const errors = [];
  ws.addEventListener('message', (m) => {
    const d = JSON.parse(m.data);
    if (d.method === 'Runtime.exceptionThrown') errors.push(d.params.exceptionDetails.exception?.description || d.params.exceptionDetails.text);
    if (pending.has(d.id)) { pending.get(d.id)(d.result); pending.delete(d.id); }
  });
  const send = (method, params = {}) => new Promise((r) => { pending.set(++id, r); ws.send(JSON.stringify({ id, method, params })); });
  const evaluate = async (expression) => (await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })).result?.value;
  const open = async (url, ready) => {
    errors.length = 0;
    await send('Page.navigate', { url });
    for (let i = 0; i < 100; i++) { await sleep(100); if (await evaluate(ready)) return true; }
    return false;
  };
  await send('Runtime.enable');
  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });

  // 1. A replay boots, plays, skips to the end and links to moments.
  check('replay boots', await open(`${base}/replay.html`, "!!document.querySelector('#poster h1')"));
  check('replay title', (await evaluate("document.querySelector('#poster h1').textContent")) === 'Webhook retries fulfilled orders twice');
  const total = await evaluate("document.querySelectorAll('.ev').length");
  check('every event rendered', total === 33, `${total} events`);
  check('four speed keys', (await evaluate("document.querySelectorAll('#speeds button').length")) === 4);
  await evaluate("document.querySelector('.key.solid').click()");
  await sleep(700);
  check('play shows the first prompt', await evaluate("!document.getElementById('e0').hidden && document.body.classList.contains('playing')"));
  await evaluate("document.getElementById('all').click()");
  check('skip to end shows everything', await evaluate("[...document.querySelectorAll('.ev')].every((e) => !e.hidden) && !document.getElementById('end').hidden"));
  check('markdown table rendered', await evaluate("!!document.querySelector('.text table td code')"));
  await open(`${base}/replay.html#18`, "document.getElementById('clock').textContent.length > 0");
  check('deep link stops at its step', await evaluate("!document.getElementById('e18').hidden && document.getElementById('e19').hidden"));
  check('replay has no script errors', errors.length === 0, errors[0]);

  // 1b. Five reads in a row fold into one row that opens, and deep links open it.
  await open(`${base}/runs.html`, "!!document.querySelector('#poster h1')");
  await evaluate("document.getElementById('all').click()");
  check('a run folds into one row', (await evaluate("document.querySelector('.run .run-row .target')?.textContent")) === '5 files');
  check('a folded run hides its calls', await evaluate("getComputedStyle(document.getElementById('e3')).display === 'none'"));
  await evaluate("document.querySelector('.run-row .tool-head').click()");
  check('the row opens to show the calls', await evaluate("getComputedStyle(document.getElementById('e3')).display !== 'none'"));
  await open(`${base}/runs.html#3`, "document.getElementById('clock').textContent.length > 0");
  check('a deep link into a run opens it', await evaluate("document.querySelector('.run').classList.contains('open') && !document.getElementById('e3').hidden"));
  check('runs have no script errors', errors.length === 0, errors[0]);

  // 2. The share viewer without a gist says so.
  check('viewer boots', await open(`${base}/v/`, "/NO SIGNAL/.test(document.querySelector('#poster').textContent)"));
  check('viewer has no script errors', errors.length === 0, errors[0]);

  // 3. The landing page plays a dropped session in the browser.
  check('landing boots', await open(`${base}/`, "document.querySelectorAll('#wave i').length > 0"));
  const played = await evaluate(`(async () => {
    const raw = await (await fetch('/session.jsonl')).text();
    const dt = new DataTransfer();
    dt.items.add(new File([raw.replace(/\\/home\\/dev/g, '/Users/ada')], 'session.jsonl'));
    document.getElementById('screen').dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
    for (let i = 0; i < 50; i++) {
      await new Promise((r) => setTimeout(r, 100));
      const f = document.querySelector('#screen iframe');
      if (f && f.contentDocument && f.contentDocument.querySelectorAll('.ev').length) {
        const html = f.contentDocument.documentElement.innerHTML;
        return { events: f.contentDocument.querySelectorAll('.ev').length, homeLeaked: html.includes('/Users/ada') };
      }
    }
    return null;
  })()`);
  check('dropped session plays', played?.events === 33, JSON.stringify(played));
  check('dropped session masks the home folder', played && !played.homeLeaked);
  const cline = await evaluate(`(async () => {
    const t = 1767225600000;
    const msgs = [
      { ts: t, type: 'say', say: 'task', text: 'add retries to the webhook' },
      { ts: t + 4000, type: 'ask', ask: 'tool', text: JSON.stringify({ tool: 'editedExistingFile', path: 'src/webhook.ts', diff: '------- SEARCH\\\\nsend(e)\\\\n=======\\\\nretry(() => send(e))\\\\n+++++++ REPLACE' }) },
      { ts: t + 9000, type: 'say', say: 'completion_result', text: 'Done.' },
    ];
    const dt = new DataTransfer();
    dt.items.add(new File([JSON.stringify(msgs)], 'ui_messages.json'));
    document.getElementById('screen').dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
    for (let i = 0; i < 50; i++) {
      await new Promise((r) => setTimeout(r, 100));
      const d = document.querySelector('#screen iframe')?.contentDocument;
      if (d && /A Cline session/.test(d.body.textContent)) return { events: d.querySelectorAll('.ev').length, diff: !!d.querySelector('.ev .diff, .ev table, .ev .add, .ev ins') };
    }
    return null;
  })()`);
  check('dropped Cline task plays', cline?.events === 3, JSON.stringify(cline));
  check('landing redaction demo', /NOTHING LEAKS/.test(await evaluate("document.getElementById('tally').textContent")));
  check('landing has no script errors', errors.length === 0, errors[0]);
  ws.close();
} catch (e) {
  check('smoke run', false, e.message);
} finally {
  chrome.kill();
  server.close();
}
console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed');
process.exit(failures ? 1 : 0);

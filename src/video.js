// Records a replay to MP4 or GIF with the Chrome and ffmpeg already installed:
// the page's clock only moves when we say so, one screenshot per frame, so the
// clip is smooth however slow the machine is. Node only; never loaded by the
// browser build.

import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';

const CHROMES = [
  process.env.CHROME_PATH,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
];

export function findTools() {
  const chrome = CHROMES.find((p) => p && existsSync(p)) || null;
  const ffmpeg = process.env.FFMPEG_PATH || 'ffmpeg';
  const ok = spawnSync(ffmpeg, ['-version'], { stdio: 'ignore' });
  return { chrome, ffmpeg: ok.error || ok.status !== 0 ? null : ffmpeg };
}

export async function recordVideo(html, out, { fps = 20, maxSeconds = 60, onProgress = () => {} } = {}) {
  const gif = /\.gif$/i.test(out);
  const { chrome, ffmpeg } = findTools();
  const missing = [!chrome && 'Chrome or Chromium (or set CHROME_PATH)', !ffmpeg && 'ffmpeg (or set FFMPEG_PATH)'].filter(Boolean);
  if (missing.length) throw new Error(`Recording a ${gif ? 'GIF' : 'video'} needs ${missing.join(' and ')}.`);
  if (typeof WebSocket === 'undefined') throw new Error('Recording a video needs Node 22 or newer.');

  const dir = mkdtempSync(join(tmpdir(), 'agentvcr-video-'));
  const page = join(dir, 'replay.html');
  writeFileSync(page, html);
  const port = 9600 + Math.floor(Math.random() * 300);
  const proc = spawn(chrome, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${join(dir, 'profile')}`, '--no-sandbox', '--no-first-run', '--hide-scrollbars', 'about:blank'], { stdio: 'ignore' });
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  try {
    let target;
    for (let i = 0; i < 100 && !target; i++) { await sleep(150); try { target = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t) => t.type === 'page'); } catch { /* starting */ } }
    if (!target) throw new Error('Chrome did not start.');
    const ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((r) => ws.addEventListener('open', r));
    let id = 0;
    const pending = new Map();
    ws.addEventListener('message', (m) => { const d = JSON.parse(m.data); if (pending.has(d.id)) { pending.get(d.id)(d.result); pending.delete(d.id); } });
    const send = (method, params = {}) => new Promise((r) => { pending.set(++id, r); ws.send(JSON.stringify({ id, method, params })); });
    const evaluate = async (expression) => (await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })).result?.value;

    await send('Emulation.setDeviceMetricsOverride', { width: 960, height: 600, deviceScaleFactor: gif ? 1 : 1.25, mobile: false });
    await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'light' }, { name: 'prefers-reduced-motion', value: 'no-preference' }] });
    await send('Page.enable');
    // The player reads time from performance.now and requestAnimationFrame only.
    await send('Page.addScriptToEvaluateOnNewDocument', { source: `
      let __vt = 0; const __cbs = [];
      performance.now = () => __vt;
      window.requestAnimationFrame = (cb) => { __cbs.push(cb); return __cbs.length; };
      window.__advance = (ms) => { __vt += ms; for (const cb of __cbs.splice(0)) cb(__vt); };
    ` });
    await send('Page.navigate', { url: pathToFileURL(page).href });
    for (let i = 0; i < 100; i++) { await sleep(100); if (await evaluate("!!document.querySelector('#poster h1')")) break; }

    // Hold the summary for a moment, then play at a speed that fits the clip.
    const holdFrames = Math.round(fps * 1.5);
    let frames = 0;
    const shoot = async () => {
      const { data } = await send('Page.captureScreenshot', { format: 'png' });
      writeFileSync(join(dir, `${String(frames++).padStart(5, '0')}.png`), Buffer.from(data, 'base64'));
    };
    for (let i = 0; i < holdFrames; i++) { await evaluate(`__advance(${1000 / fps})`); await shoot(); }
    await evaluate("document.querySelector('.key.solid').click()");
    const timeline = await evaluate("[...document.querySelectorAll('.ev')].length");
    await evaluate(`document.dispatchEvent(new KeyboardEvent('keydown', { key: '${timeline > 120 ? 4 : 3}' }))`);
    const limit = Math.round(maxSeconds * fps);
    while (frames < limit) {
      await evaluate(`__advance(${1000 / fps})`);
      await shoot();
      if (frames % fps === 0) onProgress(frames / fps);
      if (await evaluate("!document.getElementById('end').hidden")) break;
    }
    for (let i = 0; i < fps; i++) await shoot(); // rest on the last frame
    ws.close();

    const input = ['-v', 'error', '-y', '-framerate', String(fps), '-i', join(dir, '%05d.png')];
    const run = (args) => {
      const r = spawnSync(ffmpeg, args, { encoding: 'utf8' });
      if (r.status !== 0) throw new Error(`ffmpeg failed: ${(r.stderr || '').trim().split('\n').pop()}`);
    };
    if (gif) {
      const palette = join(dir, 'palette.png');
      run([...input, '-vf', 'palettegen=max_colors=192:stats_mode=diff', palette]);
      run([...input, '-i', palette, '-lavfi', 'paletteuse=dither=none:diff_mode=rectangle', '-loop', '0', out]);
    } else {
      run([...input, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '23', '-movflags', '+faststart', out]);
    }
    return { frames, seconds: frames / fps };
  } finally {
    // Chrome keeps writing its profile until it has exited; wait, then tidy up.
    // A leftover temp folder must never fail a finished recording.
    const exited = new Promise((r) => proc.once('exit', r));
    proc.kill();
    await Promise.race([exited, sleep(3000)]);
    try { rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch { /* temp dir */ }
  }
}

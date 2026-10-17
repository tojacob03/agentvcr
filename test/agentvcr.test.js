import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseClaude } from '../src/claude.js';
import { parseCodex } from '../src/codex.js';
import { makeRedactor } from '../src/redact.js';
import { renderHtml } from '../src/render.js';
import { lineDiff, trimDiff } from '../src/session.js';

const jsonl = (...rows) => rows.map((r) => JSON.stringify(r)).join('\n');
const T = (s) => `2026-10-01T10:00:${String(s).padStart(2, '0')}.000Z`;

const claudeRaw = jsonl(
  { type: 'custom-title', customTitle: 'Fix the flaky test' },
  { type: 'user', timestamp: T(0), cwd: '/home/ada/app', gitBranch: 'main', message: { role: 'user', content: '<system-reminder>ignore me</system-reminder>make the test pass' } },
  { type: 'user', timestamp: T(0), isMeta: true, message: { role: 'user', content: [{ type: 'text', text: 'skill body injected by the harness' }] } },
  { type: 'assistant', timestamp: T(1), message: { model: 'claude-opus-5-5', content: [{ type: 'text', text: 'Running the tests first.' }] } },
  { type: 'assistant', timestamp: T(2), message: { content: [{ type: 'tool_use', id: 't1', name: 'Bash', input: { command: 'npm test' } }] } },
  { type: 'user', timestamp: T(5), message: { content: [{ type: 'tool_result', tool_use_id: 't1', content: '1 failing', is_error: true }] } },
  { type: 'assistant', timestamp: T(6), message: { content: [{ type: 'tool_use', id: 't2', name: 'Edit', input: { file_path: '/home/ada/app/src/a.js', old_string: 'a\nb\nc', new_string: 'a\nB\nc\nd' } }] } },
  { type: 'user', timestamp: T(7), message: { content: [{ type: 'tool_result', tool_use_id: 't2', content: 'ok' }] } },
  { type: 'assistant', timestamp: T(8), isSidechain: true, message: { content: [{ type: 'text', text: 'subagent chatter' }] } },
  { type: 'user', timestamp: T(9), message: { role: 'user', content: '<command-name>/review</command-name><command-args>src</command-args>' } },
  { type: 'user', timestamp: T(10), message: { role: 'user', content: [{ type: 'text', text: '[Request interrupted by user]' }] } },
  'not json at all',
);

test('claude: prompts, tools, diffs and harness noise', () => {
  const s = parseClaude(claudeRaw.replace('"not json at all"', 'not json at all'));
  assert.equal(s.agent, 'Claude Code');
  assert.equal(s.title, 'Fix the flaky test');
  assert.equal(s.model, 'claude-opus-5-5');
  assert.equal(s.branch, 'main');
  const types = s.events.map((e) => e.type);
  assert.deepEqual(types, ['prompt', 'text', 'tool', 'tool', 'prompt', 'note']);
  assert.equal(s.events[0].text, 'make the test pass');
  assert.equal(s.events[4].text, '/review src');

  const [bash, edit] = s.events.filter((e) => e.type === 'tool');
  assert.equal(bash.kind, 'shell');
  assert.equal(bash.error, true);
  assert.equal(bash.output, '1 failing');
  assert.equal(edit.kind, 'edit');
  assert.equal(edit.title, 'src/a.js');
  assert.equal(edit.detail.added, 2);
  assert.equal(edit.detail.removed, 1);

  assert.equal(s.stats.prompts, 2);
  assert.equal(s.stats.tools, 2);
  assert.equal(s.stats.errors, 1);
  assert.equal(s.stats.files, 1);
  assert.equal(s.stats.activeMs, 10000);
});

test('claude: a written file counts its lines, not the trailing newline', () => {
  const s = parseClaude(jsonl(
    { type: 'assistant', timestamp: T(0), message: { content: [{ type: 'tool_use', id: 'w', name: 'Write', input: { file_path: '/x/a.sql', content: 'a\nb\n' } }] } },
    { type: 'user', timestamp: T(1), message: { content: [{ type: 'tool_result', tool_use_id: 'w', content: 'ok' }] } },
  ));
  assert.equal(s.events[0].detail.added, 2);
});

test('claude: subagent turns only with the flag', () => {
  const s = parseClaude(claudeRaw, { sidechains: true });
  assert.ok(s.events.some((e) => e.text === 'subagent chatter'));
});

const codexRaw = jsonl(
  { type: 'session_meta', timestamp: T(0), payload: { cwd: '/home/ada/app', cli_version: '0.150.0' } },
  { type: 'turn_context', timestamp: T(0), payload: { model: 'gpt-6-codex' } },
  { type: 'response_item', timestamp: T(0), payload: { type: 'message', role: 'developer', content: [{ type: 'input_text', text: 'sandbox rules' }] } },
  { type: 'response_item', timestamp: T(0), payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: '# AGENTS.md instructions for /home/ada/app' }] } },
  { type: 'response_item', timestamp: T(1), payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: '<environment_context>cwd</environment_context>' }] } },
  { type: 'response_item', timestamp: T(1), payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'rename foo to bar' }] } },
  { type: 'event_msg', timestamp: T(1), payload: { type: 'user_message', message: 'rename foo to bar' } },
  { type: 'response_item', timestamp: T(2), payload: { type: 'function_call', name: 'shell', call_id: 'c1', arguments: JSON.stringify({ command: ['bash', '-lc', 'rg foo'] }) } },
  { type: 'response_item', timestamp: T(3), payload: { type: 'function_call_output', call_id: 'c1', output: JSON.stringify({ output: 'no matches', metadata: { exit_code: 1 } }) } },
  { type: 'response_item', timestamp: T(4), payload: { type: 'custom_tool_call', name: 'apply_patch', call_id: 'c2', input: '*** Begin Patch\n*** Update File: src/a.js\n@@\n-const foo = 1;\n+const bar = 1;\n*** Add File: src/b.js\n+export {};\n*** End Patch' } },
  { type: 'response_item', timestamp: T(5), payload: { type: 'custom_tool_call_output', call_id: 'c2', output: 'Success' } },
  { type: 'response_item', timestamp: T(6), payload: { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'Renamed.' }] } },
);

test('codex: shell, apply_patch and injected context', () => {
  const s = parseCodex(codexRaw);
  assert.equal(s.agent, 'Codex');
  assert.equal(s.model, 'gpt-6-codex');
  assert.equal(s.title, 'rename foo to bar');
  assert.deepEqual(s.events.map((e) => e.type), ['prompt', 'tool', 'tool', 'text']);
  const [sh, patch] = s.events.filter((e) => e.type === 'tool');
  assert.equal(sh.kind, 'shell');
  assert.equal(sh.title, 'rg foo');
  assert.equal(sh.output, 'no matches');
  assert.equal(sh.error, true);
  assert.equal(patch.kind, 'edit');
  assert.deepEqual(patch.detail.paths, ['src/a.js', 'src/b.js']);
  assert.equal(patch.detail.added, 2);
  assert.equal(patch.detail.removed, 1);
  assert.equal(s.stats.files, 2);
});

test('redact: masks secrets, keeps look-alikes', () => {
  const r = makeRedactor({ home: '/Users/ada', user: 'ada' });
  const masked = [
    'sk-ant-api03-abcdefghijklmnopqrstuvwxyz012345',
    'ghp_abcdefghijklmnopqrstuvwxyz0123456789',
    'AKIAABCDEFGHIJKLMNOP',
    'OPENAI_API_KEY=sk-proj-abcdefghijklmnopqrstu',
    'password: hunter22x',
    'Authorization: Bearer abcdefghijklmnopqrstuvwx',
    'postgres://admin:s3cret@db.example.com/x',
    'mail me at ada@example.com',
    'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U',
  ];
  for (const s of masked) assert.notEqual(r(s), s, `should mask: ${s}`);
  assert.ok(!r(masked[0]).includes('abcdefghij'));
  assert.equal(r('postgres://admin:s3cret@db.example.com/x'), 'postgres://[credentials]@db.example.com/x');

  const kept = ['max_tokens: 5000', 'token: string', 'apikey: $SUPABASE_KEY', 'Co-Authored-By: Claude <noreply@anthropic.com>', 'Author: Ada Lovelace'];
  for (const s of kept) assert.equal(r(s), s, `should keep: ${s}`);

  assert.equal(r('cd /Users/ada/app'), 'cd ~/app');
  assert.ok(r.count >= masked.length);
});

test('render: transcript text cannot break out of the data script', () => {
  const s = parseClaude(jsonl({ type: 'user', timestamp: T(0), message: { role: 'user', content: '</script><script>alert(1)</script> & <!-- x' } }));
  s.title = '<img src=x onerror=alert(1)>';
  const html = renderHtml(s);
  const data = html.slice(html.indexOf('id="agentvcr-data">'), html.indexOf('</script>', html.indexOf('id="agentvcr-data">')));
  assert.ok(!data.includes('<'), 'no raw < inside the JSON block');
  assert.ok(!html.includes('<img src=x'), 'title is escaped');
  assert.ok(html.includes('&lt;img src=x'));
});

test('diff: line diff and trimming', () => {
  assert.deepEqual(lineDiff('a\nb', 'a\nc'), [[' ', 'a'], ['-', 'b'], ['+', 'c']]);
  const long = Array.from({ length: 50 }, (_, i) => `line ${i}`).join('\n');
  const d = trimDiff(lineDiff(long, long.replace('line 25', 'LINE 25')));
  assert.ok(d.length < 12);
  assert.equal(d[0][0], '…');
});

test('share: the gist holds player data without the full working directory', async () => {
  const { gistBody, viewerUrl } = await import('../src/share.js');
  const s = parseClaude(claudeRaw);
  s.cwd = '/home/ada/secret-client/app';
  const body = gistBody(s);
  assert.equal(body.public, false);
  const json = body.files['agentvcr.json'].content;
  assert.ok(!json.includes('/home/ada'), 'no absolute path');
  const data = JSON.parse(json);
  assert.equal(data.agentvcr, 1);
  assert.equal(data.session.project, 'app');
  assert.equal(data.session.events.length, s.events.length);
  assert.equal(viewerUrl('ada', 'abc123', 'https://x.test/v/'), 'https://x.test/v/?g=ada/abc123');
});

test('viewer: renders without embedded data', async () => {
  const { renderViewer } = await import('../src/render.js');
  const html = renderViewer();
  assert.ok(html.includes('id="agentvcr-data">null</script>'));
  assert.ok(html.includes('function loadShared()'));
});

test('cursor: prompts, tool calls and aborted turns', async () => {
  const { parseCursor, cursorTimestamp } = await import('../src/cursor.js');
  const raw = jsonl(
    { role: 'user', message: { content: [{ type: 'text', text: '<timestamp>Thursday, Sep 17, 2026, 7:30 PM (UTC+2)</timestamp>\n<user_query>\nfix the header\n</user_query>' }] } },
    { role: 'assistant', message: { content: [
      { type: 'text', text: 'Looking at it.' },
      { type: 'tool_use', name: 'GetDynamicTools', input: { namespace: 'cursor' } },
      { type: 'tool_use', name: 'Shell', input: { command: 'npm run lint' } },
      { type: 'tool_use', name: 'StrReplace', input: { path: '/a/Header.tsx', old_string: 'x', new_string: 'y\nz' } },
      { type: 'tool_use', name: 'CallDynamicTool', input: { namespace: 'cursor', toolName: 'TodoWrite', arguments: { todos: [{ content: 'one', status: 'completed' }] } } },
    ] } },
    { type: 'turn_ended', status: 'error', error: 'User aborted request' },
  );
  const s = parseCursor(raw);
  assert.equal(s.agent, 'Cursor');
  assert.equal(s.title, 'fix the header');
  assert.equal(s.startedAt, '2026-09-17T17:30:00.000Z');
  assert.deepEqual(s.events.map((e) => e.kind || e.type), ['prompt', 'text', 'shell', 'edit', 'plan', 'note']);
  assert.equal(s.events[3].detail.added, 2);
  assert.equal(cursorTimestamp('<timestamp>Monday, Jan 5, 2026, 12:05 AM (UTC-5)</timestamp>'), '2026-01-05T05:05:00.000Z');
});

test('gemini: jsonl records with patches and rewinds', async () => {
  const { parseGemini } = await import('../src/gemini.js');
  const raw = jsonl(
    { sessionId: 's1', projectHash: 'h', startTime: T(0) },
    { id: 'u1', timestamp: T(0), type: 'user', content: [{ text: 'first try' }] },
    { $rewindTo: 'u1' },
    { id: 'u2', timestamp: T(1), type: 'user', content: 'add a health check' },
    { id: 'g1', timestamp: T(2), type: 'gemini', model: 'gemini-3-pro', content: 'On it.', toolCalls: [
      { id: 't1', name: 'run_shell_command', args: { command: 'npm test' }, status: 'error', timestamp: T(3), resultDisplay: '1 failing' },
      { id: 't2', name: 'replace', args: { file_path: 'src/app.ts', old_string: 'a', new_string: 'b' }, status: 'success', timestamp: T(4) },
    ] },
    { $patch: { id: 'g1', toolCalls: [{ id: 't2', result: [{ functionResponse: { name: 'replace', response: { output: 'ok' } } }] }] } },
  );
  const s = parseGemini(raw);
  assert.equal(s.agent, 'Gemini CLI');
  assert.equal(s.model, 'gemini-3-pro');
  assert.equal(s.title, 'add a health check');
  assert.deepEqual(s.events.map((e) => e.kind || e.type), ['prompt', 'text', 'shell', 'edit']);
  assert.equal(s.events[2].error, true);
  assert.equal(s.events[2].output, '1 failing');
  assert.equal(s.events[3].output, 'ok');
});

test('gemini: legacy single json file', async () => {
  const { parseGemini } = await import('../src/gemini.js');
  const s = parseGemini(JSON.stringify({ sessionId: 's', projectHash: 'h', summary: 'Health check endpoint', messages: [
    { id: 'a', timestamp: T(0), type: 'user', content: 'hi' },
    { id: 'b', timestamp: T(1), type: 'gemini', content: 'hello', toolCalls: [{ id: 'x', name: 'write_todos', args: { todos: [{ description: 'one', status: 'pending' }] }, status: 'success', timestamp: T(1) }] },
  ] }, null, 2));
  assert.equal(s.title, 'Health check endpoint');
  assert.deepEqual(s.events.map((e) => e.kind || e.type), ['prompt', 'text', 'plan']);
});

test('detect: picks the right parser from the first lines', async () => {
  const { detectAgent } = await import('../src/sources.js');
  assert.equal(detectAgent('/x.jsonl', '{"type":"session_meta","payload":{}}'), 'codex');
  assert.equal(detectAgent('/x.jsonl', '{"role":"user","message":{"content":[]}}'), 'cursor');
  assert.equal(detectAgent('/x.jsonl', '{"sessionId":"s","projectHash":"h"}'), 'gemini');
  assert.equal(detectAgent('/x.jsonl', '{"type":"user","message":{"role":"user","content":"hi"}}'), 'claude');
});

test('claude: token usage counts each message once', () => {
  const u = { input_tokens: 5, cache_read_input_tokens: 1000, cache_creation_input_tokens: 100, output_tokens: 50 };
  const s = parseClaude(jsonl(
    { type: 'assistant', timestamp: T(0), message: { id: 'm1', usage: u, content: [{ type: 'text', text: 'a' }] } },
    { type: 'assistant', timestamp: T(0), message: { id: 'm1', usage: u, content: [{ type: 'tool_use', id: 't', name: 'Bash', input: { command: 'ls' } }] } },
    { type: 'assistant', timestamp: T(1), message: { id: 'm2', usage: { ...u, output_tokens: 10 }, content: [{ type: 'text', text: 'b' }] } },
  ));
  assert.deepEqual(s.stats.tokens, { in: 2210, out: 60 });
});

test('opencode: current export shape', async () => {
  const { parseOpenCode } = await import('../src/opencode.js');
  const raw = JSON.stringify({ info: { title: 'Add rate limiting', directory: '/home/ada/api' }, messages: [
    { id: 'msg_1', type: 'user', text: 'add rate limiting to /login', time: { created: 1767225600000 } },
    { id: 'msg_2', type: 'assistant', model: { modelID: 'claude-opus-5-5' }, tokens: { input: 100, output: 20, cache: { read: 900, write: 0 } }, time: { created: 1767225605000 }, content: [
      { type: 'text', text: 'Adding a limiter.' },
      { type: 'tool', id: 't1', name: 'edit', time: { created: 1767225606000, completed: 1767225607000 }, state: { status: 'completed', input: { filePath: '/home/ada/api/src/login.ts', oldString: 'a', newString: 'a\nb' }, content: [{ type: 'text', text: 'ok' }] } },
      { type: 'tool', id: 't2', name: 'bash', time: { created: 1767225608000 }, state: { status: 'error', input: { command: 'npm test' }, error: { message: '2 failing' } } },
    ] },
    { id: 'msg_3', type: 'shell', command: 'git status', exit: 0, output: 'clean', time: { created: 1767225610000 } },
  ] }, null, 2);
  const { detectAgent } = await import('../src/detect.js');
  assert.equal(detectAgent('session.json', raw.slice(0, 2000)), 'opencode');
  const s = parseOpenCode(raw);
  assert.equal(s.title, 'Add rate limiting');
  assert.equal(s.model, 'claude-opus-5-5');
  assert.deepEqual(s.events.map((e) => e.kind || e.type), ['prompt', 'text', 'edit', 'shell', 'shell']);
  assert.equal(s.events[2].title, 'src/login.ts');
  assert.equal(s.events[3].error, true);
  assert.equal(s.events[3].output, '2 failing');
  assert.deepEqual(s.stats.tokens, { in: 1000, out: 20 });
});

test('opencode: older info/parts export shape', async () => {
  const { parseOpenCode } = await import('../src/opencode.js');
  const s = parseOpenCode(JSON.stringify({ info: { id: 'ses_1', title: '' }, messages: [
    { info: { id: 'msg_1', role: 'user', time: { created: 1767225600000 } }, parts: [{ type: 'text', text: 'rename foo' }] },
    { info: { id: 'msg_2', role: 'assistant', modelID: 'gpt-6', time: { created: 1767225601000 } }, parts: [
      { type: 'tool', tool: 'bash', state: { status: 'completed', input: { command: 'rg foo' }, output: 'src/a.ts:1', time: { start: 1767225602000, end: 1767225603000 } } },
      { type: 'text', text: 'Done.' },
    ] },
  ] }));
  assert.equal(s.title, 'rename foo');
  assert.deepEqual(s.events.map((e) => e.kind || e.type), ['prompt', 'shell', 'text']);
  assert.equal(s.events[1].output, 'src/a.ts:1');
});

test('detect: Claude lines with msg_ ids are still Claude', async () => {
  const { detectAgent } = await import('../src/detect.js');
  const line = JSON.stringify({ parentUuid: null, type: 'assistant', message: { id: 'msg_011Cg4', model: 'claude-opus-5-5', content: [] } });
  assert.equal(detectAgent('/x.jsonl', line), 'claude');
});

test('claude-sdk: execution file from claude-code-action', async () => {
  const { parseTranscript } = await import('../src/parse.js');
  const raw = JSON.stringify([
    { type: 'system', subtype: 'init', session_id: 's1', cwd: '/home/runner/work/app/app', model: 'claude-opus-5-5' },
    { type: 'assistant', session_id: 's1', message: { id: 'msg_1', content: [{ type: 'text', text: 'I will fix the failing build.' }], usage: { input_tokens: 10, output_tokens: 5 } } },
    { type: 'assistant', session_id: 's1', message: { id: 'msg_2', content: [{ type: 'tool_use', id: 't1', name: 'Bash', input: { command: 'npm run build' } }] } },
    { type: 'user', session_id: 's1', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't1', content: 'ok' }] } },
    { type: 'assistant', session_id: 's1', parent_tool_use_id: 'task1', message: { id: 'msg_3', content: [{ type: 'text', text: 'subagent' }] } },
    { type: 'result', subtype: 'success', is_error: false, session_id: 's1' },
  ], null, 2);
  const { session } = parseTranscript(raw, { path: 'claude-execution-output.json' });
  assert.equal(session.agent, 'Claude Code');
  assert.equal(session.model, 'claude-opus-5-5');
  assert.equal(session.title, 'I will fix the failing build.');
  assert.deepEqual(session.events.map((e) => e.kind || e.type), ['text', 'shell']);
  assert.equal(session.events[1].output, 'ok');
});

test('redact: provider tokens and webhook URLs', () => {
  const r = makeRedactor();
  const samples = [
    'hf_' + 'a'.repeat(34),
    'sk-or-v1-' + 'f'.repeat(64),
    'gsk_' + 'B'.repeat(52),
    'r8_' + 'c'.repeat(37),
    'sbp_' + 'd'.repeat(40),
    'SG.' + 'e'.repeat(22) + '.' + 'f'.repeat(43),
    'pk.eyJ' + 'g'.repeat(30) + '.' + 'h'.repeat(20),
    'https://discord.com/api/webhooks/123456789/' + 'i'.repeat(60),
    'https://hooks.slack.com/services/T000/B000/' + 'j'.repeat(24),
  ];
  for (const s of samples) {
    const out = r(`value: ${s} end`);
    assert.ok(!out.includes(s), `should mask ${s.slice(0, 12)}`);
    assert.ok(out.endsWith(' end'));
  }
});

test('markdown: transcript with folded tool calls and a safe fence', async () => {
  const { renderMarkdown } = await import('../src/markdown.js');
  const s = parseClaude(claudeRaw);
  s.events[2].output = 'has ``` inside';
  const md = renderMarkdown(s, { link: 'https://x.test/v/?g=a/b' });
  assert.ok(md.startsWith('# Fix the flaky test\n'));
  assert.ok(md.includes('> make the test pass'));
  assert.ok(md.includes('[▶ Watch the replay](https://x.test/v/?g=a/b)'));
  assert.ok(md.includes('<summary>Ran <code>npm test</code> ❌</summary>'));
  assert.ok(md.includes('````console'), 'fence longer than the backticks inside');
  assert.ok(md.includes('<summary>Edited <code>src/a.js</code> (+2 −1)</summary>'));
  assert.ok(md.includes('```diff\n a\n-b\n+B'));
});

test('action comment: inline transcript, cut to fit a GitHub comment', async () => {
  const { buildComment, transcriptBody } = await import('../scripts/comment.mjs');
  const { renderMarkdown } = await import('../src/markdown.js');
  const md = renderMarkdown(parseClaude(claudeRaw));
  const r = { title: 'Fix it', events: 5, tools: 2, files: 1, added: 2, removed: 1, activeMs: 120000, redactions: 0, url: null };
  const c = buildComment(r, 'https://x.test/artifact/1', md);
  assert.ok(c.includes('[▶ Download the replay](https://x.test/artifact/1)'));
  assert.ok(c.includes('<summary>Transcript</summary>'));
  assert.ok(c.includes('> make the test pass'));
  assert.ok(!c.includes('# Fix the flaky test'), 'title block of the export is dropped');
  const long = '---\n' + Array.from({ length: 400 }, (_, i) => `<details><summary>Ran <code>step ${i}</code></summary>\n\n${'x'.repeat(300)}\n\n</details>`).join('\n\n') + '\n---\nfooter';
  const cut = transcriptBody(long, 20000);
  assert.ok(cut.length < 20200);
  assert.ok(cut.trimEnd().endsWith('*The transcript is cut here; the full replay is linked above.*'));
  assert.ok(cut.split('<details>').length === cut.split('</details>').length, 'no half-open block');
});

test('video: a clear message when Chrome or ffmpeg is missing', async () => {
  const { recordVideo } = await import('../src/video.js');
  const saved = { c: process.env.CHROME_PATH, f: process.env.FFMPEG_PATH };
  process.env.FFMPEG_PATH = '/nonexistent/ffmpeg';
  try {
    await assert.rejects(recordVideo('<html></html>', '/tmp/x.gif'), /needs .*ffmpeg \(or set FFMPEG_PATH\)/);
  } finally {
    if (saved.f === undefined) delete process.env.FFMPEG_PATH; else process.env.FFMPEG_PATH = saved.f;
  }
});

test('cline: ui_messages.json with tools, commands, MCP and follow-ups', async () => {
  const { parseCline } = await import('../src/cline.js');
  const { detectAgent } = await import('../src/detect.js');
  const t = (s) => 1767225600000 + s * 1000;
  const raw = JSON.stringify([
    { ts: t(0), type: 'say', say: 'task', text: 'add retries to the webhook', images: [] },
    { ts: t(1), type: 'say', say: 'api_req_started', text: JSON.stringify({ request: '<task>\nadd retries\n</task>\n\n<environment_details>\n# Current Working Directory (/home/ada/shop) Files\nsrc/\n</environment_details>', tokensIn: 100, tokensOut: 20, cacheReads: 900, cacheWrites: 0 }) },
    { ts: t(2), type: 'say', say: 'reasoning', text: 'The handler sends once.' },
    { ts: t(3), type: 'say', say: 'text', text: 'Looking at the handler first.', modelInfo: { providerId: 'anthropic', modelId: 'claude-sonnet-5-5', mode: 'act' } },
    { ts: t(4), type: 'say', say: 'tool', text: JSON.stringify({ tool: 'readFile', path: 'src/webhook.ts', content: '/home/ada/shop/src/webhook.ts' }) },
    { ts: t(5), type: 'ask', ask: 'tool', text: JSON.stringify({ tool: 'editedExistingFile', path: 'src/webhook.ts', diff: '------- SEARCH\nawait send(e)\n=======\nawait retry(() => send(e))\n+++++++ REPLACE' }) },
    { ts: t(6), type: 'ask', ask: 'command', text: 'npm testREQ_APP' },
    { ts: t(7), type: 'ask', ask: 'command_output', text: '> test' },
    { ts: t(8), type: 'ask', ask: 'command_output', text: '2 passing' },
    { ts: t(9), type: 'say', say: 'tool', text: JSON.stringify({ tool: 'searchFiles', regex: 'retry\\(', path: 'src', content: 'src/webhook.ts\n│ await retry(' }) },
    { ts: t(10), type: 'say', say: 'use_mcp_server', text: JSON.stringify({ serverName: 'github', type: 'use_mcp_tool', toolName: 'create_issue', arguments: '{"title":"Flaky webhook"}' }) },
    { ts: t(11), type: 'say', say: 'mcp_server_response', text: 'created #12' },
    { ts: t(12), type: 'say', say: 'checkpoint_created' },
    { ts: t(13), type: 'say', say: 'user_feedback', text: 'also log each retry' },
    { ts: t(14), type: 'say', say: 'completion_result', text: 'Retries added.HAS_CHANGES' },
    { ts: t(15), type: 'ask', ask: 'completion_result', text: '' },
  ]);
  assert.equal(detectAgent('/x/saoudrizwan.claude-dev/tasks/1/ui_messages.json', raw), 'cline');
  assert.equal(detectAgent('dropped.json', raw.slice(0, 2000)), 'cline');
  const s = parseCline(raw, { path: '/x/saoudrizwan.claude-dev/tasks/1/ui_messages.json' });
  assert.equal(s.agent, 'Cline');
  assert.equal(s.cwd, '/home/ada/shop');
  assert.equal(s.model, 'claude-sonnet-5-5');
  assert.equal(s.title, 'add retries to the webhook');
  assert.deepEqual(s.events.map((e) => e.kind || e.type), ['prompt', 'text', 'read', 'edit', 'shell', 'search', 'mcp', 'prompt', 'text']);
  assert.equal(s.events[3].detail.added, 1);
  assert.equal(s.events[3].detail.removed, 1);
  assert.equal(s.events[4].title, 'npm test');
  assert.equal(s.events[4].output, '> test\n2 passing');
  assert.ok(s.events[5].output.includes('retry('));
  assert.equal(s.events[6].output, 'created #12');
  assert.equal(s.events.at(-1).text, 'Retries added.');
  assert.deepEqual(s.stats.tokens, { in: 1000, out: 20 });
  assert.equal(s.startedAt, new Date(t(0)).toISOString());
  assert.ok(!JSON.stringify(s).includes('"raw"'));
  assert.equal(parseCline(raw, { thinking: true }).events.filter((e) => e.type === 'thinking').length, 1);
});

test('cline: Roo Code opens with say:text and edits with :start_line: blocks', async () => {
  const { parseCline, searchReplace } = await import('../src/cline.js');
  const raw = JSON.stringify([
    { ts: 1767225600000, type: 'say', say: 'text', text: 'rename getUser to fetchUser' },
    { ts: 1767225601000, type: 'ask', ask: 'tool', text: JSON.stringify({ tool: 'appliedDiff', path: 'src/user.ts', diff: '<<<<<<< SEARCH\n:start_line:5\n-------\nexport function getUser() {\n=======\nexport function fetchUser() {\n>>>>>>> REPLACE' }) },
    { ts: 1767225602000, type: 'say', say: 'text', text: 'Renamed.' },
  ]);
  const s = parseCline(raw, { path: '/x/rooveterinaryinc.roo-cline/tasks/9/ui_messages.json' });
  assert.equal(s.agent, 'Roo Code');
  assert.deepEqual(s.events.map((e) => e.kind || e.type), ['prompt', 'edit', 'text']);
  assert.deepEqual(s.events[1].detail.diff.map(([op]) => op), ['-', '+']);
  assert.equal(parseCline(raw, { path: 'ui_messages.json' }).agent, 'Roo Code', 'Roo-only tools give it away');
  assert.deepEqual(searchReplace('------- SEARCH\na\n=======\nb\n+++++++ REPLACE\n------- SEARCH\nc\n=======\n+++++++ REPLACE'), [{ old_string: 'a', new_string: 'b' }, { old_string: 'c', new_string: '' }]);
});

test('cline: SDK messages file, with the working directory from its manifest', async () => {
  const { mkdtempSync, writeFileSync } = await import('node:fs');
  const { join } = await import('node:path');
  const { tmpdir } = await import('node:os');
  const { loadSession } = await import('../src/index.js');
  const { detectAgent } = await import('../src/detect.js');
  const ms = (s) => Date.parse(T(s));
  const doc = { version: 1, updated_at: T(9), agent: 'lead', sessionId: 's1', messages: [
    { role: 'user', ts: ms(0), content: [{ type: 'text', text: '<mode_notice>The user switched from plan mode to act mode before sending this message.</mode_notice><user_input mode="act">fix the flaky login test</user_input>' }] },
    { role: 'assistant', ts: ms(1), modelInfo: { id: 'claude-sonnet-5-5', provider: 'anthropic' }, metrics: { inputTokens: 50, outputTokens: 30, cacheReadTokens: 950 }, content: [
      { type: 'thinking', thinking: 'Probably a race.' },
      { type: 'text', text: 'Reading the test.' },
      { type: 'tool_use', id: 't1', name: 'read_files', input: { files: [{ path: '/home/ada/app/test/login.test.ts' }, { path: '/home/ada/app/src/login.ts' }] } },
      { type: 'tool_use', id: 't2', name: 'run_commands', input: { commands: ['npm test'] } },
    ] },
    { role: 'user', ts: ms(2), content: [
      { type: 'tool_result', tool_use_id: 't1', name: 'read_files', content: 'it("logs in")' },
      { type: 'tool_result', tool_use_id: 't2', name: 'run_commands', content: '1 failing', is_error: true },
    ] },
    { role: 'assistant', ts: ms(3), content: [
      { type: 'tool_use', id: 't3', name: 'editor', input: { path: '/home/ada/app/src/login.ts', old_text: 'a', new_text: 'a\nb' } },
      { type: 'tool_use', id: 't4', name: 'github__create_pull_request', input: { title: 'Fix the race' } },
      { type: 'tool_use', id: 't5', name: 'submit_and_exit', input: { summary: 'Fixed the race in login.' } },
    ] },
  ] };
  const raw = JSON.stringify(doc, null, 2);
  assert.equal(detectAgent('dropped.json', raw.slice(0, 2000)), 'cline');
  const dir = mkdtempSync(join(tmpdir(), 'agentvcr-cline-'));
  writeFileSync(join(dir, 's1.messages.json'), raw);
  writeFileSync(join(dir, 's1.json'), JSON.stringify({ version: 1, session_id: 's1', cwd: '/home/ada/app', model: 'claude-sonnet-5-5' }));
  const { session: s } = loadSession(join(dir, 's1.messages.json'), { redact: false });
  assert.equal(s.agent, 'Cline');
  assert.equal(s.title, 'fix the flaky login test');
  assert.equal(s.model, 'claude-sonnet-5-5');
  assert.deepEqual(s.events.map((e) => e.kind || e.type), ['prompt', 'text', 'read', 'shell', 'edit', 'mcp', 'text']);
  assert.equal(s.events[2].title, 'test/login.test.ts +1 more');
  assert.equal(s.events[3].error, true);
  assert.equal(s.events[3].output, '1 failing');
  assert.equal(s.events[4].title, 'src/login.ts');
  assert.equal(s.events[5].title, 'github · create_pull_request');
  assert.equal(s.events[6].text, 'Fixed the race in login.');
  assert.deepEqual(s.stats.tokens, { in: 1000, out: 30 });
});

test('cline: SDK tool inputs in the shapes Cline\'s own tests use', async () => {
  const { parseCline } = await import('../src/cline.js');
  const use = (id, name, input) => ({ role: 'assistant', ts: 1767225600000, content: [{ type: 'tool_use', id, name, input }] });
  const s = parseCline(JSON.stringify({ version: 1, updated_at: 'x', messages: [
    { role: 'user', ts: 1767225600000, content: 'hi' },
    use('a', 'run_commands', { commands: [{ command: 'ls', args: ['-la', '/tmp'] }] }),
    use('b', 'execute_command', { command: 'ls', args: ['-la'] }),
    use('c', 'search_codebase', 'retry('),
    use('d', 'search_codebase', ['retry(', 'backoff']),
    use('e', 'apply_patch', { input: '*** Begin Patch\n*** Update File: src/a.ts\n@@\n-a\n+b\n*** End Patch' }),
    use('f', 'fetch_web_content', { requests: [{ url: 'https://example.com/docs', prompt: 'summarize' }] }),
    use('g', 'read_files', '{"files":[{"path":"/src/config.ts","start_line":1,"end_line":20}]}'),
    use('h', 'attempt_completion', { result: 'All done!' }),
  ] }));
  assert.deepEqual(s.events.slice(1).map((e) => e.title ?? e.text), ['ls -la /tmp', 'ls -la', 'retry(', 'retry(, backoff', 'src/a.ts', 'https://example.com/docs', '/src/config.ts', 'All done!']);
  assert.equal(s.events[5].detail.added, 1);
});

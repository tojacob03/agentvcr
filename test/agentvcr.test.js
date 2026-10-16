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

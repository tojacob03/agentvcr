# Contributing

Thanks for helping. agentvcr is small on purpose: no dependencies, plain ES modules, Node 18 or newer.

```bash
git clone https://github.com/tojacob03/agentvcr && cd agentvcr
npm test                                   # node --test, no install step
node bin/agentvcr.js --list --all          # your own sessions
node bin/agentvcr.js examples/demo-session.jsonl
npm run site                               # rebuilds docs/demo, docs/v and docs/lib
```

## Add an agent

Most contributions will be a parser for another agent. Look at [`src/cursor.js`](src/cursor.js) (short) or [`src/gemini.js`](src/gemini.js) (handles edits to earlier messages) first.

1. **Find the format.** Locate where the agent stores sessions and read the agent's own source for the schema when it is open source. Don't guess from one file.
2. **Write `src/<agent>.js`** exporting `parse<Agent>(raw)` that returns the shared session (below). Translate the agent's tool names to the shared kinds by calling `toolEvent()` from `src/claude.js` with Claude Code's tool names, so edits, commands and plans render the same everywhere.
3. **Detect it** in [`src/detect.js`](src/detect.js) from the path and the first 64 KB. Make sure the check can't match another agent's files (Claude Code lines contain `msg_` ids, for example).
4. **Dispatch it** in [`src/parse.js`](src/parse.js), and if sessions live in a known folder, list them in [`src/sources.js`](src/sources.js).
5. **Test it** in [`test/agentvcr.test.js`](test/agentvcr.test.js) with a small inline fixture, and add the module name to the copy list in [`examples/demo.mjs`](examples/demo.mjs) so the website can parse it too.
6. Add a row to the agents table in the README.

Parsers must not use Node APIs: the same code runs in the browser on the website.

### The shared session

```js
{
  agent: 'Cursor',            // display name
  title: 'Fix the header',    // custom title, summary, or the first prompt
  cwd: '/home/ada/app',       // only its last folder name is ever shown
  branch: '', model: '', version: '',
  startedAt: '2026-01-01T10:00:00.000Z', endedAt: null,
  events: [
    { type: 'prompt', text, ts },                 // what the person typed
    { type: 'text', text, ts },                   // the agent's answer, Markdown
    { type: 'thinking', text, ts },               // only with --thinking
    { type: 'note', text, ts },                   // 'Interrupted by user', 'Context compacted'
    { type: 'tool', kind, name, title, detail, output, error, ts, end },
  ],
  stats: { ...computeStats(events), tokens: { in, out } },
}
```

`ts` is an ISO timestamp or `null`. Without timestamps the counter counts steps instead of minutes. Tool `kind` is one of `shell`, `edit`, `write`, `read`, `search`, `web`, `task`, `plan`, `mcp`, `other`; `toolEvent()` fills `kind`, `title` and `detail` for you.

## Masking

Secrets are masked in [`src/redact.js`](src/redact.js). A new pattern needs a test that it masks a realistic value and, where it could plausibly over-match, a test that a look-alike stays untouched. If you found a secret that agentvcr let through, please report it privately (see [SECURITY.md](SECURITY.md)) instead of in a public issue.

## The player

[`src/player.html`](src/player.html) is the whole player: one file, inline CSS and JS, no build. Keep it that way. `npm run smoke` opens a replay, the share viewer and the landing page in headless Chrome and checks that they boot, play, skip and link correctly (CI runs it too). It doesn't judge layout, so also check changes at phone width, in light and dark mode, and with a long session.

## Pull requests

- One change per pull request, with a test when it changes behaviour.
- `npm test` passes on Node 18, 20 and 22 (CI runs Linux, macOS and Windows).
- Write commit messages that say what changed and why.

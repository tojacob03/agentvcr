# agentvcr

[![test](https://github.com/tojacob03/agentvcr/actions/workflows/test.yml/badge.svg)](https://github.com/tojacob03/agentvcr/actions/workflows/test.yml) [![npm](https://img.shields.io/npm/v/agentvcr)](https://www.npmjs.com/package/agentvcr) ![dependencies: 0](https://img.shields.io/badge/dependencies-0-brightgreen) [![license: MIT](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

**Replays for AI coding sessions.** One command turns a Claude Code or Codex session into a single HTML file you can watch, scrub and share. Secrets are masked on your machine. No account, no upload, no dependencies.

```bash
npx agentvcr
```

[![A replay playing back: commands type out, diffs and terminal output unfold, and the scrubber marks every prompt, edit and error](docs/demo.gif)](https://tojacob03.github.io/agentvcr/)

**[▶ Watch the example replay](https://tojacob03.github.io/agentvcr/)**: Claude Code tracks down why a shop fulfills orders twice, reproduces it in a failing test, fixes it, and recovers from a type error on the way. The session is made up for the demo (see [`examples/demo.mjs`](examples/demo.mjs)); the replay is exactly what agentvcr produces.

## Why

An agent can work for an hour and leave behind nothing but a diff. Screenshots show one moment, and pasted logs are unreadable. agentvcr turns the whole session into something people will actually watch:

- **Show how you built it.** Put the replay next to your blog post, launch thread or PR.
- **Review the path, not just the result.** See which commands ran, what failed, and where the agent changed course.
- **Report a bug to your agent's makers** with the exact session, not a description of it.
- **Teach.** New teammates learn more from watching a good session than from a style guide.

## Usage

```bash
npx agentvcr              # pick a session from the current project
npx agentvcr last         # the most recent one
npx agentvcr <file|id>    # a .jsonl transcript or a session id
npx agentvcr --list --all # every session on this machine
```

It writes `agentvcr-<title>.html` and opens it in your browser.

| Option | |
|---|---|
| `-o, --out <file>` | output path |
| `-a, --all` | include sessions from every project |
| `--title <text>` | set the replay title |
| `--thinking` | include reasoning summaries when the transcript has them |
| `--subagents` | include subagent turns (Claude Code) |
| `--no-redact` | keep secrets, emails and your home path |
| `--no-open` | don't open a browser |

## What's in a replay

- A summary up top: what happened in one sentence, and a diffstat of every file changed. Click a file to jump to its first edit.
- Playback that types prompts and commands and streams answers, at 1× to 16×, with a clock that shows real working time
- The whole session as a waveform under the player: prompts tall and white, edits green, failures red. Drag to scrub.
- Real diffs for edits and patches, terminal output, plans and checklists, rendered Markdown
- Links to exact moments: `replay.html#42`
- One self-contained file that works offline, in dark and light mode, and on phones

Keys: `space` play/pause · `←` `→` previous/next step · `1`–`5` speed · `Home` / `End`

## Privacy

Everything runs locally. Before anything is written, agentvcr masks:

- API keys and tokens (Anthropic, OpenAI, GitHub, GitLab, Slack, AWS, Google, Stripe, npm), JWTs, bearer tokens and private keys
- `KEY=value` pairs whose name looks like a secret (`password`, `api_key`, `token`, …)
- credentials inside URLs, email addresses, your home directory and your username

The CLI tells you how many secrets it masked. Masking is pattern based, so **skim the replay before you share it**.

## Sharing

A replay is one HTML file with no external requests. Attach it to an issue, drop it on GitHub Pages, Netlify or S3, or send the file itself.

## Supported agents

| Agent | Where sessions live | Status |
|---|---|---|
| Claude Code | `~/.claude/projects/` | ✓ |
| Codex CLI / Codex app | `~/.codex/sessions/` | ✓ |
| Gemini CLI, Cursor, OpenCode | | planned, PRs welcome |

Set `CLAUDE_CONFIG_DIR` or `CODEX_HOME` if yours live elsewhere.

## How it works

Every agent writes its session as JSON lines. agentvcr reads them into one shared format (prompts, answers, tool calls with their results), masks secrets, and embeds the result in a small player. The whole package is about 20 KB, and Node 18 or newer is all you need.

```bash
git clone https://github.com/tojacob03/agentvcr && cd agentvcr
npm test
node bin/agentvcr.js --help
```

Adding an agent means writing one parser that returns the shared format. See `src/claude.js` and `src/codex.js`.

## License

MIT

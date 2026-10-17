# Launch kit

## Before you post

1. ✓ Published on npm as `agentvcr-cli` (the name `agentvcr` was blocked as too similar to `agent-vcr`).
2. Upload `docs/social.png` as the social preview: repo Settings → General → Social preview. GitHub has no API for this.
3. Make one real share link from a session you are happy to show (`npx agentvcr-cli last --share`) and use it in the posts next to the example.
4. Post Tuesday to Thursday, 15:00 to 17:00 German time (US morning). Spend the first two hours answering every comment.

Links:
- Site and drag-and-drop player: https://tojacob03.github.io/agentvcr/
- Example replay: https://tojacob03.github.io/agentvcr/demo/
- Example share link (same session, via a secret gist): https://tojacob03.github.io/agentvcr/v/?g=tojacob03/e6c8b2f5fff871e9a69597b3abbad84b
- Repo: https://github.com/tojacob03/agentvcr

## Lists and directories

Positioning: claude-replay (es617/claude-replay, ~850 stars) already makes HTML replays for the same agents and is listed on the big Claude Code lists. Every submission leads with what agentvcr adds: **share links without a server, replays commented on pull requests by the GitHub Action, the Claude Code plugin, and Markdown export for PRs.**

| Where | How | When | Status |
|---|---|---|---|
| Piebald-AI/awesome-gemini-cli | pull request | now | opened: Piebald-AI/awesome-gemini-cli#229 |
| GitHub Marketplace (the Action) | edit release v0.3.1, tick "Publish this Action to the GitHub Marketplace" (needs 2FA and the developer agreement) | now | you |
| Anthropic's plugin directory | claude.ai/directory/manage → "Plugin bundle" (paid Claude plan); describe the gist upload clearly, the review checks data leaving the machine | now | you |
| hesreallyhim/awesome-claude-code | the "recommend-resource" issue form on the website, filed by you, not an agent; projects must be 14 days old or have 100 stars | from 30 Oct 2026 | you |
| RoggeOhta/awesome-codex-cli | issue or PR; the maintainer wants real users or clear unique value | once there are users | later |
| awesome-opencode, awesome-ai-devtools, awesome-ai-coding-tools | pull requests; large backlogs, and the last two want tools that use AI themselves | low priority | later |

For awesome-claude-code, a description in their style (one line, describes rather than sells): *Turns Claude Code sessions into replays you can share as a link (secret gist, hosted player) or have commented on pull requests by a GitHub Action; also a plugin and Markdown export.*

## Show HN

**Title:** Show HN: Agentvcr – replays and share links for Claude Code, Codex, Cursor and OpenCode sessions

**Text:**
Coding agents work for an hour at a time, and all that's left afterwards is a diff. I wanted a way to show how a change came about: which commands ran, what failed, where the agent changed course.

agentvcr reads the session files the agents already write (Claude Code, Codex, Cursor, Gemini CLI, OpenCode exports) and turns one into a single HTML file: playback with a counter of real working time, the session as a waveform you can scrub (prompts, edits and failures marked), diffs, terminal output, and links to exact moments.

`npx agentvcr-cli last --share` uploads the replay as a secret gist on your own GitHub account and prints a link to a static player on GitHub Pages. There is no server of mine in the loop; deleting the gist takes it down. Secrets, emails and your home path are masked locally before anything is written.

You can also drop a transcript on the website and it plays right there, parsed in the browser: https://tojacob03.github.io/agentvcr/

There is also a GitHub Action that comments a replay on every pull request an agent opens in CI, and `&embed` for putting a replay in a blog post.

Zero dependencies, under 50 KB. Masking is regex based, and I would love to hear what it misses.

## X / Bluesky thread

1/ Your coding agent worked for an hour. All that's left is a diff.

agentvcr turns a Claude Code, Codex, Cursor or Gemini CLI session into a replay you can watch, scrub and share.

`npx agentvcr-cli`

[attach docs/demo.gif]

2/ `--share` gives you a link. The replay goes into a secret gist on your GitHub, a static player on Pages plays it. No account, no server, delete the gist to take it down.

3/ Every prompt, edit and failed command is a bar on the tape. Link to the exact moment you mean.

Example: https://tojacob03.github.io/agentvcr/demo/

4/ Secrets never leave your machine: API keys, tokens, passwords in URLs, emails and your home path are masked before anything is written. The site lets you switch each rule off to see what it catches.

5/ Or skip the CLI: drop a session file on the site and it plays in your browser, nothing uploaded. https://tojacob03.github.io/agentvcr/

6/ Agents in CI? `uses: tojacob03/agentvcr@v0` puts every run on tape and comments the replay on the PR.

Open source, MIT: github.com/tojacob03/agentvcr

## Reddit (r/ClaudeAI, r/ChatGPTCoding, r/cursor, r/commandline)

**Title:** I made asciinema for coding agents: replays and share links for Claude Code, Codex, Cursor and Gemini CLI sessions

**Text:**
I kept wanting to show people how a feature came together with an agent, not just the final diff. Screenshots don't capture it and raw logs are unreadable.

`npx agentvcr-cli` picks a session from your current project and writes one self-contained HTML file: playback with speed buttons, a waveform of the session marking prompts, edits and errors, real diffs, terminal output, and links to moments. `--share` turns it into a link via a secret gist on your GitHub. Secrets get masked locally.

There's also a Claude Code plugin: `/plugin marketplace add tojacob03/agentvcr`, then `/agentvcr:replay`.

Example: https://tojacob03.github.io/agentvcr/demo/
Repo: https://github.com/tojacob03/agentvcr

Feedback welcome, especially on what the masking misses and which agent to support next.

## LinkedIn

Coding agents now work for an hour at a time, and what's left afterwards is a diff. The path there, which commands ran, what failed and where the agent changed course, disappears.

I built agentvcr to keep it: one command turns a Claude Code, Codex, Cursor or Gemini CLI session into a replay you can watch and share as a link. Secrets are masked on your machine before anything is written, and there is no server in between.

Example replay: https://tojacob03.github.io/agentvcr/demo/
Open source: https://github.com/tojacob03/agentvcr

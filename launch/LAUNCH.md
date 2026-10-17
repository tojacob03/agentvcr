# Launch kit

## Before you post

1. **Publish 0.7.0 on npm before Sat 17 Oct, 19:00** (`npm publish` in the repo). npm still has 0.4.0, and the scheduled posts name eight agents and `-o clip.gif`, which need 0.7.0. Check with `npm view agentvcr-cli version`.
2. ✓ Social preview uploaded; GitHub release v0.7.0 out, CI green, `v0` moved.
3. ✓ Scheduled in Typefully: X thread Sat 17 Oct 19:00, LinkedIn Sat 17 Oct 19:10, X follow-up Mon 19 Oct 16:00 (4,929 ms → 11 ms, links the write-up).
4. Make one real share link from a session you are happy to show (`npx agentvcr-cli last --share`) and use it in the posts next to the example.
5. Launch is Saturday 17 Oct, 19:00 German time (13:00 US East). Spend the first two hours answering every comment.

Links:
- Site and drag-and-drop player: https://tojacob03.github.io/agentvcr/
- Example replay: https://tojacob03.github.io/agentvcr/demo/
- Example share link (same session, via a secret gist): https://tojacob03.github.io/agentvcr/v/?g=tojacob03/e6c8b2f5fff871e9a69597b3abbad84b
- Repo: https://github.com/tojacob03/agentvcr

## Launch day (Sat 17 Oct)

One click each; nothing goes out until you press the site's own submit button.

1. npm: `cd ~/agentvcr && npm publish` (before 19:00, the posts need 0.7.0)
2. Typefully, already scheduled: X thread 19:00, LinkedIn 19:10, follow-up Mon 19 Oct 16:00
3. [Show HN](https://news.ycombinator.com/submitlink?u=https%3A%2F%2Fgithub.com%2Ftojacob03%2Fagentvcr&t=Show%20HN%3A%20Agentvcr%20%E2%80%93%20shareable%20replays%20of%20Claude%20Code%2C%20Codex%20and%20Cursor%20sessions): then paste the "Show HN" text below as the first comment
4. [r/ClaudeAI](https://old.reddit.com/r/ClaudeAI/submit?selftext=true&title=I%20made%20asciinema%20for%20coding%20agents%3A%20replays%20and%20share%20links%20for%20Claude%20Code%2C%20Codex%2C%20Cursor%2C%20Gemini%20CLI%2C%20Cline%2C%20Aider%20and%20more&text=I%20kept%20wanting%20to%20show%20people%20how%20a%20feature%20came%20together%20with%20an%20agent%2C%20not%20just%20the%20final%20diff.%20Screenshots%20don%27t%20capture%20it%20and%20raw%20logs%20are%20unreadable.%0A%0A%60npx%20agentvcr-cli%60%20picks%20a%20session%20from%20your%20current%20project%20and%20writes%20one%20self-contained%20HTML%20file%3A%20playback%20with%20speed%20buttons%2C%20a%20waveform%20of%20the%20session%20marking%20prompts%2C%20edits%20and%20errors%2C%20real%20diffs%2C%20terminal%20output%2C%20and%20links%20to%20moments.%20%60--share%60%20turns%20it%20into%20a%20link%20via%20a%20secret%20gist%20on%20your%20GitHub.%20Secrets%20get%20masked%20locally.%0A%0AThere%27s%20also%20a%20Claude%20Code%20plugin%3A%20%60%2Fplugin%20marketplace%20add%20tojacob03%2Fagentvcr%60%2C%20then%20%60%2Fagentvcr%3Areplay%60.%0A%0AExample%3A%20https%3A%2F%2Ftojacob03.github.io%2Fagentvcr%2Fdemo%2F%0ARepo%3A%20https%3A%2F%2Fgithub.com%2Ftojacob03%2Fagentvcr%0A%0AFeedback%20welcome%2C%20especially%20on%20what%20the%20masking%20misses%20and%20which%20agent%20to%20support%20next.) and [r/ChatGPTCoding](https://old.reddit.com/r/ChatGPTCoding/submit?selftext=true&title=I%20made%20asciinema%20for%20coding%20agents%3A%20replays%20and%20share%20links%20for%20Claude%20Code%2C%20Codex%2C%20Cursor%2C%20Gemini%20CLI%2C%20Cline%2C%20Aider%20and%20more&text=I%20kept%20wanting%20to%20show%20people%20how%20a%20feature%20came%20together%20with%20an%20agent%2C%20not%20just%20the%20final%20diff.%20Screenshots%20don%27t%20capture%20it%20and%20raw%20logs%20are%20unreadable.%0A%0A%60npx%20agentvcr-cli%60%20picks%20a%20session%20from%20your%20current%20project%20and%20writes%20one%20self-contained%20HTML%20file%3A%20playback%20with%20speed%20buttons%2C%20a%20waveform%20of%20the%20session%20marking%20prompts%2C%20edits%20and%20errors%2C%20real%20diffs%2C%20terminal%20output%2C%20and%20links%20to%20moments.%20%60--share%60%20turns%20it%20into%20a%20link%20via%20a%20secret%20gist%20on%20your%20GitHub.%20Secrets%20get%20masked%20locally.%0A%0AThere%27s%20also%20a%20Claude%20Code%20plugin%3A%20%60%2Fplugin%20marketplace%20add%20tojacob03%2Fagentvcr%60%2C%20then%20%60%2Fagentvcr%3Areplay%60.%0A%0AExample%3A%20https%3A%2F%2Ftojacob03.github.io%2Fagentvcr%2Fdemo%2F%0ARepo%3A%20https%3A%2F%2Fgithub.com%2Ftojacob03%2Fagentvcr%0A%0AFeedback%20welcome%2C%20especially%20on%20what%20the%20masking%20misses%20and%20which%20agent%20to%20support%20next.): text prefilled; check each subreddit's flair and self-promotion rules first, and space them out
5. [GitHub Marketplace](https://github.com/tojacob03/agentvcr/releases/edit/v0.7.0): tick "Publish this Action to the GitHub Marketplace" and save
6. Answer every comment for the first two hours.

## Lists and directories

Positioning: claude-replay (es617/claude-replay, ~850 stars) already makes HTML replays for the same agents and is listed on the big Claude Code lists. Every submission leads with what agentvcr adds: **share links without a server, replays commented on pull requests by the GitHub Action, the Claude Code plugin, and Markdown export for PRs.**

| Where | How | When | Status |
|---|---|---|---|
| Piebald-AI/awesome-gemini-cli | pull request | now | merged 17 Oct: Piebald-AI/awesome-gemini-cli#229 |
| GitHub Marketplace (the Action) | edit the latest release (v0.6.0), tick "Publish this Action to the GitHub Marketplace" (needs 2FA and the developer agreement) | now | you |
| Anthropic's plugin directory | claude.ai/directory/manage → "Plugin bundle" (paid Claude plan); describe the gist upload clearly, the review checks data leaving the machine | now | you |
| hesreallyhim/awesome-claude-code | the "recommend-resource" issue form on the website, filed by you, not an agent; projects must be 14 days old or have 100 stars | from 30 Oct 2026 | you |
| RoggeOhta/awesome-codex-cli | issue or PR; the maintainer wants real users or clear unique value | once there are users | later |
| awesome-opencode/awesome-opencode | YAML entry in data/projects (PR) | now | opened: awesome-opencode/awesome-opencode#891 (last merges in July, large backlog) |
| awesome-ai-devtools, awesome-ai-coding-tools | pull requests; large backlogs, and both want tools that use AI themselves | low priority | later |

For awesome-claude-code, a description in their style (one line, describes rather than sells): *Turns Claude Code sessions into replays you can share as a link (secret gist, hosted player) or have commented on pull requests by a GitHub Action; also a plugin and Markdown export.*

## Show HN

**Title:** Show HN: Agentvcr – shareable replays of Claude Code, Codex and Cursor sessions  
(HN cuts titles at 80 characters; this is 79.) Submit the repo URL, then post the text below as the first comment.

**Text:**
Coding agents work for an hour at a time, and all that's left afterwards is a diff. I wanted a way to show how a change came about: which commands ran, what failed, where the agent changed course.

agentvcr reads the session files the agents already write (Claude Code, Codex, Cursor, Gemini CLI, Qwen Code, Cline, Aider, OpenCode exports) and turns one into a single HTML file: playback with a counter of real working time, the session as a waveform you can scrub (prompts, edits and failures marked), diffs, terminal output, and links to exact moments.

`npx agentvcr-cli last --share` uploads the replay as a secret gist on your own GitHub account and prints a link to a static player on GitHub Pages. There is no server of mine in the loop; deleting the gist takes it down. Secrets, emails and your home path are masked locally before anything is written.

You can also drop a transcript on the website and it plays right there, parsed in the browser: https://tojacob03.github.io/agentvcr/

There is also a GitHub Action that comments a replay on every pull request an agent opens in CI, and `&embed` for putting a replay in a blog post.

Zero dependencies, under 60 KB. Masking is regex based, and I would love to hear what it misses.

## X / Bluesky thread

1/ Your coding agent worked for an hour. All that's left is a diff.

agentvcr turns a Claude Code, Codex, Cursor, Gemini CLI, Qwen Code, Cline, Aider or OpenCode session into a replay you can watch, scrub and share.

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

**Title:** I made asciinema for coding agents: replays and share links for Claude Code, Codex, Cursor, Gemini CLI, Cline, Aider and more

**Text:**
I kept wanting to show people how a feature came together with an agent, not just the final diff. Screenshots don't capture it and raw logs are unreadable.

`npx agentvcr-cli` picks a session from your current project and writes one self-contained HTML file: playback with speed buttons, a waveform of the session marking prompts, edits and errors, real diffs, terminal output, and links to moments. `--share` turns it into a link via a secret gist on your GitHub. Secrets get masked locally.

There's also a Claude Code plugin: `/plugin marketplace add tojacob03/agentvcr`, then `/agentvcr:replay`.

Example: https://tojacob03.github.io/agentvcr/demo/
Repo: https://github.com/tojacob03/agentvcr

Feedback welcome, especially on what the masking misses and which agent to support next.

## LinkedIn

Coding agents now work for an hour at a time, and what's left afterwards is a diff. The path there, which commands ran, what failed and where the agent changed course, disappears.

I built agentvcr to keep it: one command turns a Claude Code, Codex, Cursor, Gemini CLI, Qwen Code, Cline, Aider or OpenCode session into a replay you can watch and share as a link. Secrets are masked on your machine before anything is written, and there is no server in between.

Example replay: https://tojacob03.github.io/agentvcr/demo/
Open source: https://github.com/tojacob03/agentvcr

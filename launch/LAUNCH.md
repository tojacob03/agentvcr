# Launch kit

## Before you post

1. Create the public repo `tojacob03/agentvcr` and push.
   - Description: `Replays for AI coding sessions. Turn a Claude Code or Codex session into one HTML file you can watch and share.`
   - Topics: `claude-code`, `codex`, `ai-agents`, `developer-tools`, `cli`, `replay`
   - Social preview image: `docs/replay.png`
2. `npm publish` so `npx agentvcr` works. Without it the repo loses most of its stars.
3. Put a live demo on GitHub Pages: the replay of the session that built agentvcr, as `docs/index.html`. Read it fully first; it is your own session.
4. Post on a Tuesday to Thursday, 15:00 to 17:00 German time (US morning). Spend the first two hours answering every comment.

## Show HN

**Title:** Show HN: Agentvcr – replays for Claude Code and Codex sessions

**Text:**
Coding agents now work for an hour at a time, and all that's left afterwards is a diff. I wanted a way to show *how* a change came about: which commands ran, what failed, where the agent changed course.

agentvcr reads the session files Claude Code and Codex already write (~/.claude/projects, ~/.codex/sessions) and turns one into a single HTML file. It plays back with a scrubber that marks prompts, edits and errors, and you can link to exact moments (#42). Secrets, emails and your home path are masked locally before anything is written. It has no dependencies, the package is 20 KB, and nothing gets uploaded.

`npx agentvcr`

The demo is the replay of the session in which agentvcr itself was built: <DEMO-LINK>

Masking is regex based. I'd love to hear about patterns it misses, and which agents to support next.

## X / Bluesky thread

1/ Your coding agent worked for an hour. All that's left is a diff.

agentvcr turns a Claude Code or Codex session into a replay you can watch, scrub and share. One command, one HTML file.

`npx agentvcr`

[video: 20 seconds of playback at 8×]

2/ Here is the replay of the session that built agentvcr itself, prompts and dead ends included: <DEMO-LINK>

3/ Every prompt, edit and failed command sits on the timeline. Link to the exact moment you mean: replay.html#42

4/ Privacy: it runs locally, masks API keys, tokens, emails and your home path, and tells you how many it masked. No upload, no account.

5/ Open source, MIT, zero dependencies: github.com/tojacob03/agentvcr. Gemini CLI and Cursor support are next. PRs welcome.

## Reddit (r/ClaudeAI, r/ChatGPTCoding, r/commandline)

**Title:** I made a tool that turns Claude Code / Codex sessions into shareable replays (asciinema for agents)

**Text:**
I kept wanting to show people *how* a feature came together with Claude Code, not just the final diff. Screenshots don't capture it and raw logs are unreadable.

`npx agentvcr` picks a session from your current project and writes one self-contained HTML file: playback with speed control, a timeline marking prompts, edits and errors, real diffs, terminal output, and deep links to moments. Secrets get masked locally.

Demo (the session that built it): <DEMO-LINK>
Repo: https://github.com/tojacob03/agentvcr

Feedback welcome, especially on what the redaction misses.

## Record the 20-second video

Open the demo, press `4` for 8× speed and `space`, and record the screen (macOS: Cmd+Shift+5). This clip does more work than any text.

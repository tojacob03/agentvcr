# Changelog

## Unreleased

- Markdown export: `-o session.md` writes a transcript with each tool call folded into a `<details>` block, ready for pull requests, issues and docs.

## 0.3.1

- Skipping to the end, reading the whole transcript or opening a deep link late in a long session no longer blocks the page: 11 ms instead of 4.9 s for a session with 5,000 tool calls.
- Published on npm as `agentvcr-cli` (`agentvcr` was blocked as too similar to an existing package). The installed command is still `agentvcr`.

## 0.3.0

- GitHub Action: `uses: tojacob03/agentvcr@v0` replays the agent run of a job, uploads it as an artifact and comments on the pull request.
- OpenCode support via `opencode export`, current and older formats.
- Claude Code SDK output (`claude -p` JSON and claude-code-action's execution file).
- Chapters for sessions with several prompts; tokens in and out in the summary.
- `--json` output for scripts and CI; `&embed` for iframes in blog posts.
- More secret patterns: Hugging Face, OpenRouter, Groq, Replicate, Supabase, SendGrid, Mapbox, Slack and Discord webhooks.

## 0.2.0

- `--share`: upload the masked replay as a secret gist and get a link to the hosted player.
- Cursor and Gemini CLI support.
- Claude Code plugin with `/agentvcr:replay`.
- Website with an in-browser player: drop a transcript and it plays, nothing uploaded.
- The player looks like a VCR: blue-screen summary with a diffstat, a waveform of the session, a counter of real working time, direct 1×/2×/4×/8× speed buttons.

## 0.1.0

- First release: Claude Code and Codex sessions to one self-contained HTML replay with local secret masking.

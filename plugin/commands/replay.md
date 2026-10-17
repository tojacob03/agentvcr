---
description: Turn this session into a replay you can watch or share (add "share" for a link)
argument-hint: "[share]"
allowed-tools: Bash(npx:*)
---

Make a replay of the current Claude Code session with agentvcr. The current session is the most recent one in this project, so `last` picks it.

If the arguments contain "share" ($ARGUMENTS), run:

```
npx -y agentvcr@latest last --share --no-open
```

Otherwise run:

```
npx -y agentvcr@latest last --no-open
```

If npm cannot find the package, run the same command with `npx -y github:tojacob03/agentvcr` in place of `npx -y agentvcr@latest`.

Then reply in one or two lines: the file path or link the command printed, and how many secrets it masked. When sharing, also mention that the gist is secret and can be deleted to take the replay down. Do not summarize the session.

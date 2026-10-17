---
description: Turn this session into a replay you can watch or share (add "share" for a link)
argument-hint: "[share]"
allowed-tools: Bash(npx:*)
---

Make a replay of the current Claude Code session with agentvcr. The current session is the most recent one in this project, so `last` picks it.

If the arguments contain "share" ($ARGUMENTS), run:

```
npx -y agentvcr-cli@latest last --share --no-open
```

Otherwise run:

```
npx -y agentvcr-cli@latest last --no-open
```

Then reply in one or two lines: the file path or link the command printed, and how many secrets it masked. When sharing, also mention that the gist is secret and can be deleted to take the replay down. Do not summarize the session.

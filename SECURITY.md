# Security

agentvcr's promise is that a replay can be shared without leaking secrets. Two kinds of reports matter most:

- **A secret that was not masked.** An API key, token, password, private key or similar that shows up in a replay.
- **A way for a replay to run code** in the viewer's browser (the player renders untrusted transcripts and loads shared gists).

Please report these privately through [GitHub's private vulnerability reporting](https://github.com/tojacob03/agentvcr/security/advisories/new), not in a public issue. Describe the format of the value (for example "starts with `xyz_`, 40 characters"), never the real secret.

You can expect a first answer within a few days. Fixes ship as a patch release on npm (`agentvcr-cli`) and are noted in the [changelog](CHANGELOG.md).

Masking is pattern based and cannot catch everything. That is why the CLI reports how many things it masked and asks people to skim a replay before sharing it.

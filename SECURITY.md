# Security policy

## Supported versions

Security fixes go into the latest minor release only. Today that's 0.3.x.
Upgrade to it before you report a problem against an older version.

## Reporting a vulnerability

Report it privately through GitHub's private vulnerability reporting. Open the
repository's Security tab and choose "Report a vulnerability", or go straight
to [the advisory form](https://github.com/pariveo/salesforce-agent-skills/security/advisories/new).
Please don't open a public issue, pull request or discussion for it.

Say which file and version are affected, how to reproduce the problem, and
what an attacker would gain. We'll confirm we received the report, keep you
updated in the advisory, and credit you when the fix is published unless you'd
rather stay anonymous.

## Scope

This policy covers the code in this repository that runs on a user's machine.

- `skills/salesforce-flow-modernizer/scripts/check-flow.mjs`, the checker. An
  agent runs it with Node.js on the flow files it writes or is asked to
  review. It reads those files and prints findings.
- `hooks/sfdx-skill-guard.mjs`, the Claude Code hook. Claude Code runs it
  before every Write and Edit tool call while the plugin is enabled. It reads
  the hook event on standard input and either prints a reminder or stays
  silent.
- The maintainer scripts in `scripts/`, which run only when a contributor
  starts them.

It also covers instructions in `SKILL.md` or `references/` that would lead an
agent to run an unexpected command or to send data somewhere.

These are out of scope:

- Vulnerabilities in Salesforce, Claude Code or Codex. Report them to
  Salesforce, Anthropic or OpenAI.
- A flow design the skill recommends that turns out wrong or slow. That's a
  bug, so open an issue.

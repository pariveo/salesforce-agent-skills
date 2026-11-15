# AGENTS.md

This repository ships two agent skills for Salesforce automation work. Each
folder under `skills/` is the single source of its skill's content. Codex
discovers them through the `.agents/skills/` symlinks and the repo-local
marketplace in `.agents/plugins/`, and Claude Code loads them through the
plugin manifest in `.claude-plugin/`.

## Skills

`salesforce-flow-modernizer` builds, audits, and migrates Salesforce Flows
with current platform elements instead of loop-and-decision patterns. It
carries:

- `SKILL.md`, with the workflow, a decision table from requirement to element
  (with metadata tag, minimum org API version and example file), and the
  escape conditions under which a legacy pattern is correct.
- `references/`, with one file per domain (collections, screens,
  record-triggered, integration and security, AI and agents, legacy
  migration, delivery) plus `org-conventions.md`. The agent reads only the
  domains a task touches.
- `examples/`, with one deploy-verified `.flow-meta.xml` per pattern. Each
  has a header comment naming the pattern, what it replaces, and its shape
  rules.
- `scripts/check-flow.mjs`, a dependency-free checker for legacy patterns and
  for shapes the platform rejects at deploy time.

Before any design, the skill reads `references/org-conventions.md`, and a
filled-in decision there outranks the skill's defaults.

`salesforce-automation-mapper` lists all the automation on one object in a
local sfdx project and the order it runs in, without changing anything. It
carries:

- `SKILL.md`, with the workflow and the output format.
- `references/save-order.md`, with the stages of a save and the four order
  rules, each with its source.
- `scripts/map-automation.mjs`, a dependency-free script that lists the
  object's flows, processes, workflow rules and Apex triggers and the fields
  each writes. It orders nothing.

It reads the conventions file from
`../salesforce-flow-modernizer/references/org-conventions.md`, so the two
skills sit next to each other.

A platform fact both skills state lives in `salesforce-flow-modernizer`
between `<!-- shared:<id> -->` and `<!-- /shared:<id> -->` markers. The
mapper holds a copy, and the smoke test fails while a copy differs.

## Invocation

In Codex CLI or the IDE extension, list skills with `/skills`, mention one
with `$salesforce-flow-modernizer` or `$salesforce-automation-mapper`, or
rely on implicit invocation through the skill descriptions.

## Verification rule

Never assert Salesforce feature availability, limits, GA status, or
deprecations from memory when the answer changes the design or an audit
finding. Check the target org's API version and the official documentation
on help.salesforce.com and developer.salesforce.com.

## Platform notes

- Codex offers the plugin's hook for trust. On
  [`apply_patch` edits](https://learn.chatgpt.com/docs/hooks#pretooluse)
  the hook reads the patch text in `tool_input.command` and gives the Flow
  reminder when the patch adds, updates or moves a file into a
  `main/default/flows/` folder. Claude Code sends `tool_input.file_path`.
- The hook script needs Node.js on the PATH. It's advisory, which means it
  adds a reminder to the session and never blocks a tool call.

## Keeping the skills current

To check the skills against a new Salesforce release, use the maintainer skill
`release-review` in `.claude/skills/` (Codex finds it through
`.agents/skills/`). It doesn't ship in the plugin. `maintenance/release.json`
records the release the skills were last reviewed against, and the
"Release reviews" section of CONTRIBUTING.md explains the scripts it uses.

## Editing this repository

Follow [CONTRIBUTING.md](CONTRIBUTING.md). It holds the rules for content,
code comments and examples, the scratch-org deploy every example change
needs, the smoke test to run before a commit, and the commit and pull request
conventions. The behavioural eval suite lives in `evals/`, and
[evals/README.md](evals/README.md) explains it.

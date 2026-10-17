# AGENTS.md

This repository ships one agent skill for Salesforce Flow work. The skill
folder under `skills/salesforce-flow-modernizer/` is the single source of
content. Codex discovers it through the `.agents/skills/` symlink and the
repo-local marketplace in `.agents/plugins/`, and Claude Code loads it through
the plugin manifest in `.claude-plugin/`.

## Skill

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

## Invocation

In Codex CLI or the IDE extension, list skills with `/skills`, mention one
with `$salesforce-flow-modernizer`, or rely on implicit invocation through the
skill description.

## Verification rule

Never assert Salesforce feature availability, limits, GA status, or
deprecations from memory when the answer changes the design or an audit
finding. Check the target org's API version and the official documentation
on help.salesforce.com and developer.salesforce.com.

## Platform notes

- The `hooks/` directory serves Claude Code only. Codex doesn't run these
  hooks, so under Codex the skill is invoked through its description alone.
- The hook script needs Node.js on the PATH. It's advisory, which means it
  adds a reminder to the session and never blocks a tool call.

## Editing this repository

Follow [CONTRIBUTING.md](CONTRIBUTING.md). It holds the rules for content and
examples, the scratch-org deploy every example change needs, the smoke test
to run before a commit, and the commit and pull request conventions. The
behavioural eval suite lives in `evals/`, and
[evals/README.md](evals/README.md) explains it.

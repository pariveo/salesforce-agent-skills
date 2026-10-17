# Salesforce agent skills

A Salesforce Flow skill for Claude Code and Codex that audits existing flows
and builds new ones with current elements instead of loop-and-decision
patterns. Built and maintained by [Pariveo](https://pariveo.eu).

[![verify](https://github.com/pariveo/salesforce-agent-skills/actions/workflows/verify.yml/badge.svg)](https://github.com/pariveo/salesforce-agent-skills/actions/workflows/verify.yml)
[![Licence: MIT](https://img.shields.io/github/license/pariveo/salesforce-agent-skills)](LICENSE)
[![Latest release](https://img.shields.io/github/v/release/pariveo/salesforce-agent-skills)](https://github.com/pariveo/salesforce-agent-skills/releases/latest)

## Install for Claude Code

Add the repository as a marketplace, then install the plugin from it:

```bash
claude plugin marketplace add pariveo/salesforce-agent-skills
```

```bash
claude plugin install salesforce-agent-skills@pariveo
```

To try it for one session without installing, clone the repository and point
Claude Code at the clone:

```bash
claude --plugin-dir /path/to/salesforce-agent-skills
```

The skill appears as `/salesforce-agent-skills:salesforce-flow-modernizer`,
and `/plugin` lists it under Installed. Claude Code also loads it on its own
when a task touches Flow, because the skill description says what it covers.

The plugin adds a PreToolUse hook. Before Claude Code writes into a
`*/main/default/flows/` folder, the hook reminds the session to load the
skill. It never blocks a write, and it needs Node.js on the PATH.

## Install for Codex

Codex discovers Agent Skills in `.agents/skills/`
([Codex documentation](https://developers.openai.com/codex/skills)). The
repository ships a symlink there that points at the skill folder, so starting
Codex inside a clone is enough:

```bash
git clone https://github.com/pariveo/salesforce-agent-skills.git
```

```bash
cd salesforce-agent-skills && codex
```

Run `/skills` to confirm `salesforce-flow-modernizer` is listed, or mention it
with `$salesforce-flow-modernizer`. To use it from any project, link the skill
into your user skills folder:

```bash
mkdir -p ~/.agents/skills && ln -s /path/to/salesforce-agent-skills/skills/salesforce-flow-modernizer ~/.agents/skills/salesforce-flow-modernizer
```

You can also install it as a Codex plugin from the repository's marketplace
in `.agents/plugins/`:

```bash
codex plugin marketplace add pariveo/salesforce-agent-skills
```

```bash
codex plugin add salesforce-agent-skills@pariveo
```

The plugin's skill is then named
`salesforce-agent-skills:salesforce-flow-modernizer`. Codex doesn't run the
Claude Code hook, so under Codex the skill is invoked through its description
alone.

## Compatibility

Checked with Claude Code 2.1.296 and Codex CLI 0.163.0 on macOS. For 0.3.1,
each tool installed the plugin from a clone into a fresh configuration
directory and listed the skill afterwards, and Codex also found it through
`.agents/skills/` and a user skills folder. The example flows deploy on org
API 67.0 and 68.0, and the decision table lists the lowest org API version for
each element, so the skill also works against older orgs with fewer elements
available.

You need Node.js for the checker and the hook. Deploy validation needs the
Salesforce CLI with an authenticated org. Without one, the skill delivers a
build spec or metadata labelled as unvalidated.

## What it does

Without guidance, a coding agent can build a Flow that works but is built the
way Flow was taught before the newer elements existed. It uses a Loop, a
Decision and an Assignment where a single Transform belongs, and an after-save
update of the triggering record that runs the record's whole save order a
second time. Why agents do this isn't measured here. One plausible reason is
that much of the public Flow material predates Transform and reactive screens.

The skill gives the agent three things to act on instead.

- A decision table in `SKILL.md` that maps each requirement to the element
  that meets it, with its metadata tag, the lowest org API version that has
  it, an example file, and the legacy pattern it replaces. Collection Filter
  and Transform replace collection loops, choice sets replace choices built
  in a loop, before-save updates replace after-save round trips, and
  asynchronous paths, scheduled paths and Wait elements replace synchronous
  work and polling.
- One `.flow-meta.xml` example per pattern in `examples/flows/`. Each was
  deployed to a scratch org and, where the flow can run without a user, run
  against data. The header comments record shape rules the Metadata API
  reference leaves out, such as a Transform join's `JoinDefinition`, the
  asynchronous path that must not carry a label, and the platform event Wait
  whose resume filter is `inputParameters`.
- A checker, `scripts/check-flow.mjs`, that needs only Node. It fails on DML
  or queries inside loops, undeclared loops, after-save updates of the
  triggering record, Transform in before-save flows and malformed
  asynchronous paths. It warns on all-fields queries, missing fault paths,
  hard-coded IDs and addresses, and actions on the synchronous path.

A loop is allowed only under one of six named escape conditions, such as a
per-item call to an action that takes single values, or a result that
depends on earlier items. The agent declares the escape in the loop's
description. "I couldn't verify the element exists" and "a loop is simpler"
are listed as reasons that don't count.

Point the skill at an existing flow and it audits before it changes anything.
It runs the checker, inventories what remains against the decision table, and
writes a report ranked by impact (governor limits, then security context, then
user experience) with a replacement for every finding. It rewrites the flow
only when you ask, following the report's plan.

With an authenticated Salesforce CLI, the skill writes the metadata and runs
`sf project deploy validate` against the org you name. Without one, it writes
a build spec precise enough to click through in Flow Builder.

The skill reads `references/org-conventions.md` before every task. That file
holds the decisions that differ from one org to the next, such as naming, the
running-user policy, shared subflows, fault handling, trigger order on shared
objects and the deployment gate. A filled-in slot outranks the skill's
defaults, and an empty one shows up in the deliverable as an open decision.

Domain references cover collections, screens, record-triggered flows and
events, integration and security, AI and agents, delivery, and migration from
Process Builder and workflow rules. The agent reads only the ones a task
touches.

## Try it

The repository ships a legacy flow to practise on. Clone it and start your
agent in the clone (`claude --plugin-dir .` or `codex`):

```bash
git clone https://github.com/pariveo/salesforce-agent-skills.git && cd salesforce-agent-skills
```

Then ask:

> Audit `evals/audit-legacy-flow/fixtures/Opportunity_Legacy_Rollup.flow-meta.xml`
> for legacy patterns and tell me what to change first. Don't edit the file.
> No Salesforce org is connected.

The skill tells the agent to run the checker first and to rank what it finds
by impact, with a replacement for each finding. The checker alone already
reports a record update inside a loop, a loop without a declared escape, and
an after-save update of the triggering record. Run it yourself:

```bash
node skills/salesforce-flow-modernizer/scripts/check-flow.mjs evals/audit-legacy-flow/fixtures/Opportunity_Legacy_Rollup.flow-meta.xml
```

In your own project, ask for example:

- "Audit `Case_Escalation_Handler` for legacy patterns and write the
  migration plan."
- "Design a record-triggered flow that sends a renewal reminder 30 days
  before `Contract.EndDate`, and tell me which of our conventions it depends
  on."
- "Review this flow XML for legacy patterns before I deploy it."

## Compared with Salesforce's own Flow skill

Salesforce's `salesforce-development` plugin ships `automation-flow-generate`,
which generates new Flow XML through a hosted three-step pipeline that the
agent must not bypass or edit. This skill starts from the flows you already
have, keeps its reasoning in files you can read, and has a slot for your
team's conventions. You can use both, auditing here, generating with whichever
tool you trust, and reviewing the result here.
[The full comparison](docs/compared-with-salesforce-development.md) names the
version and date it was checked against.

## Make it yours

Fork the repository, or copy the skill folder into your project, and fill in
`references/org-conventions.md` one decision at a time. Commit each one, so the
history shows when the team settled its running-user policy or its
fault-handling standard, and why.

A conventions file is the smallest version of a harness, the set of skills,
hooks and review gates around a coding agent that tells it what an org's
structure means. A harness for one org also holds skills built on the team's
own trigger framework and permission model, guardrail hooks, review gates
before deploy, and a worked example built in that org.
[Pariveo](https://pariveo.eu) helps Salesforce teams build theirs, starting
with an assessment of how well an org serves as context for AI agents.

## Evals

`evals/` holds public scenarios in the `claude plugin eval` format. Most are
builds that each probe one pattern, including cases where Transform isn't
allowed, a case where a loop is the right answer, and a trigger event the
requirement decides. One audits a seeded legacy flow. Each case runs with and
without the plugin, so the difference is what the skill contributes.
[evals/README.md](evals/README.md) explains how to run them.

## Contributing

Bug reports and pattern requests go into
[GitHub Issues](https://github.com/pariveo/salesforce-agent-skills/issues/new/choose).
Pull requests are limited to Pariveo maintainers, as
[CONTRIBUTING.md](CONTRIBUTING.md) explains. Report security problems
privately, as [SECURITY.md](SECURITY.md) describes. Releases and what counts as a breaking
change are recorded in [CHANGELOG.md](CHANGELOG.md).

## Licence

MIT. See [LICENSE](LICENSE).

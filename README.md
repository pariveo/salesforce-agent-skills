# Salesforce agent skills

Salesforce skills for Claude Code and Codex. One audits existing flows and
builds new ones with current elements instead of loop-and-decision
patterns. The other lists all the automation on one object and the order it
runs in. Built and maintained by [Pariveo](https://pariveo.eu).

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

The skills appear as `/salesforce-agent-skills:salesforce-flow-modernizer`
and `/salesforce-agent-skills:salesforce-automation-mapper`, and `/plugin`
lists the plugin under Installed. Claude Code also loads a skill on its own
when a task fits it, because each skill's description says what it covers.

The plugin adds a PreToolUse hook. Before Claude Code writes into a
`*/main/default/flows/` folder, the hook reminds the session to load the
skill. It never blocks a write, and it needs Node.js on the PATH.

## Install for Codex

Codex discovers Agent Skills in `.agents/skills/`
([Codex documentation](https://developers.openai.com/codex/skills)). The
repository ships a symlink there for each skill folder, so starting Codex
inside a clone is enough:

```bash
git clone https://github.com/pariveo/salesforce-agent-skills.git
```

```bash
cd salesforce-agent-skills && codex
```

Run `/skills` to confirm `salesforce-flow-modernizer` and
`salesforce-automation-mapper` are listed, or mention one with
`$salesforce-flow-modernizer`. To use them from any project, link the skills
into your user skills folder:

```bash
mkdir -p ~/.agents/skills && ln -s /path/to/salesforce-agent-skills/skills/salesforce-flow-modernizer ~/.agents/skills/salesforce-flow-modernizer
```

```bash
ln -s /path/to/salesforce-agent-skills/skills/salesforce-automation-mapper ~/.agents/skills/salesforce-automation-mapper
```

Link `salesforce-automation-mapper` only next to `salesforce-flow-modernizer`.
It reads the team's conventions file from
`../salesforce-flow-modernizer/references/org-conventions.md`, and without
it the map lists no open decisions.

You can also install it as a Codex plugin from the repository's marketplace
in `.agents/plugins/`:

```bash
codex plugin marketplace add pariveo/salesforce-agent-skills
```

```bash
codex plugin add salesforce-agent-skills@pariveo
```

The plugin's skills are then named
`salesforce-agent-skills:salesforce-flow-modernizer` and
`salesforce-agent-skills:salesforce-automation-mapper`. Codex asks you to trust
the plugin's hook, and asks again whenever an update changes it. Codex writes
files through `apply_patch` and
[sends the patch as `tool_input.command`](https://learn.chatgpt.com/docs/hooks#pretooluse).
The hook reads the file paths from that patch, and when a patch adds,
updates or moves a file into a `*/main/default/flows/` folder, it reminds
the session to load the skill.

## Compatibility

Checked plugin installation with Claude Code 2.1.296 and Codex CLI 0.163.0
on macOS. For 0.3.1, each tool installed the plugin from a clone into a
fresh configuration directory and listed the skill afterwards, and Codex
also found it through `.agents/skills/` and a user skills folder. Hook trust
and the Flow reminder on `apply_patch` edits were checked with Codex CLI
0.169.0-alpha.11.1 on macOS.

The example flows deploy on org API 67.0 and 68.0, and the decision table
lists the lowest org API version for each element, so the Flow skill also works
against older orgs with fewer elements available. The skills were last reviewed against Winter '27 (API 68.0).
Maintainers review them again for each Salesforce release, as
[CONTRIBUTING.md](CONTRIBUTING.md#release-reviews) describes.

You need Node.js for the checker, the mapper script and the hook. Deploy
validation needs the Salesforce CLI with an authenticated org. Without one,
the Flow skill delivers a
build spec or metadata labelled as unvalidated.

## What it does

### salesforce-flow-modernizer

Without guidance, a coding agent can build a Flow that works but is built the
way Flow was taught before the newer elements existed. It uses a Loop, a
Decision and an Assignment where a single Transform belongs, and an after-save
update of the triggering record that saves the record a second time. Why agents do this isn't measured here. One plausible reason is
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

### salesforce-automation-mapper

Not measured yet. The evals check what it does. No benchmark has measured how
it changes an agent's output.

The skill lists all the automation on one object in a local sfdx project and
the order it runs in when a record is saved. It changes no file and needs no
org.

- A script, `scripts/map-automation.mjs`, that needs only Node. It lists the
  object's record-triggered, schedule-triggered and platform event-triggered
  flows, Process Builder processes, workflow rules and Apex triggers, with
  the facts the order depends on: trigger event, entry conditions, trigger
  order, status, workflow evaluation criteria, a process's start condition,
  trigger events. It lists the object's fields each item writes, and which
  fields more than one item writes. It orders nothing.
- `references/save-order.md`, which holds the rules the agent orders them
  by, each with its source on help.salesforce.com or
  developer.salesforce.com: the stages of a save, trigger order bands and
  their tie-break, which saves run each automation, what runs again when a
  workflow field update or an after-save flow saves the record again, and
  which value is on the record when two automations write the same field.
  Where the documentation doesn't settle a case, the file says what a debug
  log on a deployed project showed and marks it as observed.

The answer is a table of the automation grouped by stage, the order within
each stage with the rule that settles it, every field more than one
automation writes with the value it ends with, and what the local files
can't show, such as automation from installed packages. Where the metadata
doesn't settle an order, for example between flows without a trigger order,
the skill says so and points to Flow Trigger Explorer. It reads the trigger
order the team recorded in the core skill's `org-conventions.md` and lists
the rows still missing for the object.

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

For the automation map, the repository ships a small project with flows, a
process, workflow rules and an Apex trigger on Account. List it with the
script:

```bash
node skills/salesforce-automation-mapper/scripts/map-automation.mjs --object Account --project-dir evals/fixtures/account-automation
```

Then ask the agent, started in `evals/fixtures/account-automation`, what
runs when an account is created there, and in which order.

New to the Salesforce CLI? [A first hour for admins](docs/first-hour-for-admins.md)
copies your sandbox's automation into a local project, without changing the
org, and runs both skills on it.

In your own project, ask for example:

- "Audit `Case_Escalation_Handler` for legacy patterns and write the
  migration plan."
- "Design a record-triggered flow that sends a renewal reminder 30 days
  before `Contract.EndDate`, and tell me which of our conventions it depends
  on."
- "Review this flow XML for legacy patterns before I deploy it."
- "List all the automation on Opportunity and the order it runs in."

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

Fork the repository, or copy the skill folders into your project, and fill in
`skills/salesforce-flow-modernizer/references/org-conventions.md` one decision at a time. Commit each one, so the
history shows when the team settled its running-user policy or its
fault-handling standard, and why.

A conventions file is the smallest version of a harness, the set of skills,
hooks and review gates around a coding agent that tells it what an org's
structure means. A harness for one org also holds skills built on the team's
own trigger framework and permission model, guardrail hooks, review gates
before deploy, and a worked example built in that org. Its building blocks
are specs that keep the business requirement apart from the technical design,
skills the agent loads when a task fits them, rules that apply to every task,
subagents that take on a subtask in their own context, and hooks that run as
guardrails before or after an action. [Pariveo](https://pariveo.eu) sets up
such a harness together with a team's admins and developers in
[workshops](https://pariveo.eu/services/agentic-coding-workshops), for Claude
Code or Codex, and the team develops it further on its own. Pariveo recommends
an assessment of how well the org serves as context for AI agents as a first
look, so the harness starts from what the org already has.

## Evals

`evals/` holds public scenarios in the `claude plugin eval` format. Most are
builds that each probe one pattern, including cases where Transform isn't
allowed, a case where a loop is the right answer, and a trigger event the
requirement decides. One audits a seeded legacy flow. Four map the automation
on the Account fixture and check the order rules, the overlaps and that no
file changes. Each case runs with and without the plugin, so the difference
is what the skills contribute.
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

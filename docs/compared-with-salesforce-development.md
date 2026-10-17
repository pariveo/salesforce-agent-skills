# Compared with Salesforce's own Flow skill

Salesforce ships a Claude Code plugin called `salesforce-development` in the
[forcedotcom/sf-skills](https://github.com/forcedotcom/sf-skills) repository.
Its Flow skill is `automation-flow-generate`. People often file both under
"Claudeforce", the Salesforce and Anthropic partnership
[announced on 26 August 2026](https://www.salesforce.com/news/press-releases/2026/08/26/salesforce-and-anthropic-announce-claudeforce/),
so the names need sorting out first. Claudeforce's first plugin, "Salesforce
in Claude", carries sales skills for sellers and has no Flow build skill. The
developer-facing plugin is `salesforce-development`, and that is what this
page compares against.

The comparison reads `automation-flow-generate` at version 1.1. It was first
checked on 11 September 2026 and checked again on 17 October 2026, when the
`salesforce-development` plugin was at version 2.5.0. If the plugin's
[source](https://github.com/forcedotcom/sf-skills/tree/main/plugins/builder/salesforce-development)
no longer matches a row below, open an issue here and the row gets fixed.

## Two different jobs

`automation-flow-generate` generates new Flow metadata. Its trigger phrases
are "create, build, or generate a flow". It runs a mandatory three-step
pipeline through `execute_metadata_action`, a tool on a Salesforce-hosted MCP
server. The pipeline fetches grounded object metadata from the org, selects
the flow elements, and then generates the XML element by element. The skill forbids producing or editing Flow XML
any other way, and forbids changing the returned XML except to fix a
deployment error on explicit request.

`salesforce-flow-modernizer` starts from the flows an org already has. It
runs a checker over them, inventories the remaining legacy patterns against a
decision table, pairs each with its current replacement, ranks the findings by
impact and writes a migration plan before anything gets rewritten. New builds
go through the same table. The agent writes the metadata from deploy-verified
examples, checks it, and deploy-validates it with the Salesforce CLI, or,
without org access, delivers a build spec for Flow Builder.

| | `automation-flow-generate` (Salesforce) | `salesforce-flow-modernizer` (this repo) |
| --- | --- | --- |
| Primary job | Generate a new Flow from a prompt | Audit and migrate existing Flows, and build new ones from the same decision table |
| Existing flows | Not in scope | The starting point: findings, replacements, migration plan |
| How metadata is produced | A hosted pipeline returns the XML, and the agent must not write or edit it | The agent writes it from deploy-verified examples, runs `check-flow.mjs`, then `sf project deploy validate` |
| Grounding against the org | Live schema fetch through the hosted MCP server | Local sfdx project plus `sf org display` for the API version |
| Where the knowledge lives | Server side, inside the pipeline | On disk: `SKILL.md`, `references/`, `examples/`, readable and forkable |
| Team conventions | No slot for them | `references/org-conventions.md`, read before every task |
| Without org access | The pipeline needs the MCP connection | Build spec, labelled as unvalidated |
| Runs on | Claude Code plugin. The skill file also installs elsewhere with `npx skills add`, but needs the MCP tool configured | Claude Code and Codex, with no server dependency |
| Prerequisites (plugin) | Claude Code 2.1.222+, Node LTS, Salesforce CLI, Python 3.8+ | Node for the optional hook, Salesforce CLI for deploy validation |
| Licence | Apache-2.0 | MIT |

## What Salesforce's skill does better

The hosted pipeline sees the org's schema at generation time and emits XML
that Salesforce validates on its side. For a green-field flow against a
complex data model, that grounding is real, and this repository doesn't
replicate it. The `salesforce-development` plugin also brings 36 other skills,
an Apex and SOQL language server, deploy safety gates and an org-context hook,
so as a toolbox it covers far more than Flow.

## What this skill does that Salesforce's doesn't

It reads before it writes. An org with hundreds of flows needs to know which
of them still loop where a Transform belongs, which update the triggering
record after save, and which run in system context by accident, before it
needs a generator. The audit report is the deliverable, and the team decides
on the rewrite with that report in hand.

Its reasoning sits in files you can read. Every decision-table row, escape
condition and example is in the repository, so a team can see why the skill
chose a scheduled path over a nightly batch, disagree, and change the table.
A pipeline that must not be edited has no place to record an org's
exceptions.

It has a place for the org's own decisions, such as naming, the running-user
policy, the subflow library, fault handling, trigger order and the deployment
gate. `org-conventions.md` ships empty on purpose. Each slot the team fills in
outranks the skill's defaults, and each slot left open shows up in the
deliverable as a decision still to make.

It works where the MCP server isn't available, for example under Codex, on a
locked-down network, or on a consultant's laptop without a connected org. The
build spec mode covers those cases.

## Using both

Run the audit here to learn what an existing flow does and what it should
become. Hand a green-field build to whichever generator the team trusts,
Salesforce's pipeline included. Then run this skill's review checklist on the
result, because a generated flow still needs an owner who knows what it does.

# Changelog

All notable changes to this project are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

A change is breaking, and raises the major version, when it can stop an
existing setup from working. That covers a renamed or removed skill, a removed
checker rule or a changed rule code (`FLOW001` and the rest), a changed hook
contract (what the hook reads, what it prints, or when it speaks), and a
renamed slot in `org-conventions.md`. A changed recommendation in the
decision table isn't breaking, since flows built under the old one keep
working. While the version is below 1.0.0, a breaking change raises the minor
version instead.

## [Unreleased]

### Added

- **The skill names the release it was last reviewed against**, Summer '26
  (API 67.0). On an org with a newer API version, it now says the decision
  table can miss newer elements before calling a requirement unsupported, and
  checks that release's notes.
- A release review for maintainers: the `release-review` skill, a Flow schema
  diff against the Metadata WSDL, a source inventory, and example validation
  at a new API version. CONTRIBUTING.md describes it.
- Checker rule FLOW019: an `<ends>` element in a flow that isn't in
  Auto-Layout is an error, because the deploy rejects it.

### Fixed

- **The checker knows the Flow fields of API 68.0 (Winter '27).** Flow
  Builder now saves end elements as `<ends>`, and the checker warned
  (FLOW018) on every such flow. It also took `<timeValue>` and four other
  value tags for invalid and reported a deploy error that doesn't happen.
- `scripts/validate-examples.mjs` no longer fails on an org's own uncovered
  Apex. It ran `sf project deploy validate`, which always runs Apex tests, so
  an org whose own trigger had no coverage reported "Failed" while every
  example deployed. It now runs a dry-run deploy without tests.

## [0.3.1] - 2026-10-17

The first public release. The skill's decision table, escape conditions,
checker rules and example metadata are the same as in 0.3.0. What changed is
the wording around them and the sources behind them.

### Added

- A "Try it" walkthrough in the README that audits the legacy flow shipped in
  `evals/audit-legacy-flow/fixtures/`, and the Codex plugin install through
  `codex plugin marketplace add`.

### Changed

- **Plainer wording across `SKILL.md`, the references and the example header
  comments**, with the meaning kept. The skill uses Salesforce's current
  names: schedule-triggered flow, asynchronous path, and Data 360 next to Flow
  Builder's Data Cloud-Triggered Flow label.
- **Every platform limit and date in the references links its official
  source.** Checking them corrected these claims:
  - Flows without a Trigger Order run by activation date, not creation date.
  - Spring '24 extended custom validation to every standard screen extension
    component, not only Name, Address and Data Table.
  - `FlowDefinition` isn't deprecated for activation. Salesforce recommends
    discontinuing it from API 44.
  - The File Attach automation event's release note lists other editions than
    the Automation Event Library does. Both are now named.
  - Two Help pages disagree on whether Apex tests or flow tests reach the
    coverage that "Deploy processes and flows as active" requires. The
    reference cites both pages and says to check the org.
  - Now marked "Not verified" because no official page states them: an Action
    Button activation rule below flow API 59, and Einstein credit use by AI
    Decision outcomes.

## [0.3.0] - 2026-10-17

This release fixes two places where 0.2.0's own guidance made a build worse.
An example's trigger event was copied into flows it didn't fit, and the
before-save and collection advice disagreed on a sum.

### Changed

- **The trigger event is decided from the requirement, never copied from an
  example.** `Opportunity_Closed_Won_Handover` starts on create and update with
  "only when a record is updated to meet the condition requirements", which
  is right for its job: a deal entered as already won still needs a handover.
  Agents copied that start into flows where only a change into the condition
  counted. Salesforce treats a new record's before state as meeting no
  conditions, so a record created already meeting them runs the flow
  ([How Entry Conditions Work in Record-Triggered Flows](https://help.salesforce.com/s/articleView?id=platform.automate_flow_build_working_with_conditions_record_triggered_flows.htm&type=5)).
  Workflow step 3 now asks for the trigger event before any example is
  opened, `references/record-triggered.md` states when to use update-only,
  create-and-update, or ask, and the example's header says why it includes
  create.
- **Before-save outranks Transform.** When a value on the triggering record
  is a sum over a collection, the flow stays before-save and sums in a Loop
  declared `Escape: E3`. Counts still use Filter + `AssignCount`. The skill
  does not move the work to after-save to reach a Transform. Reasoning: the
  Loop holds no DML and no query, so its cost is CPU in memory, while an
  after-save update of the triggering record runs the whole save order a
  second time (before-save flows, triggers, validation, after-save flows).
  Salesforce names before-save flows for same-record field updates as the
  largest performance gain in record-triggered automation
  ([Record-Triggered Automation decision guide](https://architect.salesforce.com/docs/architect/decision-guides/guide/record-triggered)).
  The skill follows that platform guidance even where it costs a Transform.
  A task meant to call for a Transform should put the value somewhere other
  than the triggering record. `FLOW005` and `FLOW006` name E3 as the way out,
  `FLOW006` no longer suggests moving to after-save, and `SKILL.md`, escape
  E3, `references/record-triggered.md` and `references/collections.md` state
  the same precedence.

### Added

- Two evals: `update-only-trigger` (only a change into the condition counts)
  and `before-save-sum` (a sum on the triggering record stays before-save with
  a declared E3 Loop).

## [0.2.0] - 2026-09-28

0.1.0 named current elements without showing their metadata, hedged every
modern entry with "verify before designing around it", and offered escape
conditions loose enough to justify a loop by default. This release gives the
agent metadata to copy, availability by org API version, testable escapes,
and a checker for its own output.

### Added

- `examples/flows/`: twelve `.flow-meta.xml` files, one per pattern, each
  deployed to a scratch org on API 67.0 and, where the flow runs headless,
  run against data. Header comments record the pattern, what it replaces,
  and shape rules the Metadata API reference leaves out (Transform join
  `JoinDefinition`, async path without a label, platform-event Wait resume
  filter as `inputParameters`, Collection Sort sorting in place).
- `scripts/check-flow.mjs` in the skill: a dependency-free checker that fails
  on DML or Get Records inside loops, loops without a declared escape,
  after-save updates of the triggering record, Transform in before-save
  flows, malformed or duplicate async paths and split element groups, and
  warns on all-fields queries, missing fault paths, hard-coded IDs and email
  addresses, synchronous actions in after-save flows, missing entry
  conditions, and a first Decision that only gates. It also fails a join
  whose mapping sits in a different Transform (FLOW017) and value tags that
  are not in the Metadata API reference (FLOW018). Both pass a read-through
  review and fail at deploy.
- Decision table in `SKILL.md`: requirement, element, metadata tag, lowest
  org API version, example file, and the legacy pattern it replaces.
- Escape conditions E1 to E6 with testable predicates, a list of reasons that
  are not escape conditions, and a rule to declare each escape in the loop's
  description and the deliverable.
- `evals/`: nine public `claude plugin eval` scenarios (eight builds, one
  audit of a seeded legacy flow) with regex graders on the produced metadata.
- `scripts/validate-examples.mjs`: check-only deployment of the examples to
  an explicitly named org.
- `org-conventions.md`: slots for the target API version and for escapes the
  team pre-approves.
- A fixed closing block for every deliverable (mode, checker, deploy
  validation, status, running context, escapes, open decisions), and explicit
  rules for Draft status, element grouping, fault paths when the convention
  is unset, and before-save queries on create (`$Record.Id` is null).

### Changed

- `references/modern-patterns.md` and `references/delivery-and-validation.md`
  are replaced by per-domain references (`collections`, `screens`,
  `record-triggered`, `integration-and-security`, `ai-and-agents`,
  `legacy-migration`, `delivery`), and the agent reads only the ones a task
  touches.
- Workflow: the org API version is established before design, availability
  follows the version table, and deploy-validate is the verification step.
  Unverifiable no longer means unavailable.
- `SKILL.md` limit raised from 130 to 250 lines so the decision table and
  escapes sit in the file every task loads.
- The smoke test also checks the examples against the checker, the checker
  against the legacy fixture and synthetic deploy-error shapes, SKILL.md's
  links and example names, and the eval suite's shape.

### Fixed

- A platform event-triggered flow is an autolaunched flow with `triggerType`
  PlatformEvent, not a record-triggered flow.
- Removed the non-existent "Choice Collection" resource and documented Record,
  Picklist and Collection Choice Sets.
- Screen actions: Action Button GA Winter '25, automatic triggers GA Summer
  '25, active autolaunched flows only.
- Running context: autolaunched flows default to user context for most
  launchers, and `UserMode` (API 68) is documented.
- Flow Tests cover autolaunched flows (Test Mode, beta) and scheduled paths.
- Agent integration uses the Run Agent element (API 67).
- AI Decision outcomes carry their current name and their exclusions.
- The rule that Data 360 reads run on the asynchronous path applies to
  record-triggered flows.
- The Data 360 write action is `dataCloudIngestionApi`.
- Record-triggered flows on ContentDocument and ContentVersion are beta.
- Creating workflow rules was blocked in Winter '23.
- Email templates are referenced by name.
- The dependency view is the flow's Usage tab.

## [0.1.0] - 2026-09-11

### Added

- `salesforce-flow-modernizer` skill: audits existing Flows against a catalog
  of legacy patterns and their current replacements, reports findings ranked
  by impact before any rewrite, migrates along the resulting plan on request,
  and designs new Flows from the same catalog. Delivers deploy-validated
  metadata with an authenticated Salesforce CLI, and a click-through build
  spec without one.
- `references/org-conventions.md`: the decision slots that differ from one
  org to the next (naming, running-user context, shared subflows, fault
  handling, trigger order, deployment gate). Filled slots outrank the
  catalog, and empty ones surface as open decisions in every deliverable.
- Claude Code plugin manifest and marketplace, plus a PreToolUse hook that
  points the session at the skill before it writes into a `flows/` metadata
  folder.
- Codex support through `.agents/skills/` discovery and a repo-local plugin
  marketplace, from the same skill folder.
- `docs/compared-with-salesforce-development.md`: how this skill differs
  from `automation-flow-generate` in Salesforce's own Claude Code plugin,
  and when to use which.

[Unreleased]: https://github.com/pariveo/salesforce-agent-skills/compare/v0.3.1...HEAD
[0.3.1]: https://github.com/pariveo/salesforce-agent-skills/releases/tag/v0.3.1

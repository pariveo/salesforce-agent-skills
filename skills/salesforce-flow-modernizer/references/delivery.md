# Delivery: audit report, build spec, deployment, tests, review

## Contents

- Audit report
- Metadata delivery
- Build spec
- Activation and deployment
- Flow Tests
- Troubleshooting a deployed flow
- Review checklist

## Audit report

An audit comes before any rewrite. Use this shape:

```markdown
# <Flow API name> modernization audit

Flow type, trigger, API version, running context.
Checker: `node scripts/check-flow.mjs --api <v> <file>` → <n> errors, <n> warnings.

## Findings

| # | Element(s) | Legacy pattern | Current replacement | Impact | Checker |
| - | ---------- | -------------- | ------------------- | ------ | ------- |
| 1 | `Loop_Lines`, `Update_Line` | Update Records inside a loop | Transform to the update collection, one Update after | Governor limits: High | FLOW001 |

## Open decisions

Convention slots this flow depends on that org-conventions.md leaves unset.

## Migration plan

1. Ordered steps, each independently deployable, highest impact first.
2. Each step says whether it ships inactive or inside a maintenance window.
```

Rules:

- Rank by impact: governor limits (DML or queries in loops, recursion from
  after-save self-updates, all-fields queries on large objects), then
  security context, then user experience and maintainability.
- Every finding names its replacement from the decision table and, where one
  exists, the example file, because a finding that names no replacement
  leaves the reader nothing to act on.
- A legacy pattern that one of the escape conditions justifies is reported
  as justified, with the escape, not as a finding.
- Describe the pattern, not the author.
- Cite the official source for any availability or limit claim that decides
  a finding, and mark what you could not verify as unverified.
- Do not modify the flow unless asked. When asked, follow the plan's order.

## Metadata delivery

- One file per flow at `<package dir>/main/default/flows/<ApiName>.flow-meta.xml`.
- `apiVersion` matches the org API version unless compatibility requires a
  lower one. Screen actions and the Action Button need 59.
- `status` Draft unless the user explicitly asks for an active flow or the
  activation-policy slot says so. A request to "keep it current" describes
  behaviour, not activation, so say activation is pending. The examples are
  Active only because they were run.
- Keep all elements of one type contiguous (checker FLOW016). Flow Builder
  writes them in alphabetical order of type, as the examples do.
- When the fault-handling slot is unset, show the fault message on screen
  flows and return it in an output on flows with outputs. On any other flow,
  leave the fault connector off, keep the FLOW009 warning, and list fault
  handling as an open decision. Do not invent outputs the caller did not ask
  for.
- Copy element shapes from `examples/flows/`, because the examples are what
  deployed. The Metadata API reference marks some fields the platform uses as
  reserved (Transform joins) and omits others (Wait elements on platform
  events).
- Give the flow a `description`, every loop an `Escape:` description, and
  every agent-facing variable a description.
- Run the checker, then `sf project deploy validate --source-dir <file>
  --target-org <alias>`. Report both commands and their results. Without an
  org, say the XML is unvalidated.
- On failure, fix against the exact message. The domain references list the
  errors seen so far and their causes.

## Build spec

Without CLI access, write a spec a builder can click through in Flow Builder
without making decisions:

1. Flow type and trigger: object, DML events, entry conditions, before- or
   after-save, asynchronous and scheduled paths, trigger order, running
   context.
2. Resources: every variable, constant, formula, choice set and collection
   with name, type, input and output availability, and description.
3. Elements in execution order: element type (current Flow Builder name),
   API name, purpose in one line, full configuration, connectors including
   fault paths. For Transform, give every mapping row. For a join, give both
   collections, the keys and the selected fields.
4. Formulas written out in full, ready to paste.
5. Declared escapes and open convention decisions.
6. Exit criteria: what proves the flow works, and the test steps.

## Activation and deployment

- Treat activation as a deliberate step. Ship with `status` Draft and
  activate after checking, or deploy with `status` Active where the target
  allows it. In a scratch org, redeploying an active flow replaced its active
  version in place (observed), but do not assume the same in production.
- "Deploy processes and flows as active" (Process Automation Settings) is the
  production setting for deploying processes and autolaunched flows as
  active. It requires the flow test coverage percentage you set, and flows
  with screens are exempt. Its page says Apex tests reach the percentage
  ([Deploy Processes and Flows as Active](https://help.salesforce.com/s/articleView?id=platform.flow_distribute_deploy_active.htm&type=5)),
  while the Flow Tests limits page says automated flow test scenarios count
  and Apex tests do not
  ([Automated Flow Testing Limits and Limitations](https://help.salesforce.com/s/articleView?id=platform.flow_considerations_feature_testing.htm&type=5)).
  Check which one the target org enforces before relying on either.
- Before deactivating or deleting, check what references the flow on its
  Usage tab in the Automation app (Spring '26), which shows dependencies both
  ways.
- A flow version can be deleted only when it is inactive and has no paused
  interviews, and failed interviews can also block deletion.
- Since API 44, Salesforce recommends discontinuing `FlowDefinition` for
  activation, so use the flow's `status`. A deployed FlowDefinition's active
  version overrides it
  ([FlowDefinition](https://developer.salesforce.com/docs/atlas.en-us.api_meta.meta/api_meta/meta_flowdefinition.htm)).

## Flow Tests

Source for this section unless linked otherwise:
[Automated Flow Testing Limits and Limitations](https://help.salesforce.com/s/articleView?id=platform.flow_considerations_feature_testing.htm&type=5).

- Available for record-triggered and Data Cloud-triggered flows, and for
  autolaunched flows through
  [Test Mode (Beta)](https://help.salesforce.com/s/articleView?id=platform.automate_flow_test_mode.htm&type=5).
  Screen flows are not among the supported types.
- Scheduled paths are testable but asynchronous paths are not, and
  delete-triggered flows allow manually evaluated scenarios only.
- [Mock outputs (Beta)](https://help.salesforce.com/s/articleView?id=platform.automate_flow_test_mock_output.htm&type=5)
  cover action and subflow elements only, so Get Records is not mocked. Run
  from Data Silo gives isolated test data backed by an Apex `@testSetup`
  class, with rollback.
- A flow can have up to 200 tests, and test data cannot use formulas.
- CLI: `sf flow run test` and `sf logic run test` (Beta, runs Apex and flow
  tests together). Always pass `--target-org`.
- Say which flows get tests and why. Business-critical automation gets
  them, and the org-conventions deployment gate may require it.

## Troubleshooting a deployed flow

- Flow Builder Debug: run with a chosen record and running user to see the
  path and every element's values.
- Paused and Failed Flow Interviews in Setup: failures with their messages,
  and interviews waiting in Wait elements or screens.
- Scheduled-path work waits on the Time-Based Automation page until its
  time.
- Flow error emails go to the configured error recipient, so make sure it is
  a monitored inbox.
- Debug logs for the running user capture record-triggered execution. Platform
  event-triggered flows log under the Automated Process user.

## Review checklist

Run on every produced, migrated or reviewed flow:

- [ ] `check-flow.mjs` reports no ERROR, and every WARNING has a stated decision
- [ ] Deploy-validated against a named org, or labelled unvalidated
- [ ] No loop without a declared escape (E1–E3), and no DML or Get Records in any loop
- [ ] Collection work uses Filter, Sort and Transform, and before-save counts use `AssignCount`
- [ ] Choice options that live in records come from choice sets, not loops
- [ ] Screen values that depend on input react on the same screen, and input rules sit on components
- [ ] Screen flows declare `recordId`/inputs, outputs, and their embedding surface
- [ ] Same-record updates happen in before-save flows, with no after-save update of `$Record`
- [ ] Entry conditions gate record-triggered flows on real changes
- [ ] Callouts, emails and unrelated DML sit on the asynchronous path unless E4 holds
- [ ] Date-relative timing uses scheduled paths, and event waits use Wait elements, not polling
- [ ] Trigger Order set where several flows share an object and order matters
- [ ] Get Records lists explicit fields and handles empty results
- [ ] Fault paths end in meaningful handling, or the open fault-handling decision is listed
- [ ] Running context chosen deliberately and stated
- [ ] No hard-coded IDs, URLs or addresses
- [ ] Agent-facing flows: autolaunched, described inputs and outputs, prescriptive failure messages
- [ ] API version is current, and Flow Tests are planned for business-critical logic
- [ ] Every convention slot the flow depends on is filled in or listed as open

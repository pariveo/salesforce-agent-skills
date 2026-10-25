---
name: salesforce-flow-modernizer
description: >
  Builds, audits, and migrates Salesforce Flows with current platform elements
  (Collection Filter, Transform including sums, counts and joins, record and
  picklist choice sets, reactive screens, screen actions, before-save updates,
  custom errors, asynchronous and scheduled paths, platform event triggers and
  waits, agent actions) instead of loop-and-decision patterns. Use for any
  Flow work: writing or reviewing .flow-meta.xml metadata, Flow Builder build
  specs, screen, record-triggered, autolaunched or scheduled flows, migrating
  Process Builder or workflow rules, and troubleshooting flows.
---

# Salesforce Flow modernization

Models default to the Flow patterns of their training data: Loop + Decision +
Assignment, DML inside loops, after-save updates of the triggering record,
extra screens to recalculate. This skill replaces them with the current
elements, and gives you deploy-verified metadata for each one in `examples/`.

These rules decide most outcomes:

1. **The modern element is the default.** A Loop needs a declared escape
   condition (below). When an element's XML is unfamiliar, copy the shape
   from its example file instead of avoiding the element.
2. **Unverifiable is not unavailable.** Availability follows the org's API
   version and the table below. You do not need web access to use an element
   whose minimum is at or below the org's version. Deploy validation is the check.
3. **Every loop and every fallback is explained.** Name the escape in the
   Loop's description and in the deliverable. Without a named escape, do not
   write the loop.

## Workflow

Copy this checklist into your working notes and tick it off:

```
- [ ] 1. Read references/org-conventions.md; list the unset slots this task depends on
- [ ] 2. Establish the org API version
- [ ] 3. Classify the task: build, audit, or migrate; flow type, trigger event, runs as whom
- [ ] 4. Map every requirement through the decision table; open each example you use
- [ ] 5. Write the metadata (or the build spec)
- [ ] 6. Run scripts/check-flow.mjs; fix every ERROR, decide every WARNING
- [ ] 7. Deploy-validate when an org is available; otherwise label the XML unvalidated
- [ ] 8. Run the review checklist in references/delivery.md and deliver
```

**Step 1. Conventions.** A filled-in slot in
[org-conventions.md](references/org-conventions.md) outranks this skill's
defaults. An empty slot means the default applies and the deliverable lists it
under open decisions.

**Step 2. API version.** With an org,
`sf org display --target-org <alias>` shows "Api Version". Without one, use
`sourceApiVersion` from the project's `sfdx-project.json`, or 68.0 when that
is missing too, and say so. Set new flows' `apiVersion` to that version.

**Step 3. Classify.** Existing flow or new build. Flow type (screen,
record-triggered before-save or after-save, autolaunched, schedule-triggered, platform
event-triggered). Triggering object and trigger event, answered from the
requirement before you open any example. The question is whether a record
created already meeting the condition counts, or only one that changes into
it. Create and update with "only when updated to meet the condition" fires
on such a create, while update-only does not. If the requirement does not say, ask or state the
assumption ([record-triggered.md](references/record-triggered.md)). Who runs it (user, system,
agent). What must happen synchronously. For screen flows, the surface that
embeds it and what it takes in and hands back.

**Step 4. Map.** For each collection operation, choice list, screen
interaction, record update, timing need and integration, take the row from
the decision table. Read the example file for every element you will write,
and the domain reference for its limits. Read only the references for the
domains the task touches.

**Step 5. Write.** Metadata goes to
`force-app/main/default/flows/<ApiName>.flow-meta.xml` (adjust to the
project's package directory). Naming defaults: flow API names
`Object_Verb_Condition`, element names `Type_Purpose` (`Get_Open_Cases`,
`Filter_High_Priority`, `Transform_To_Tasks`, `Dec_Is_Renewal`), unless
org-conventions.md says otherwise. Set `<status>Draft</status>` unless the
user explicitly asks for an active flow or the activation-policy slot says so.
The examples are Active only because they were run. Keep all elements of one
type together in the file (split groups fail deployment). Without CLI access,
deliver a build spec in the format in [delivery.md](references/delivery.md).

**Step 6. Check.** Run the checker on every flow you wrote or were asked to
review. It needs only Node:

```bash
node <skill-dir>/scripts/check-flow.mjs --api <org-api-version> force-app/main/default/flows/<ApiName>.flow-meta.xml
```

ERRORs are legacy patterns or shapes the platform rejects, so fix them.
WARNINGs need a decision, which you state in the deliverable.

**Step 7. Validate.** With an authenticated org, name the org explicitly
instead of relying on the CLI's default org:

```bash
sf project deploy validate --source-dir force-app/main/default/flows/<ApiName>.flow-meta.xml --target-org <alias>
```

Fix against the exact error and re-run. XML that was not validated is labelled
unvalidated in the deliverable, plainly.

**Step 8. Review and deliver.** Run the review checklist in
[delivery.md](references/delivery.md). End the deliverable with this block,
every line filled in:

```
Mode: metadata | build spec
Checker: <command> → <n> errors, <n> warnings (<decision per warning>)
Deploy validation: <command and result> | not run, unvalidated (<reason>)
Status: Draft | Active (<why>)
Running context: <runInMode or default, and what that means for this flow type>
Escapes: <E-id and reason per loop or fallback> | none
Open decisions: <unset convention slots this flow depends on> | none
```

Running-context defaults (`runInMode` DefaultMode): record-triggered,
schedule-triggered and platform event-triggered flows run in system context without
sharing. Screen and autolaunched flows run in user context when launched from
the UI or REST API, and in the caller's context when called from Apex or
another flow. Autolaunched is not "system by default".

### Audits and migrations

For an existing flow, run the checker on it first, then inventory the
remaining legacy patterns against the decision table's last column. Deliver
the audit report defined in [delivery.md](references/delivery.md) before any
rewrite, ranked by impact: governor limits, then security context, then user
experience. Do not modify the flow unless asked. When asked, follow the
report's migration plan in order. Describe patterns, never the people who
built them, because most legacy patterns were the recommended approach when
written.
Process Builder and workflow rule mapping is in
[legacy-migration.md](references/legacy-migration.md).

## Decision table

"Org API" is the lowest org API version that has the element ([Flow, Metadata
API Developer Guide](https://developer.salesforce.com/docs/atlas.en-us.api_meta.meta/api_meta/meta_visual_workflow.htm)). Examples are in `examples/flows/`, deployed and run on API
67.0.

| Requirement | Use | Metadata | Org API | Example | Replaces |
| --- | --- | --- | --- | --- | --- |
| Keep the items of a collection that match criteria | Collection Filter (conditions or formula) | `collectionProcessors`, `FilterCollectionProcessor` | 53 | `Opportunity_Create_Followup_Tasks` | Loop + Decision + Assignment |
| Build records from a collection, reshape fields | Transform, Map | `transforms` | 59 | `Opportunity_Create_Followup_Tasks` | Loop + Assignment building a collection |
| Sum or count a collection | Transform, Sum / Count. In before-save flows, Filter + Assignment `AssignCount`, or a Loop for a Sum (E3) | `transforms`, `inputParameters` | 59 (primitive target 62) | `Opportunity_Create_Followup_Tasks`, `Account_Before_Save_Count_Contacts` | Loop counters |
| Combine two collections by a key | Transform, InnerJoin, with the mapping in the same Transform | `transforms`, `JoinDefinition` | 63 | `Opportunity_Create_Account_Tasks_Joined` | Nested loops, Get Records inside a loop |
| Order a collection | Collection Sort (sorts in place) | `SortCollectionProcessor` | 50 | `Opportunity_Allocate_Budget_Waterfall` | Manual sorting in a loop |
| Create, update or delete many records | One DML on the prepared collection | `recordCreates` `inputReference` | any | `Opportunity_Create_Followup_Tasks` | DML inside a loop |
| Options from records or a picklist | Record / picklist choice set | `dynamicChoiceSets` | any | `Account_Order_Entry_Screen` | Get Records + Loop building choices |
| Totals, visibility or text that follow input | Reactive formula, `visibilityRule` | `formulas`, screen fields | 59 (visibility on a formula: 68) | `Account_Order_Entry_Screen` | A second screen to recalculate |
| Input rules on a screen | Component `validationRule` | screen `fields` | any | `Account_Order_Entry_Screen` | Decision after the screen back to an error screen |
| Server logic without leaving the screen | Screen action + Action Button | `screens.actions`, `triggers` | 59 | `Account_Check_Pipeline_Screen` | Next, Get Records, back again |
| Set fields on the triggering record | Before-save flow, Assignment to `$Record` | `triggerType` `RecordBeforeSave` | any | `Opportunity_Before_Save_Set_Next_Step` | After-save Update Records on `$Record` |
| Block a save with a message | Custom Error | `customErrors` | 59 | `Opportunity_Before_Save_Set_Next_Step` | After-save compensation |
| Run only when relevant fields change | Entry conditions, `filterFormula` with `ISCHANGED`, "only when updated to meet the condition" | `start` | 55 (formula) | `Opportunity_Before_Save_Set_Next_Step`, `Opportunity_Closed_Won_Handover` | Decision as the first element |
| Callouts, emails, unrelated DML the user needn't wait for | Asynchronous path | `scheduledPaths` `AsyncAfterCommit` | 53 | `Opportunity_Closed_Won_Handover` | Everything synchronous |
| Work before or after a record date | Scheduled path | `scheduledPaths` `RecordField` | 51 | `Opportunity_Closed_Won_Handover` | Schedule-triggered flow polling for due records |
| React to a platform event | Platform event-triggered flow | `triggerType` `PlatformEvent` | 49 | `Order_Event_Create_Task` | Apex trigger written to start Flow logic |
| Pause until an event arrives | Wait element with a platform event | `waits` | any | `Order_Wait_For_Confirmation` | Polling |
| Flow logic for an Agentforce agent | Autolaunched flow with described inputs and outputs | `variables` `description` | any | `Case_Get_Status_For_Agent` | Invocable Apex wrapper |
| Order among flows on one object | Trigger Order | `triggerOrder` | 54 | `Opportunity_Closed_Won_Handover` | Relying on creation order |
| Call a REST API | HTTP Callout action | `actionCalls` (Builder-generated) | see integration reference | none | Apex written only for the callout |

Transform is not allowed in before-save flows (deploy error). Before-save
outranks Transform, so a value on the triggering record stays before-save,
and a Sum there is a Loop under E3, never an after-save Transform plus a
second save. Everything else above works in every flow type that has the
concept, and the domain references list the exceptions.

## Escape conditions

A legacy pattern is correct only when one of these holds. Declare it in a
Loop's `<description>` as `Escape: E<n> <reason>`, and in the deliverable.

| Id | Permits | Holds only when |
| --- | --- | --- |
| E1 | A Loop | Each item needs its own call to an action, subflow, or Apex plugin that accepts single values only. The loop body contains that call. |
| E2 | A Loop | An item's result depends on earlier items beyond a sum or count: a running balance, allocation, sequence number, round robin. |
| E3 | A Loop | A before-save flow needs a Sum (Transform is not allowed there). This is deliberate, because the in-memory Loop is cheaper than an after-save second save. Counts use Filter + `AssignCount` instead. |
| E4 | Work on the synchronous path | A later element in the same transaction reads the result, or the user must see it before the save completes. |
| E5 | No reactive or newer screen features | The named embedding surface does not support them: Salesforce Classic runtime, Slack (limited component set), or a component the reactive docs list as non-reactive. |
| E6 | Leaving a legacy pattern in place | Audit scope only: the flow is outside the change you were asked to make. Never applies to new or rewritten flows. |

These do not count as escape conditions:

- "I can't verify the element exists in this org" (rule 2 applies, so check
  the API version, then deploy-validate).
- "I'm not sure of the XML" (copy the example).
- "A loop is simpler or clearer."
- "Conditional values per item" (use `IF()` in a Transform formula).
- "Filter and map in one pass" (Filter, then Transform).
- "The surface might not support it" (name the surface or list it as an open
  decision, because an unknown surface is not E5).
- DML or Get Records inside a loop. No escape permits them.

Use the simplest sufficient element. That means Filter alone when only
filtering, static choices when the option list is fixed, and no
subflow for logic with one caller.

## Verify before asserting

- Currency: this skill was last reviewed against Winter '27 (API 68.0). On an
  org with a higher API version, the table can miss newer elements. Say so
  before calling a requirement unsupported, and check that release's notes.
- Availability: org API version against the table. Treat licence-gated
  features (Agentforce, Einstein, Data 360, some orchestration editions) as
  assumptions until the org confirms them, and say so.
- Limits and GA status that change a design or an audit finding: cite the
  official source (help.salesforce.com, developer.salesforce.com). Do not
  quote numbers from memory, because the domain references give the verified
  ones.

## Error handling

- CLI missing or org unreachable: deliver metadata labelled unvalidated, or a
  build spec, and say which.
- Validation fails: fix against the exact message, re-run the checker and the
  validation. The domain references list the deploy errors seen so far.
- Feature not in the org (API version, edition, licence): use the closest
  supported row of the table, name the gap and the escape.

## References

Read the ones the task needs:

- [org-conventions.md](references/org-conventions.md): the team's decisions, which outrank defaults.
- [collections.md](references/collections.md): Filter, Sort, Transform (map, sum, count, join), bulk DML, loops.
- [screens.md](references/screens.md): choice sets, reactive screens, validation, screen actions, embedding.
- [record-triggered.md](references/record-triggered.md): before-save and after-save, entry conditions, asynchronous and scheduled paths, custom errors, trigger order, platform events, waits, file triggers.
- [integration-and-security.md](references/integration-and-security.md): HTTP callouts, email, Get Records options, running context, fault paths, subflows, hard-coded IDs.
- [ai-and-agents.md](references/ai-and-agents.md): agent actions, Run Agent, AI decisions, prompt templates, Data 360, orchestration.
- [legacy-migration.md](references/legacy-migration.md): Process Builder and workflow rule mapping.
- [delivery.md](references/delivery.md): audit report, build spec, activation and deployment, Flow Tests, troubleshooting, review checklist.
- `examples/flows/*.flow-meta.xml`: one deployable flow per pattern, whose header comment names the pattern, what it replaces, and its shape rules. `examples/objects/` holds the platform event they use.
- `scripts/check-flow.mjs`: the checker (step 6).

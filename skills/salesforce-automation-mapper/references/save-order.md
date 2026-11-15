# The save order and the rules that settle it

## Contents

- The stages of a save
- Rule 1: order within a stage
- Rule 2: create, update or both
- Rule 3: what a re-run does
- Rule 4: which value is on the record at the end
- What the metadata doesn't settle

The blocks between `shared:` markers are copies from the
`salesforce-flow-modernizer` skill, which holds the source. Every platform
statement cites the page it comes from. Statements marked "observed" come
from debug logs of a deployed project on API 68.0 and aren't documented.

## The stages of a save

On an insert, update or upsert, Salesforce runs these steps in this order
([Triggers and Order of Execution](https://developer.salesforce.com/docs/platform/apex-dev/references/apex-dev/apex-triggers-order-of-execution.html),
Winter '27, API 68.0). The step numbers are the page's.

| Step | What runs | Stage name in the map |
| --- | --- | --- |
| 3 | Record-triggered flows that run before the save | before-save |
| 4 | All before triggers | Apex trigger (before) |
| 5 | System validation again, and custom validation rules | not in the map |
| 6 | Duplicate rules. A blocking duplicate rule stops the save here | not in the map |
| 7 | The record is saved, not committed | |
| 8 | All after triggers | Apex trigger (after) |
| 9, 10 | Assignment rules, auto-response rules | not in the map |
| 11 | Workflow rules, and their field updates (rule 3) | workflow |
| 12 | Escalation rules | not in the map |
| 13 | Processes built with Process Builder, and flows launched by workflow rules, in no guaranteed order | process |
| 14 | Record-triggered flows that run after the save | after-save |
| 15 to 18 | Entitlement rules, roll-up summaries in the parent and grandparent, criteria-based sharing | not in the map |
| 19 | Commit | |
| 20 | Post-commit logic, in no particular order: email, queued asynchronous Apex, asynchronous paths of record-triggered flows | after commit |

When a process or flow runs DML, the affected record goes through the save
procedure. Scheduled paths, schedule-triggered flows and platform
event-triggered flows run in transactions of their own, outside this save.

## Rule 1: order within a stage

<!-- shared:trigger-order -->
`triggerOrder` 1–2000 (org API 54, [Flow](https://developer.salesforce.com/docs/atlas.en-us.api_meta.meta/api_meta/meta_visual_workflow.htm)). Among the flows on
one object with the same trigger, before-save or after-save, flows 1–1000
run first in ascending order. Flows with the same value run in alphabetical
order of their API names. Flows without an order run next, in the order of
their activation dates, then flows 1001–2000 in ascending order, with the
same tie-break. The order never moves a flow out of its stage: an after-save
flow can't run before a before-save flow or an Apex trigger, whatever its
value. It has no direct effect on asynchronous or scheduled paths
([Define the Run Order of Record-Triggered Flows for an Object](https://help.salesforce.com/s/articleView?id=platform.flow_task_trigger_run_order.htm&type=5)).
<!-- /shared:trigger-order -->

Trigger order covers flows only. For Apex triggers, more than one trigger on
the same object for the same event runs in no guaranteed order
([Triggers and Order of Execution](https://developer.salesforce.com/docs/platform/apex-dev/references/apex-dev/apex-triggers-order-of-execution.html)).
Processes run in no guaranteed order among themselves (step 13). The pages
read don't give an order among the workflow rules on one object, so state
none.

Observed: flows with trigger order 10, 10, none and 1500 ran in that order,
with the two 10s in alphabetical order of their API names. After-save flows
ran after the workflow field updates and the process, and an after-save flow
with order 20 ran before one without an order.

## Rule 2: create, update or both

<!-- shared:trigger-event -->
A flow's `recordTriggerType` is `Create`, `Update`, `CreateAndUpdate` or
`Delete`. With entry conditions on an update, "Every time a record is
updated and meets the condition requirements" runs the flow on every update
after which the record meets them. "Only when a record is updated to meet the
condition requirements" (`doesRequireRecordChangedToMeetCriteria`) runs it
only when the record didn't meet them before the update and does after. A
create counts as such a change, because Salesforce treats a new record's
before state as meeting none of the conditions. So a create and update flow
with that setting also runs on a create that already meets them
([How Entry Conditions Work in Record-Triggered Flows](https://help.salesforce.com/s/articleView?id=platform.automate_flow_build_working_with_conditions_record_triggered_flows.htm&type=5)).
<!-- /shared:trigger-event -->

<!-- shared:workflow-criteria -->
A workflow rule's evaluation criteria (`triggerType` in the Workflow
metadata) decide which saves evaluate it
([Set the Criteria for Your Workflow Rule](https://help.salesforce.com/s/articleView?id=platform.workflow_rules_define.htm&type=5),
[Workflow](https://developer.salesforce.com/docs/platform/api-metadata/references/meta-types/metadata-workflow.html)):

- `onCreateOnly`, "created": every create, never an update. The rule runs
  at most once per record.
- `onAllChanges`, "created, and every time it's edited": every create and
  every update after which the record meets the criteria. Such a rule can't
  have time-dependent actions.
- `onCreateOrTriggeringUpdate`, "created, and any time it's edited to
  subsequently meet criteria", the default: a create that meets the
  criteria, and an update only when the record changes from not meeting
  them to meeting them.
<!-- /shared:workflow-criteria -->

<!-- shared:process-start -->
A record-change process starts "only when a record is created" or "when a
record is created or edited"
([Configure the Process Trigger](https://help.salesforce.com/s/articleView?id=platform.process_start.htm&type=5)).
Its metadata holds the choice in the `TriggerType` process metadata value,
`onAllChanges` for created or edited, as a deployed process showed. Not
verified: `onCreateOnly` for created only.
On created or edited, each criteria node can set "Do you want to execute
the actions only when specified changes are made to the record?". With it,
the actions run on a create and on an update after which the record meets
the conditions while its previous values didn't. Without it, they run on
every update after which the record meets them
([Avoid Unwanted Actions in Processes](https://help.salesforce.com/s/articleView?id=platform.process_advanced_previously_met.htm&type=5)).
Processes run after workflow rules, together with flows launched by
workflow rules, in no guaranteed order among themselves
([Triggers and Order of Execution](https://developer.salesforce.com/docs/platform/apex-dev/references/apex-dev/apex-triggers-order-of-execution.html)).
With the advanced option "Allow process to evaluate a record multiple times
in a single save operation", a process can evaluate the same record up to
five more times when a process, workflow rule or flow updates it in that
save
([Configure the Process Trigger](https://help.salesforce.com/s/articleView?id=platform.process_start.htm&type=5)).
<!-- /shared:process-start -->

An Apex trigger runs on the events in its header: `before insert`,
`before update`, `before delete`, `after insert`, `after update`,
`after delete` and `after undelete`
([Defining Triggers](https://developer.salesforce.com/docs/platform/apex-dev/references/apex-dev/apex-triggers-defining.html)).
A trigger's `update` events also fire on the extra saves in rule 3, even
when the user's save was a create.

## Rule 3: what a re-run does

<!-- shared:workflow-rerun -->
Workflow rules run after the after triggers. When their field updates
change the record, Salesforce updates it again and runs the before update
and after update triggers one more time, on a create too. Custom validation
rules, flows, duplicate rules, processes and escalation rules don't run
again
([Triggers and Order of Execution](https://developer.salesforce.com/docs/platform/apex-dev/references/apex-dev/apex-triggers-order-of-execution.html)).
A field update with "Re-evaluate Workflow Rules After Field Change"
(`reevaluateOnChange`) that changes the field's value makes Salesforce
evaluate the object's workflow rules again. Only rules that haven't fired
yet in the save can fire, only rules on the same object, and the cascade
stops after five rounds
([Field Updates That Reevaluate Workflow Rules](https://help.salesforce.com/s/articleView?id=platform.workflow_field_updates_reevalute_wf.htm&type=5)).
In a debug log on API 68.0, a round of re-evaluation whose field update
changed the record ran the before and after update triggers again, so the
triggers can run once per round, not only once.
<!-- /shared:workflow-rerun -->

<!-- shared:after-save-rerun -->
An after-save Update Records on the triggering record saves the record
again in the same transaction, and so does a process's update of the record
that started it. In that recursive save Salesforce skips steps 9 to 17 of
the order of execution, from assignment rules to the grandparent's roll-up
summaries, so workflow rules, processes and after-save flows don't run again
([Triggers and Order of Execution](https://developer.salesforce.com/docs/platform/apex-dev/references/apex-dev/apex-triggers-order-of-execution.html)).
Before and after update triggers and duplicate rules do run again. The page
lists before-save flows among the steps that run, but in a debug log on API
68.0 they didn't run again in the recursive save. Treat that as observed,
not documented. Not verified: whether a process set to "Allow process to
evaluate a record multiple times in a single save operation" evaluates the
record again in that recursive save, as that option's page says it can when
a process updates the record. A second DML statement on the record from
Apex is a new save, not a recursive one, and runs everything again.
<!-- /shared:after-save-rerun -->

Observed on a create that met a workflow rule, a process and a create-only
after-save flow that each update the record: the before-save flows ran
once. The before and after update triggers ran once for the workflow field
update, once for the process's update, once for the re-evaluated rule's
field update, and once for the after-save flow's update. The re-evaluated
workflow rule ran after the process.

## Rule 4: which value is on the record at the end

The pages above give the order. They don't state who wins a field, so derive
it from the order and say that you did.

- **Same save.** The value at the end is the one written last in the
  sequence of rules 1 and 3. A before-save flow writes first. An Apex before
  trigger runs after every before-save flow, and again on every extra save
  in rule 3, so a trigger that writes the field each time wins over the
  flows, the workflow field updates, the processes and the after-save flows.
  A workflow field update comes after the before-save flows, a process's
  update after the workflow, and an after-save flow's update after both. A
  workflow rule that fires on re-evaluation (rule 3) is the exception: in
  the debug log above it ran after the process, so its field update wins
  over the process's. Treat that as observed.
- **Not again in the same save.** Before-save flows, processes and
  after-save flows don't run in the extra saves of rule 3, and a workflow
  rule runs again only when a field update re-evaluates the rules and it
  hasn't fired yet in the save. So apart from such a rule, none of them
  overwrites a value that a later step wrote in the same save.
- **A later save.** Automation that runs on every save writes again on the
  next one: a before-save flow without "only when updated to meet", an Apex
  trigger, an `onAllChanges` workflow rule, a process node without "only
  when specified changes". Automation that runs only when the record changes
  into its criteria doesn't. So a value from a workflow rule set to
  `onCreateOrTriggeringUpdate` can be on the record at the end of one save
  and replaced by a before-save flow's value on the next unrelated edit.
- **After the commit.** An asynchronous path runs after the commit (step
  20), and a scheduled path later still, each as a new save. Their values
  replace the save's values and start a new save order.

Observed: a before-save flow set Rating to Warm, a workflow field update to
Hot, and a create-only after-save flow to Cold. On a create, the record
ended with Cold. On an update into the workflow rule's criteria, it ended
with Hot. On the next unrelated edit, the workflow rule didn't run and the
record ended with Warm.

## What the metadata doesn't settle

- The order of flows without a trigger order: activation dates aren't in
  the metadata. Flow Trigger Explorer in Setup shows the order an org runs
  its record-triggered flows in, for an object and a trigger
  ([Manage Record-Triggered Flows](https://help.salesforce.com/s/articleView?id=platform.flow_trigger_explorer.htm&type=5)).
  It doesn't show Apex triggers, workflow rules or processes.
- The order of two Apex triggers on the same event, of two processes, or of
  two workflow rules.
- What Apex classes called from a trigger write. The script names the
  classes and reads only the trigger body.
- Whether a process allows re-evaluating a record up to five more times. The
  script doesn't read that option, so check it in Setup when a process
  updates the record.
- Validation rules, duplicate rules, assignment, auto-response and
  escalation rules, entitlements and roll-up summaries. The script doesn't
  read them.

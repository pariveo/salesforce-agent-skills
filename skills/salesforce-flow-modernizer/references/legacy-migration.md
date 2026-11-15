# Workflow rules and Process Builder

Creating new workflow rules was blocked in Winter '23 (late 2022,
[release note](https://help.salesforce.com/s/articleView?id=release-notes.rn_automate_flow_mgmt_block_workflow_rules.htm&release=240&type=5))
and new processes in Summer '23
([release note](https://help.salesforce.com/s/articleView?id=release-notes.rn_automate_flow_mgmt_block_process_builder.htm&release=244&type=5)),
although developer orgs still allow both for managed packages. Support and
bug fixes ended on 31 December 2025
([End of Support](https://help.salesforce.com/s/articleView?id=001096524&type=1)). Existing
automations keep running and can be edited, so migration is a planned
change, not an outage. Salesforce's Migrate to Flow tool in Setup converts
many of them. Review its output with this skill's checker and decision table
like any other flow.

| Legacy feature | Current pattern | Reference |
| --- | --- | --- |
| Workflow field update on the same record | Before-save record-triggered flow | record-triggered.md |
| Workflow time-dependent action | Scheduled path on an after-save flow | record-triggered.md |
| Workflow email alert | Send Email action with a template, on the asynchronous path | integration-and-security.md |
| Workflow outbound message | HTTP Callout action on the asynchronous path, or a platform event | integration-and-security.md, record-triggered.md |
| Process Builder immediate record actions | After-save flow (same-record updates move to before-save) | record-triggered.md |
| Process Builder scheduled actions | Scheduled path | record-triggered.md |
| Process Builder invoking another process | Subflow, only when the logic is reused | integration-and-security.md |
| Process Builder on a platform event | Platform event-triggered flow | record-triggered.md |
| Several processes on one object | One flow per concern, entry conditions, explicit Trigger Order | record-triggered.md |

Migration order in an audit's plan: same-record field updates first (they
remove a second save), then anything that queries or updates inside
iterations, then timing, then the rest. Each step ships inactive or inside a
maintenance window, and the old automation is deactivated in the same
release as its replacement is activated, never before.

## How they run

A migration keeps the old automation's behaviour only where these match the
new flow's trigger event and entry conditions.

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

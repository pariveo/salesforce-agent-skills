# Record-triggered flows, events and waits

## Contents

- Trigger event: create, update, or both
- Before-save or after-save
- Entry conditions and change detection
- Asynchronous path
- Scheduled paths
- Custom Error
- Several flows on one object
- Platform event-triggered flows
- Wait elements
- File triggers
- Deploy errors seen

Examples: `Opportunity_Before_Save_Set_Next_Step`,
`Account_Before_Save_Count_Contacts`, `Opportunity_Closed_Won_Handover`,
`Order_Event_Create_Task`, `Order_Wait_For_Confirmation`.

## Trigger event: create, update, or both

Decide `recordTriggerType` from the requirement before opening an example.
An example's trigger event fits that example's job and says nothing about
yours.

- Create and update with "only when a record is updated to meet the
  condition requirements" (`doesRequireRecordChangedToMeetCriteria`) also
  runs on a create that already meets the conditions. Salesforce treats a
  new record's before state as meeting none of them ([How Entry Conditions
  Work in Record-Triggered Flows](https://help.salesforce.com/s/articleView?id=platform.automate_flow_build_working_with_conditions_record_triggered_flows.htm&type=5)).
- Use the Update trigger only when only a change into the condition counts, and a
  record created already meeting it must not run the flow.
- Use the Create and update trigger when a record that starts out meeting the
  condition needs the same work (`Opportunity_Closed_Won_Handover`: a deal
  entered as already won still needs a handover).
- When the requirement does not say which, ask. If you cannot ask, pick one,
  state the assumption in the deliverable, and list it under open decisions.

## Before-save or after-save

| Need | Use |
| --- | --- |
| Set fields on the triggering record | Before-save: Assignment to `$Record.<Field>`, with no DML and no second save |
| Block the save | Custom Error, before- or after-save |
| Related records, actions, callouts, emails, subflows | After-save (callouts on the asynchronous path) |

Before-save flows accept Assignment, Decision, Get Records, Loop, Collection
Filter, Collection Sort (both verified) and Custom Error. They reject
Transform (deploy error), actions, subflows and DML.

Before-save outranks Transform. When a value on the triggering record is a
sum over a collection, keep the flow before-save and sum in a Loop declared
`Escape: E3`, and count with Filter + `AssignCount`. Do not move the work to
after-save to use a Transform, because the Loop without DML or queries costs
CPU in memory, while the second save re-runs the whole save order. Salesforce names
before-save flows for same-record field updates as the largest performance
gain in record-triggered automation ([Record-Triggered Automation decision
guide](https://architect.salesforce.com/docs/architect/decision-guides/guide/record-triggered)).

On create, `$Record.Id` is null in a before-save flow. A Get Records filtered
on `<Lookup> = $Record.Id` then matches every record whose lookup is empty.
Query children only on update, or branch on `ISNEW()` first.

An after-save Update Records on the triggering record runs the whole save
order again: before-save flows, before triggers, validation, after triggers,
after-save flows. The checker flags it (FLOW005). When it is unavoidable
(for example a value only known after save, such as the record's own Id or
an autonumber), gate it with change detection so the second pass does
nothing. Needing a Transform is not that case (see above).

## Entry conditions and change detection

Entry conditions run before any interview starts, while a Decision as the
first element runs in every interview. Options on `start`:

- `filters` + `filterLogic`: field conditions.
- `filterFormula` (org API 55+): a formula, in which `ISNEW()`, `ISCHANGED()`
  and `PRIORVALUE()` work, using `{!$Record.Field}`.
- `doesRequireRecordChangedToMeetCriteria` true: "only when a record is
  updated to meet the condition requirements", which runs the flow when the
  record did not meet the conditions before and does now.

None of these work in delete-triggered flows. Inside the flow, compare
`$Record` with `$Record__Prior`.

## Asynchronous path

A `scheduledPaths` entry with `pathType` `AsyncAfterCommit` (org API 53).
It runs after the transaction commits, in its own transaction, under
asynchronous Apex limits.

- After-save flows only. The flow must trigger on create, or on update with
  "only when updated to meet the condition requirements" or Is Changed.
- The asynchronous path element has only `name`, `connector` and `pathType`. A
  `label`, offset, time source or batch size fails deployment.
- One per flow (deploy error for a second one).
- `ISCHANGED` is not available on the asynchronous path.
- Results are not available to the synchronous path, so if a later
  synchronous element needs them, the work stays synchronous (escape E4).

## Scheduled paths

A `scheduledPaths` entry with `timeSource` `RecordField` + `recordField`, or
`RecordTriggerEvent`, and `offsetNumber` + `offsetUnit` (Minutes, Hours, Days,
Months from org API 56). Negative offsets run before the date.
`maxBatchSize` 1–200, default 200 ([Scheduled Paths](https://help.salesforce.com/s/articleView?id=platform.flow_concepts_trigger_scheduled_path.htm&type=5)).

- After-save flows only. Update-triggered flows need "only when updated to
  meet the condition requirements".
- `$Record__Prior` is not available on scheduled paths.
- Org limit: 250,000 scheduled-path interviews per 24 hours, or 200 per user
  licence, whichever is greater ([Scheduled Paths](https://help.salesforce.com/s/articleView?id=platform.flow_concepts_trigger_scheduled_path.htm&type=5)).
- A failed path is retried up to 5 times ([Scheduled Paths](https://help.salesforce.com/s/articleView?id=platform.flow_concepts_trigger_scheduled_path.htm&type=5)). Pending work shows on the
  Time-Based Automation page in Setup.
- No documented maximum number of scheduled paths per flow (21 deployed on a
  draft, not tested on activation).

## Custom Error

`customErrors` with `customErrorMessages` (`errorMessage` up to 255
characters
([Custom Error Element](https://help.salesforce.com/s/articleView?id=platform.flow_ref_elements_custom_error.htm&type=5)), `isFieldError`, `fieldSelection`). Available in the before-save
and after-save paths of record-triggered flows only, not on asynchronous or
scheduled paths or in other flow types. It rolls back the triggering change,
like `addError()`. It allows one page-level message per element and one
inline error per field, and compound fields are not supported. It handles conditions validation
rules cannot reach (related records, formulas over queried data).

## Several flows on one object

`triggerOrder` 1–2000 (org API 54, [Flow](https://developer.salesforce.com/docs/atlas.en-us.api_meta.meta/api_meta/meta_visual_workflow.htm)). Flows 1–1000 run first in
ascending order (ties by API name), then flows without an order by
activation date, then 1001–2000. It applies separately to before-save and
after-save flows. It cannot move a flow ahead of an Apex trigger, and has no
direct effect on asynchronous or scheduled paths
([Define the Run Order of Record-Triggered Flows](https://help.salesforce.com/s/articleView?id=platform.flow_task_trigger_run_order.htm&type=5)). When flow B needs flow A's result,
merging them or passing state explicitly is still the stronger design.

## Platform event-triggered flows

An autolaunched flow whose `start` has `triggerType` `PlatformEvent` and
`object` the event API name, with the event's fields on `$Record`. It is not
a record-triggered flow.

- Runs asynchronously in its own transaction, in batches of up to 200
  events, in replay ID order. There is no guaranteed order across different
  subscribers of the same event.
- Runs as the user who published the event (debug logs show the Automated
  Process user)
  ([Subscribe to Platform Event Messages with Flows](https://developer.salesforce.com/docs/platform/platform-events/guide/platform-events-subscribe-flow.html)).
  `flowRunAsUser` `DefaultWorkflowUser` (org API 60, [Flow](https://developer.salesforce.com/docs/atlas.en-us.api_meta.meta/api_meta/meta_visual_workflow.htm)) switches
  it to the default workflow user, or to the Automated Process user when none
  is set ([Start Element](https://help.salesforce.com/s/articleView?id=platform.flow_ref_elements_start.htm&type=5)).
- Cannot call subflows.

## Wait elements

`waits` pause an autolaunched flow (or an orchestration) until an event,
then resume it. Screen flows and record-triggered flows cannot use them, and
record-triggered flows use scheduled paths instead. Flow Builder offers Wait
for Conditions, Wait Until Date, and Wait for Amount of Time, which are all
`waits` in metadata.

To resume on a platform event (`Order_Wait_For_Confirmation`):

- `waitEvents.eventType` is the event API name.
- The resume filter is `inputParameters`, where `name` is the event field and
  `value` what it must equal. `conditions` fail here. A bare field name,
  `$Record.X`, and `Event__e.X` are all rejected.
- `outputParameters` named after the event assign the received message to a
  record variable of the event type.

The Metadata API reference lists only `AlarmEvent` and `DateRefAlarmEvent`
for `eventType`, but the platform-event form above was verified by deploy
and run.

## File triggers

- File Attach automation events (Winter '26, GA) start Automation
  Event-Triggered Flows. The release note lists Professional with API access,
  Enterprise, Performance and Unlimited
  ([release note](https://help.salesforce.com/s/articleView?id=release-notes.rn_automate_flow_mfi_automate_flows_with_file_attachments.htm&release=258&type=5)),
  while the Automation Event Library needs Marketing Cloud Growth or
  Advanced, or a Data 360 edition, and Data Cloud permissions
  ([Automation Event Library](https://help.salesforce.com/s/articleView?id=platform.automate_flow_ref_event_library.htm&type=5)).
  Check the org's edition and permissions before designing around it.
- Record-triggered flows on ContentDocument and ContentVersion arrived as a
  Beta in Spring '26
  ([release note](https://help.salesforce.com/s/articleView?id=release-notes.rn_experiences_files_flow_trigger.htm&release=260&type=5)),
  and no later release note makes them GA. Treat them as beta unless the
  org's release notes say otherwise.
- Not verified: the contents of the File Attach `$Event` global, and whether
  ContentDocumentLink can be a trigger object. Check the org before
  designing around either.

## Deploy errors seen

| Message (abridged) | Cause | Fix |
| --- | --- | --- |
| Label, TimeSource, OffsetUnit, OffsetNumber, RecordField, MaxBatchSize cannot be set for ScheduledPath of PathType … | Extra fields on the asynchronous path | Keep only name, connector, pathType |
| You can have only one FlowScheduledPath of pathType AsyncAfterCommit in a flow | Two asynchronous paths | Merge them |
| The "Field__c" element doesn't exist. Remove references to the element in all conditions | Platform-event wait written with `conditions` | Use `inputParameters` |
| This flow can't reference $Record because its trigger type is null | `$Record` in an untriggered flow's wait | Use `inputParameters` |

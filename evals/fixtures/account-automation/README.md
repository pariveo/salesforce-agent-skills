# Account automation fixture

A small sfdx project for the `salesforce-automation-mapper` evals and for the
smoke test's run of `map-automation.mjs`. It puts one of each kind of
automation on Account, built from the order rules in
`skills/salesforce-automation-mapper/references/save-order.md`:

| Item | Kind | Runs on | Writes |
| --- | --- | --- | --- |
| `Account_Before_Tag_A` | before-save flow, trigger order 10 | create and update | Description (appends `\|FA`), Rating = Warm |
| `Account_Before_Tag_B` | before-save flow, trigger order 10 | create and update | Description (appends `\|FB`) |
| `Account_Before_Tag_Unordered` | before-save flow, no trigger order | create and update | Description (appends `\|FU`) |
| `Account_Before_Tag_Late` | before-save flow, trigger order 1500 | create and update | Description (appends `\|FL`), Type = Prospect |
| `AccountTrigger` | Apex trigger | before and after insert and update | Description (appends `\|TI` or `\|TU` before save) |
| `Account_Hot_Rating` | workflow rule, `onCreateOrTriggeringUpdate` | AnnualRevenue above 1,000,000 | Rating = Hot, re-evaluates workflow rules |
| `Account_Flag_Hot` | workflow rule, `onAllChanges` | Rating is Hot | Site = Flagged |
| `Account_Process_Banking` | process, created or edited, only when specified changes | Industry is Banking | Type = Customer - Channel |
| `Account_After_Create_Set_Rating` | after-save flow, trigger order 20 | create | Rating = Cold, through an update of the record |
| `Account_After_Revenue_Reached` | after-save flow, no trigger order | update, only when updated to meet AnnualRevenue above 1,000,000 | a Task |
| `Account_After_Audit` | after-save flow, no trigger order | create and update | nothing |
| `Account_Daily_Review` | schedule-triggered flow, Draft | daily | NumberOfEmployees = 0 |

The Description tags make the run order visible on the record itself.

## Deploy result

Deployed on 2026-11-15 to a Developer Edition scratch org on API 68.0
(Winter '27), and the saves below ran there. A check-only deploy of the
files as committed then reported 15 of 15 components, 0 errors:

```bash
sf project deploy start --source-dir force-app --target-org <scratch-org-alias> --dry-run --test-level NoTestRun
```

The Metadata API still accepts a new workflow rule and a new process
(`processType` `Workflow`) in a scratch org, although Setup no longer
creates either.

## What the debug logs showed

The saves ran as anonymous Apex, with a trace flag at Workflow FINER and Apex
Code FINE. The sequences below are the `FLOW_START_INTERVIEW_BEGIN`,
`WF_CRITERIA_*`, `WF_FIELD_UPDATE` and trigger `CODE_UNIT_STARTED` lines, in
log order.

**Create** with AnnualRevenue 2,000,000 and Industry Banking. The record
ended with Description `|FA|FB|FU|FL|TI|TU|TU|TU|TU`, Rating Cold, Type
Customer - Channel, Site Flagged.

1. Before-save flows: `Account_Before_Tag_A`, `Account_Before_Tag_B`,
   `Account_Before_Tag_Unordered`, `Account_Before_Tag_Late`.
2. Before insert trigger, duplicate rules, after insert trigger (Rating
   Warm, Type Prospect).
3. Workflow evaluation: `Account_Flag_Hot` false, `Account_Hot_Rating` true,
   the process's criteria true. Field update Rating = Hot, then before and
   after update triggers.
4. The process: `myVariable_old` empty, so the "previously met" check
   passed, and it updated Type. Before update trigger, duplicate rules,
   after update trigger. No flow ran.
5. Workflow re-evaluation, round 1: `Account_Flag_Hot` true, field update
   Site = Flagged, then before and after update triggers.
6. After-save flows: `Account_After_Create_Set_Rating` (order 20), whose
   update of Rating to Cold ran the before update trigger, duplicate rules
   and the after update trigger, and no flow, workflow rule or process. Then
   `Account_After_Audit`.

**Update** of an account created with AnnualRevenue 10, to 2,000,000.
Rating ended Hot, Site Flagged, and the task was created.

1. Before-save flows in the same order as on create. Before and after
   update triggers.
2. `Account_Hot_Rating` true, field update Rating = Hot, triggers again. The
   process's criteria false.
3. Re-evaluation: `Account_Flag_Hot` true, Site = Flagged, triggers again.
4. After-save flows: `Account_After_Audit`, then
   `Account_After_Revenue_Reached`. Both have no trigger order, so their
   order comes from activation dates, which the files don't hold.

**A later edit** of that account's Phone only. Rating ended Warm.
`Account_Hot_Rating` was skipped (`WF_RULE_NOT_EVALUATED`, it had already
met its criteria), `Account_Flag_Hot` was false, and
`Account_After_Revenue_Reached` didn't run.

**Two DML statements in one transaction**, an insert and then an update of
the same account from Apex. The update ran the before-save flows, the
workflow rules, the process and the after-save flows again: a second DML
statement is a new save, not a recursive one.

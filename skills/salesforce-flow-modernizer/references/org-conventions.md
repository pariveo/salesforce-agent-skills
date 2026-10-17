# Org conventions

The skill knows the platform but not this org. This file holds the
decisions that differ from one org to the next, and the skill reads it before
every task (SKILL.md, workflow step 1).

A filled-in slot outranks the skill's default. An empty slot means the
default applies and the deliverable names the decision as still open. Fill
slots in as the team settles them, one commit at a time, so the history shows
when and why each call was made.

## Naming

Flow API names and element names follow the skill's default
(`Object_Verb_Condition`, `Type_Purpose`) unless set here.

- Flow API name pattern: _unset_
- Element name pattern: _unset_
- Prefix or suffix for flows owned by a team or package: _unset_

## Running-user context

Which flows run in system context, which enforce the running user's
permissions, and who signs off on a system-context flow that touches
sensitive data.

- Default context for autolaunched and record-triggered flows: _unset_
- Objects or fields that always require user-context enforcement: _unset_
- Sign-off required for system-context flows: _unset_

## Shared subflows

Logic that already exists as a subflow in this org, so new flows call it
instead of rebuilding it.

| Subflow API name | Purpose | Inputs | Outputs |
| ---------------- | ------- | ------ | ------- |
| _none recorded_  |         |        |         |

## Fault handling

What a fault path ends in, per flow type, such as a logged record, a
platform event, a custom notification or an email to a monitored inbox.

- Screen flows: _unset_
- Record-triggered and autolaunched flows: _unset_
- Logging object or platform event, if any: _unset_

## Order and coexistence on shared objects

Objects where several record-triggered flows already run, and the trigger
order the team has assigned.

| Object | Flows and their Trigger Order | Apex triggers on the same object |
| ------ | ----------------------------- | -------------------------------- |
| _none recorded_ |                      |                                  |

## Deployment gate

What has to be true before Flow metadata goes anywhere near production.

- Target for deploy validation: _unset_ (sandbox alias or scratch org)
- Org API version the flows target: _unset_ (otherwise read from the org or sfdx-project.json)
- Flow Tests required for: _unset_
- Activation policy: _unset_ (ship inactive, or deploy as active)
- Who reviews a migration plan before step one runs: _unset_

## Where Flow stops

Work this org has decided to keep in Apex, or out of automation entirely, so
the skill does not propose a Flow for it.

- _unset_

## Pre-approved escapes

Situations this org has already decided justify a legacy pattern (a loop, a
synchronous callout, a non-reactive screen), with the escape id from SKILL.md
and the reason. The skill still declares the escape in the flow.

- _unset_

## Vocabulary

Terms the team uses that the skill should use back, such as a record type
the business calls something else, or a status the org spells its own way.

| Platform term | Team term |
| ------------- | --------- |
| _none recorded_ |         |

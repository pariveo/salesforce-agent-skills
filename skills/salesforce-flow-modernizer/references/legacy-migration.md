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

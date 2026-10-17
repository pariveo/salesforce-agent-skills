# Integration, data access, security, faults, subflows

## Contents

- HTTP Callout action
- Email
- Get Records
- No hard-coded IDs
- Running context
- Fault paths
- Subflows

## HTTP Callout action

Calls a REST API declaratively. Flow Builder generates the action from an
External Credential with its Named Credential and a sample JSON request and
response, and creates an External Service registration with typed inputs
and outputs. The flow then calls it as an action.

- Methods: GET, POST, PUT, PATCH, DELETE. Creating one needs the Customize
  Application permission
  ([Configure an HTTP Callout Action](https://help.salesforce.com/s/articleView?id=platform.flow_http_callout_configure.htm&type=5)).
- Available in Enterprise, Performance, Unlimited and Developer editions,
  the editions of External Services that it runs on
  ([Manage External Services](https://help.salesforce.com/s/articleView?id=platform.external_services_view_edit.htm&type=5)).
- Headers cannot be set per request, so put them in the credential.
- JSON can nest up to 15 levels. Enum, float and long types are not
  supported, and lists must hold one data type.
- Status codes of 300 and above arrive as faults, so give the action a fault
  path ([HTTP Callout Considerations and Limits](https://help.salesforce.com/s/articleView?id=platform.flow_http_callout_considerations.htm&type=5)).
- Because record-triggered flows cannot call out while the record saves, put
  the action on the asynchronous path.
- Page by calling again with the next token, because no pagination support
  is documented.

There is no metadata example because the action depends on the generated
External Service registration. Create the action in Flow Builder once,
retrieve the flow and the `ExternalServiceRegistration`, and keep both in
source control. For APIs with an OpenAPI schema, register them as an External
Service directly.

## Email

Send Email action with a Text Template or an email template:

- Template by ID (needs a Recipient ID) since Summer '23
  ([release note](https://help.salesforce.com/s/articleView?id=release-notes.rn_automate_flow_builder_use_email_templates_in_the_send_email_action.htm&release=244&type=5)),
  and by template name since Summer '26 with action version 3.0.1
  ([release note](https://help.salesforce.com/s/articleView?id=release-notes.rn_automate_flow_builder_persist_email_template_references_across_environments.htm&release=262&type=5)).
  The template name survives deployment between environments, where IDs do
  not ([Send Email Action](https://help.salesforce.com/s/articleView?id=platform.flow_ref_elements_actions_sendemail.htm&type=5)).
- Log Email on Send records it on the activity timeline.
- Using a template, logging or attachments switches the send to the single
  email limit.
- Wording lives in the template or a Text Template, not concatenated in
  formulas.
- In record-triggered flows, send from the asynchronous path unless the
  user must know it was sent before the save completes (escape E4).

## Get Records

- List the fields the flow uses in `queriedFields`. Storing all fields is the
  legacy default (checker FLOW008).
- `getFirstRecordOnly` true returns one record or null, and false returns a
  collection, possibly empty. Handle both empty cases explicitly (the agent
  example's Decision on `IsNull`). An empty result is not a fault.
- `limit` (Spring '25, org API 63+) takes a value from 2 to 20,000 records
  ([Get Records Element](https://help.salesforce.com/s/articleView?id=platform.flow_ref_elements_data_get.htm&type=5),
  [release note](https://help.salesforce.com/s/articleView?id=release-notes.rn_automate_flow_builder_enhance_flow_performance_by_controlling_the_number_of_records_retrieved_with_get_records.htm&release=254&type=5)).
- Related records in one Get Records element (`relatedRecords`, Beta since
  Summer '25, nested loops over all levels since Winter '26, still Beta) work
  in autolaunched flows only
  ([Summer '25](https://help.salesforce.com/s/articleView?id=release-notes.rn_automate_flow_builder_get_related_records.htm&release=256&type=5),
  [Winter '26](https://help.salesforce.com/s/articleView?id=release-notes.rn_automate_flow_builder_get_related_records_nested_loops.htm&release=258&type=5)). Because the feature is Beta, prefer a second Get
  Records plus a Transform join where the design must be GA.
- Records created by Create Records are available to later elements directly
  (Winter '26), so no follow-up Get Records by ID is needed.

## No hard-coded IDs

Record type, profile, queue, user and template IDs differ per environment.
Use a Get Records by `DeveloperName`, custom metadata, custom labels, or the
template name. The checker flags ID-shaped strings (FLOW010).

## Running context

`runInMode` on the flow:

| Value | Behaviour |
| --- | --- |
| `DefaultMode` | Depends on how the flow is launched (below) |
| `SystemModeWithSharing` | Respects sharing but ignores object and field permissions |
| `SystemModeWithoutSharing` | Accesses all data |
| `UserMode` (org API 68+) | Enforces the running user's permissions and does not inherit elevation from a system-context caller, for screen and autolaunched flows |

By default, record-triggered, schedule-triggered and platform event-triggered
flows run in system context without sharing. Screen flows and autolaunched
flows run in user context when launched from buttons, links, Lightning
pages, Experience Cloud or the REST API. When Apex launches them, the calling
code decides. A user-context flow called from a system-context flow inherits
system context. `UserMode` prevents that, for flows on API 68.0 or later
([Flow](https://developer.salesforce.com/docs/atlas.en-us.api_meta.meta/api_meta/meta_visual_workflow.htm), [Winter '27 release note](https://help.salesforce.com/s/articleView?id=release-notes.rn_automate_flow_builder_user_context_264.htm&release=264&type=5)).

Choose the context deliberately, record it in the build spec, and follow the
running-user slot in org-conventions.md. A flow that exposes or changes
records the running user cannot see is a security finding.

## Fault paths

Every Get Records, DML and action element outside before-save flows gets a
`faultConnector` to meaningful handling: a message on screen flows, a
prescriptive output for agent actions, the logging mechanism the
org-conventions fault slot names elsewhere. An empty fault path that
swallows the error is worse than none. Without a fault path, the interview
fails, rolls back and emails the flow error recipient, which is not an error
strategy. When the org's fault handling is unset, list it as an open decision
(the checker's FLOW009 warning).

## Subflows

A subflow runs in the caller's transaction and shares its limits, so
extraction changes structure, not cost. Extract on reuse or a cohesive unit
with typed input and output variables, not on element count, and do not
extract a subflow that only one flow would call. Subflows are available in
after-save and before-delete record-triggered flows, not in before-save or
platform event-triggered flows. No official figure for the maximum nesting
depth was found, so do not design deep chains. Subflows listed in
org-conventions.md are called, not rebuilt.

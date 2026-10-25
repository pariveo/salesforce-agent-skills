# AI, agents, Data 360, orchestration

This area changes fastest. Everything here is licence-gated, so treat it as
an assumption until the org confirms the licence, and say so in the
deliverable.

## Contents

- Flows as agent actions
- Calling an agent from a flow
- AI-judged Decision outcomes
- Prompt templates in flows
- Data 360 in flows
- Flow Orchestration

## Flows as agent actions

Example: `Case_Get_Status_For_Agent`.

- Agentforce custom actions reference autolaunched flows (no trigger), and
  screen flows are not listed as action targets.
- At least one output must be used. Every input and output variable carries
  a `description` written as an instruction to the reasoning engine: what to
  pass, what comes back, what to do next.
- Not-found and fault paths end in a prescriptive output message instead of
  a failed interview.
- Each agent that uses the action has its own independent copy of it, so
  check every agent's copy after changing the flow's variables.
- The action runs with the flow's own context. The running user (the user
  for employee agents, the Agent User for service agents) needs the Run Flows
  permission. Choose `runInMode` deliberately, knowing that `UserMode` (org
  API 68+) enforces the user's permissions.
- Bulkify for collection inputs like any other flow.

## Calling an agent from a flow

From org API 67 (Summer '26) the Run Agent element invokes an activated
agent from a flow, and earlier AI Agent actions in the Action element open
as Run Agent with their configuration kept
([Run Agent Element](https://help.salesforce.com/s/articleView?id=platform.flow_ref_elements_create_agent.htm&type=5)).
Run Agent can also create an agent inline (Summer '26, not labelled pilot or
beta, [release note](https://help.salesforce.com/s/articleView?id=release-notes.rn_automate_flow_builder_create_agent_in_flow_builder.htm&release=262&type=5)).
The running user needs Manage AI Agents
([AI Agent Actions](https://help.salesforce.com/s/articleView?id=platform.automate_flow_ref_elements_actions_generate_ai_agent_response.htm&type=5)),
although the Run Agent page lists only View Setup for an existing agent, so
check the org. Give the element a fault path and expect latency. For a single
grounded completion, a prompt template action is lighter than an agent.

## AI-judged Decision outcomes

A Decision outcome can be defined with AI ("Define with AI (Advanced)",
introduced in Winter '26 as "Let AI Determine Conditions"). It needs
Enterprise, Performance or Unlimited with an Einstein for Sales, Einstein for
Service or Einstein Platform add-on. It is not available in record-triggered
flows, record-triggered orchestrations, record-triggered flow approval
processes or Marketing Cloud flows
([Winter '26 release note](https://help.salesforce.com/s/articleView?id=release-notes.rn_automate_use_dynamic_decisions.htm&release=258&type=5)).
AI outcomes are evaluated simultaneously, not in order
([Decision Element](https://help.salesforce.com/s/articleView?id=platform.flow_ref_elements_decision.htm&type=5)),
so order-dependent branching stays deterministic, and a plain condition
stays the default. Not verified: whether each evaluation consumes Einstein
credits. Check the org's usage and billing before designing around it.

## Prompt templates in flows

An active prompt template version appears in the Action element under
Prompt Template. For schedule- and record-triggered flows it also appears
under Prompt Template (Batch Generation), at 10,000 generations per day, or
50,000 when the model supports batch. The running user needs the Prompt
Template User permission
([Prompt Template Actions](https://help.salesforce.com/s/articleView?id=platform.flow_ref_elements_actions_generate_prompt_response.htm&type=5)). Structured output (JSON or HTML with an optional Lightning Type
schema) returns a single object, not an array. Retest the flow after editing
the template, because its output shape can change without a flow version
change.

## Data 360 in flows

Data 360 is the current name of Data Cloud
([Get Started with Data 360 Development](https://developer.salesforce.com/docs/data/data-cloud-dev/guide)).
Flow Builder and the metadata still use the old name in places.

- Get Records reads Data 360 data model objects (DMOs). Access is read only,
  needs a mapping from a data lake object (DLO) to the DMO, and is not
  available in Starter or Professional editions.
- Record-triggered flows must read Data 360 objects on the asynchronous
  path, because the synchronous path fails when it touches external data.
- Data Cloud-triggered flows (`triggerType` `DataCloudDataChange`) start
  when conditions are met in a DMO. Flow Builder still labels the type
  Data Cloud-Triggered Flow
  ([Trigger Flows with Data 360 Data](https://help.salesforce.com/s/articleView?id=platform.flow_concepts_trigger_data_cloud.htm&type=5)).
- Writes go through the `dataCloudIngestionApi` action, which Flow Builder
  introduced in Spring '24 as Send to Data Cloud, one action per Ingestion API
  connector schema
  ([release note](https://help.salesforce.com/s/articleView?id=release-notes.rn_automate_flow_builder_send_data_to_data_cloud.htm&release=248&type=5)).
  Not verified: whether the action carries the same label today.

## Flow Orchestration

Multi-step, multi-user work with per-step assignments, stages and
evaluation flows. Since Spring '26 (week of 16 February 2026) orchestration
runs are included with no usage-based limits and no add-on, in Enterprise,
Performance, Unlimited, Einstein 1 and Developer editions, and Professional
is not listed
([release note](https://help.salesforce.com/s/articleView?id=release-notes.rn_automate_orchestrator_standard_feature.htm&release=262&type=5),
[Flow Orchestration Entitlements](https://help.salesforce.com/s/articleView?id=platform.orchestrator_considerations_entitlements.htm&type=5)).
Linear single-session work stays in a plain flow, while
orchestration earns its overhead when steps span people, sessions, or
approvals with deadlines.

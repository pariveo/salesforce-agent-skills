---
description: "Trigger event from the requirement: only a change into the condition counts, so update-only, not create-and-update"
tags: [build, record-triggered, trap]
max_turns: 60
timeout_seconds: 900
allowed_tools: [Read, Glob, Grep, Skill, Write, Edit, Bash]
---

Create a record-triggered flow at force-app/main/default/flows/Lead_Hot_Rating_Call_Task.flow-meta.xml. When a sales rep raises a lead's Rating to Hot, create a Task for the lead owner to call the lead within one day. Leads that arrive already rated Hot come from web-to-lead and get their own routing, so they must not get this task. No Salesforce org is connected here, so don't try to deploy. Tell me briefly what you built.

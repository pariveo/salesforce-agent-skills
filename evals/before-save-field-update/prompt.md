---
description: "Same-record field update: before-save with change detection, no after-save Update of $Record"
tags: [build, record-triggered, smoke]
max_turns: 60
timeout_seconds: 900
allowed_tools: [Read, Glob, Grep, Skill, Write, Edit, Bash]
---

Create a record-triggered flow at force-app/main/default/flows/Case_Set_Escalation.flow-meta.xml: when a Case is created, or its Priority changes, set IsEscalated to true if Priority is High and to false otherwise. No Salesforce org is connected here, so don't try to deploy. Tell me briefly what you built.

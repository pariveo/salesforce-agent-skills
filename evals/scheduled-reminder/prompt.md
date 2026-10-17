---
description: "Date-relative timing: scheduled path with a negative offset on the record date, not a polling scheduled flow"
tags: [build, record-triggered]
max_turns: 60
timeout_seconds: 900
allowed_tools: [Read, Glob, Grep, Skill, Write, Edit, Bash]
---

Create a flow at force-app/main/default/flows/Contract_Renewal_Reminder.flow-meta.xml: 30 days before a Contract's EndDate, create a Task for the contract owner to start the renewal. Contracts are created and updated through the UI and through an integration, and EndDate can change. No Salesforce org is connected here, so don't try to deploy. Tell me briefly what you built.

---
description: "A loop that is correct (sequence numbers, escape E2) is kept and declared; DML stays outside it"
tags: [build, collections, escape]
max_turns: 60
timeout_seconds: 900
allowed_tools: [Read, Glob, Grep, Skill, Write, Edit, Bash]
---

Create an autolaunched flow at force-app/main/default/flows/Case_Number_Open_Cases.flow-meta.xml that takes an accountId. It numbers the account's open cases in the order they were created: each case's Subject gets the prefix "#1 ", "#2 ", and so on, keeping the existing subject after the prefix. Save all changes. No Salesforce org is connected here, so don't try to deploy. Tell me briefly what you built.

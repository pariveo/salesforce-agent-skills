---
description: "Audit of an existing legacy flow: ranked findings with current replacements, no edits"
tags: [audit, smoke]
max_turns: 60
timeout_seconds: 900
allowed_tools: [Read, Glob, Grep, Skill, Write, Edit, Bash]
---

Review force-app/main/default/flows/Opportunity_Legacy_Rollup.flow-meta.xml and tell me what should change and in which order. Don't edit anything yet. No Salesforce org is connected here.

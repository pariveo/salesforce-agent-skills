---
description: "Combining two collections by key: Transform InnerJoin instead of nested loops"
tags: [build, collections]
max_turns: 60
timeout_seconds: 900
allowed_tools: [Read, Glob, Grep, Skill, Write, Edit, Bash]
---

Create an autolaunched flow at force-app/main/default/flows/Contact_Match_Leads.flow-meta.xml. It takes two inputs: a collection of Contact records and a collection of Lead records, both with Email populated. For every contact whose email matches a lead's email, create a Task on the contact (WhoId) whose Subject is the matching lead's Company. No Salesforce org is connected here, so don't try to deploy. Tell me briefly what you built.

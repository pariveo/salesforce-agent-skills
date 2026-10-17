---
description: "Count in before-save: Filter + AssignCount; no Transform (deploy error) and no loop"
tags: [build, record-triggered, trap]
max_turns: 60
timeout_seconds: 900
allowed_tools: [Read, Glob, Grep, Skill, Write, Edit, Bash]
---

The custom field Account.Contacts_With_Email__c (Number) already exists. Create a record-triggered flow at force-app/main/default/flows/Account_Count_Contacts_With_Email.flow-meta.xml that keeps it current: whenever an account is saved, the field holds the number of the account's contacts that have an email address. No Salesforce org is connected here, so don't try to deploy. Tell me briefly what you built.

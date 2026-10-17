---
description: "Sum on the triggering record: stays before-save with a Loop declared E3; no Transform (deploy error) and no after-save update of $Record"
tags: [build, record-triggered, trap]
max_turns: 60
timeout_seconds: 900
allowed_tools: [Read, Glob, Grep, Skill, Write, Edit, Bash]
---

The custom field Account.Installed_Asset_Value__c (Currency) already exists. Create a record-triggered flow at force-app/main/default/flows/Account_Sum_Installed_Asset_Value.flow-meta.xml that keeps it current: whenever an account is saved, the field holds the total Price of the account's assets whose Status is Installed. No Salesforce org is connected here, so don't try to deploy. Tell me briefly what you built.

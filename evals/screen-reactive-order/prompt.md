---
description: "Screen flow: record choice set, reactive total on one screen, component validation, conditional visibility, recordId contract"
tags: [build, screens, smoke]
max_turns: 60
timeout_seconds: 900
allowed_tools: [Read, Glob, Grep, Skill, Write, Edit, Bash]
---

Create a screen flow at force-app/main/default/flows/Account_Quick_Order.flow-meta.xml that runs as a quick action on the Account record page. The user picks one of the account's contacts, enters a quantity (whole number, 1 to 500) and a unit price, and sees the order total update while typing. If the quantity is above 100 they must also give a reason. The flow returns the chosen contact's Id to the page. No Salesforce org is connected here, so don't try to deploy. Tell me briefly what you built.

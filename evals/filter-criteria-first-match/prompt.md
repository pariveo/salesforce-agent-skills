---
description: "One record from a collection: Collection Filter Criteria resource instead of a loop that keeps the first match"
tags: [build, collections]
max_turns: 60
timeout_seconds: 900
allowed_tools: [Read, Glob, Grep, Skill, Write, Edit, Bash]
---

Create an autolaunched flow at force-app/main/default/flows/Account_Task_Next_Closing_Deal.flow-meta.xml. It takes an accountId and a minAmount (number). It gets the account's open opportunities, picks the one with Amount at or above minAmount that closes soonest, and creates one Task on that opportunity (related to it, owned by the opportunity owner, due on its close date). If no opportunity qualifies, it creates nothing. No Salesforce org is connected here, so don't try to deploy. Tell me briefly what you built.

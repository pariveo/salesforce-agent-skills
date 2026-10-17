---
description: "Collection work: Filter + Transform Sum/Count/Map + one bulk Create instead of a loop"
tags: [build, collections, smoke]
max_turns: 60
timeout_seconds: 900
allowed_tools: [Read, Glob, Grep, Skill, Write, Edit, Bash]
---

Create an autolaunched flow at force-app/main/default/flows/Opportunity_Summarize_Large_Deals.flow-meta.xml. It takes an input minAmount (currency). It looks at open opportunities, keeps the ones with Amount at or above minAmount, returns their total amount and how many there are as outputs, and creates one follow-up Task per kept opportunity (Subject "Follow up: " plus the opportunity name, related to the opportunity). No Salesforce org is connected here, so don't try to deploy. Tell me briefly what you built.

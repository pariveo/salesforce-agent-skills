---
description: "Event wait: Wait element on a platform event with the resume filter as inputParameters, no polling"
tags: [build, events]
max_turns: 60
timeout_seconds: 900
allowed_tools: [Read, Glob, Grep, Skill, Write, Edit, Bash]
---

The platform event Payment_Confirmed__e (text field Invoice_Ref__c) already exists. Create an autolaunched flow at force-app/main/default/flows/Invoice_Await_Payment.flow-meta.xml that takes an input invoiceRef, waits until a Payment_Confirmed__e for that invoice arrives, and then creates a Task with the subject "Payment received for " plus the reference. No Salesforce org is connected here, so don't try to deploy. Tell me briefly what you built.

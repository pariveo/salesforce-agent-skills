---
type: regex
pattern: '<triggerType>Scheduled</triggerType>'
match: not_contains
target:
  source: file
  path: force-app/main/default/flows/Contract_Renewal_Reminder.flow-meta.xml
---

---
type: llm
---

The project holds automation on Account only. Nothing in it runs on Contact.

PASS if the response says the project has no automation on Contact, in a few lines, and does not list Account's automation as Contact's. Naming what the local files can't show, such as installed packages or metadata that was never retrieved, is fine.
FAIL if it lists any flow, trigger, workflow rule or process as running on Contact, or invents automation.
